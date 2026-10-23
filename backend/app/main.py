"""Valhalla SOC API: crea la aplicación, aplica el middleware de seguridad y une los routers.

La lógica vive en módulos por dominio:
  routers/   endpoints HTTP (auth, users, incidents, siem, intel, reports, chat, settings)
  services/  lógica compartida (incidentes, firewall, invitaciones, IA del chat, informes…)
  realtime   WebSocket del chat, presencia y avisos de sesión
  startup    preparación al arrancar (esquema, ajustes, usuarios de sistema, semillas)
"""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.db import engine
from app.health import router as health_router
from app.limits import limiter
from app.logger import logger
from app.lsa_monitor import router as lsa_router
from app.middlewares import AuditMiddleware, SecurityHeadersMiddleware
from app.realtime import router as realtime_router
from app.routers import auth, chat, incidents, intel, reports, siem, users
from app.routers import settings as settings_router
from app.security import SecurityMiddleware, rate_limit_middleware
from app.services.tasks import _drain_background_tasks
from app.settings import settings
from app.startup import _startup

# Reexportados para la suite de pruebas, que los sustituye o inspecciona desde `app.main`
# (un import por línea, cada uno con su noqa: el linter no debe quitarlos)
from app import grc_builder  # noqa: F401,E402,I001
from app import opensearch_client as osc  # noqa: F401,E402,I001
from app import tailscale as ts  # noqa: F401,E402,I001
from app.db import SessionLocal  # noqa: F401,E402,I001
from app.realtime import ConnectionManager, _ts_mismatch, manager  # noqa: F401,E402,I001
from app.services.tasks import _background_loops, _background_tasks, _spawn  # noqa: F401,E402,I001
from app.wazuh_client import wazuh  # noqa: F401,E402,I001


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Ciclo de vida de la API (sustituye a los obsoletos @app.on_event startup/shutdown).

    Arranque: esquema y migraciones, ajustes, usuarios y datos semilla, sincronización con
    Wazuh. Apagado: termina o cancela las tareas en segundo plano y cierra el pool de la base de datos.
    """
    try:
        await _startup()  # si falla, también se cierran el pool y las tareas ya lanzadas
        yield
    finally:
        await _drain_background_tasks()
        await engine.dispose()
        logger.info("Valhalla SOC API detenida")


_docs_url = None if settings.env.lower() == "production" else "/docs"
_openapi_url = None if settings.env.lower() == "production" else "/openapi.json"
app = FastAPI(title="Valhalla SOC API", version="2.0.0", docs_url=_docs_url, openapi_url=_openapi_url, lifespan=lifespan)

# ── Seguridad de cada petición ──
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.middleware("http")(rate_limit_middleware)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(SecurityMiddleware)
app.add_middleware(AuditMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list(),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-CSRF-Token", "Accept"],
)

# ── Endpoints ──
for router in (lsa_router, health_router, realtime_router, auth.router, users.router, incidents.router,
               settings_router.router, siem.router, reports.router, intel.router, chat.router):
    app.include_router(router)


@app.exception_handler(Exception)
async def _unhandled_exception_handler(request: Request, exc: Exception):
    if isinstance(exc, HTTPException):
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    if settings.env.lower() == "production":
        return JSONResponse(status_code=500, content={"detail": "Error interno del servidor"})
    return JSONResponse(status_code=500, content={"detail": str(exc)})


@app.get("/health")
async def health():
    return {"status": "ok", "version": "2.0.0"}
