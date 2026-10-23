"""Middleware propio: cabeceras de seguridad y auditoría de toda escritura (sin guardar el cuerpo)."""
from __future__ import annotations

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

from app.client_info import real_ip
from app.db import SessionLocal
from app.logger import logger
from app.models import AuditLog
from app.services.tasks import _spawn


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=(), payment=()"
        return response


class AuditMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        if request.method in ["POST", "PUT", "DELETE", "PATCH"] and request.url.path.startswith("/api/"):
            user = getattr(request.state, "user", None)
            async def log_action():
                # Un fallo aquí no debe perderse en silencio: la auditoría es obligatoria
                try:
                    async with SessionLocal() as db:
                        db.add(AuditLog(
                            user_id=user.id if user else None,
                            username=user.username if user else "anonymous",
                            action=request.method,
                            route=request.url.path,
                            ip_address=real_ip(request.client.host if request.client else None, request.headers) or None,
                            status_code=response.status_code,  # nunca se guarda el cuerpo (contraseñas, claves)
                        ))
                        await db.commit()
                except Exception as e:  # noqa: BLE001
                    logger.error("No se pudo registrar la auditoría de %s %s: %s", request.method, request.url.path, e)
            _spawn(log_action())
        return response
