from __future__ import annotations

import os
import time
import asyncio
import logging
import shutil
import re as _re
import hmac
import hashlib
from datetime import datetime, timezone, timedelta
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Request, Response, UploadFile, File, WebSocket, WebSocketDisconnect, Query, Path
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
import json
import uuid
import secrets
from starlette.middleware.base import BaseHTTPMiddleware
from sqlalchemy import select, desc, func, delete, or_, text, inspect
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from app.db import get_db, engine, SessionLocal
from app.models import *
from app.schemas import *
from app.auth import (
    get_password_hash,
    verify_password,
    create_access_token_with_meta,
    create_refresh_token_with_meta,
    get_current_user,
    get_current_user_optional,
    require_role,
    require_admin,
    get_user_from_token,
    decode_token_payload,
    validate_access_token,
    revoke_tokens_from_request,
    revoke_token_jti,
    purge_expired_revoked_tokens,
    set_auth_cookies,
    TOKEN_TYPE_REFRESH,
    is_token_revoked,
)
from app.settings import settings
from app.logger import logger
from app.security import (
    InputValidator, 
    rate_limiter, 
    SecurityMiddleware,
    check_user_blocked,
    rate_limit_middleware
)
from app.crypto import encrypt_secret, decrypt_secret
from app import opensearch_client as osc
from app.wazuh_client import wazuh
from app.ollama_client import analyze_alert, generate_executive_summary, chat_assistant, draft_social_post
from app import cve_feed
from app import virustotal_client as vt
from app import report_builder as rb
from app import grc_builder
from app import abuseipdb_client as abuse
from app.rag import build_knowledge
from app import hunting
from app.lsa_monitor import router as lsa_router
from app.health import router as health_router
from app.threat_map import get_threat_map_data
from app.runbooks_seed import seed_runbooks_if_empty
from app.http_tls import httpx_verify

# --- MIDDLEWARES ---

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
                            ip_address=request.client.host if request.client else None,
                            status_code=response.status_code,  # nunca se guarda el cuerpo (contraseñas, claves)
                        ))
                        await db.commit()
                except Exception as e:  # noqa: BLE001
                    logger.error("No se pudo registrar la auditoría de %s %s: %s", request.method, request.url.path, e)
            asyncio.create_task(log_action())
        return response

# --- APP INIT ---

limiter = Limiter(key_func=get_remote_address)
_docs_url = None if settings.env.lower() == "production" else "/docs"
_openapi_url = None if settings.env.lower() == "production" else "/openapi.json"
app = FastAPI(title="Valhalla SOC API", version="2.0.0", docs_url=_docs_url, openapi_url=_openapi_url)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.middleware("http")(rate_limit_middleware)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(SecurityMiddleware)
app.add_middleware(AuditMiddleware)

_cors_origins = settings.cors_origins_list()
_cors_methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
_cors_headers = ["Content-Type", "Authorization", "X-CSRF-Token", "Accept"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=_cors_methods,
    allow_headers=_cors_headers,
)

app.include_router(lsa_router)
app.include_router(health_router)


@app.exception_handler(Exception)
async def _unhandled_exception_handler(request: Request, exc: Exception):
    if isinstance(exc, HTTPException):
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    if settings.env.lower() == "production":
        return JSONResponse(status_code=500, content={"detail": "Error interno del servidor"})
    return JSONResponse(status_code=500, content={"detail": str(exc)})


# --- BACKGROUND TASKS ---

def _monitor_tokens(m: "Monitor") -> set[str]:
    return {t.strip().lower() for t in (m.rule_id_pattern or "").split(",") if t.strip()}


def _monitor_matches(m: "Monitor", alert: dict[str, Any]) -> bool:
    """Coincide si el ID de regla o alguno de los grupos de la alerta está en el patrón del monitor."""
    tokens = _monitor_tokens(m)
    if not tokens:
        return False
    return str(alert.get("rule_id", "")).lower() in tokens or any(str(g).lower() in tokens for g in alert.get("groups") or [])


async def _sync_wazuh_alerts_to_tickets(hours: int = 1) -> dict[str, Any]:
    """Escala alertas de Wazuh a incidentes aplicando los monitores.

    - Alerta que coincide con un monitor activo: se escala solo si su severidad alcanza la
      mínima del monitor y el monitor acumula al menos `threshold` alertas en la ventana.
      (Antes los monitores se guardaban pero no se aplicaban.)
    - Alerta sin monitor: se escala si es de severidad alta o crítica (comportamiento anterior).
    """
    alerts = await osc.get_recent_alerts(limit=500, hours=hours)
    created = linked = skipped = 0
    error: str | None = None
    try:
        async with SessionLocal() as db:
            admin = (await db.execute(select(User).where(User.username == "admin"))).scalar_one_or_none()
            monitors = (await db.execute(select(Monitor).where(Monitor.enabled.is_(True)))).scalars().all()
            hits = {m.id: sum(1 for a in alerts if _monitor_matches(m, a)) for m in monitors}
            for alert in alerts:
                if not alert.get("id"):
                    skipped += 1
                    continue
                sev = alert.get("severity") or "low"
                matched = [m for m in monitors if _monitor_matches(m, alert)]
                trigger = next((m for m in matched if SEVERITY_RANK.get(sev, 0) >= SEVERITY_RANK.get(m.severity_floor, 0)
                                and hits[m.id] >= m.threshold), None)
                if matched and not trigger:
                    skipped += 1
                    continue
                if not matched and sev not in ("high", "critical"):
                    skipped += 1
                    continue
                ticket, outcome = await _ingest_alert(db, {**alert, "alert_id": alert["id"]}, admin)
                if outcome == "created":
                    created += 1
                    if trigger:
                        _log_event(db, ticket.id, admin, "monitor",
                                   f"Escalado por el monitor «{trigger.name}»: {hits[trigger.id]} alertas en {hours} h (umbral {trigger.threshold}, severidad mínima {trigger.severity_floor})")
                elif outcome == "linked":
                    linked += 1
                else:
                    skipped += 1
            if created or linked:
                await db.commit()
                logger.info(f"Wazuh sync: {created} incidentes nuevos, {linked} alertas vinculadas")
    except Exception as e:
        error = str(e)
        logger.warning(f"Wazuh sync failed: {e}")
    return {"created": created, "linked": linked, "skipped": skipped, "error": error}


async def _auto_sync_loop():
    """Background task: sync Wazuh alerts (solo si AUTO_SYNC_WAZUH_TICKETS=true)."""
    if not settings.auto_sync_wazuh_tickets:
        return
    await asyncio.sleep(30)
    while True:
        await _sync_wazuh_alerts_to_tickets(hours=1)
        await asyncio.sleep(120)


def _can_access_ticket(user: User, ticket: Ticket) -> bool:
    if user.role in ("admin", "analyst", "analista", "reporter"):
        return True
    if user.role == "viewer":
        return ticket.assigned_to_id == user.id or ticket.reporter_id == user.id
    return False


def _require_ticket_access(user: User, ticket: Ticket) -> None:
    if not _can_access_ticket(user, ticket):
        raise HTTPException(403, "No tienes permiso para acceder a este ticket")


ACTIVE_TICKET_STATUSES = frozenset({"open", "in_progress", "escalated"})


def _can_delete_tickets(user: User) -> bool:
    return user.role.lower() in ("admin", "analyst", "analista")


def _tickets_assignee_filter(q, user: User):
    """Q ya es select(Ticket)... Restringe visibilidad como en workspace."""
    if user.role == "viewer":
        return q.where(
            or_(
                Ticket.assigned_to_id == user.id,
                Ticket.reporter_id == user.id,
            )
        )
    if user.role.lower() in ("analista", "analyst"):
        return q.where(
            or_(Ticket.assigned_to_id.is_(None), Ticket.assigned_to_id == user.id)
        )
    return q


_DM_RE = _re.compile(r"^dm:(\d{1,10})-(\d{1,10})$")


def _dm_members(chat_id: str) -> tuple[int, int] | None:
    """Participantes de un chat privado `dm:<menor>-<mayor>`; None si el id no es válido."""
    m = _DM_RE.match(chat_id or "")
    if not m:
        return None
    a, b = int(m.group(1)), int(m.group(2))
    return (a, b) if a < b else None


def _can_access_chat(user: User, chat_id: str) -> bool:
    """global: cualquier usuario autenticado. DM: solo sus dos participantes.

    Antes un admin podía leer cualquier conversación privada y se aceptaban ids como
    `dm:1-2-3`; la privacidad de los mensajes directos es ahora estricta (RGPD).
    """
    if chat_id == "global":
        return True
    members = _dm_members(chat_id)
    return bool(members and user.id in members)


def _require_chat_access(user: User, chat_id: str) -> None:
    if not _can_access_chat(user, chat_id):
        raise HTTPException(403, "No tienes permiso para acceder a este chat")


def _verify_webhook_auth(request: Request, body: bytes) -> None:
    """Token compartido o firma HMAC-SHA256 del cuerpo (X-Valhalla-Signature)."""
    if not settings.webhook_secret:
        logger.error("WEBHOOK_SECRET no configurado — rechazando webhook")
        raise HTTPException(503, "Webhook no configurado")
    secret = settings.webhook_secret.encode()
    token = request.headers.get("X-Valhalla-Webhook-Token") or request.headers.get("X-Wazuh-Integration-Key")
    if token and secrets.compare_digest(token, settings.webhook_secret):
        return
    sig_header = (request.headers.get("X-Valhalla-Signature") or "").strip()
    if sig_header and body:
        expected = hmac.new(secret, body, hashlib.sha256).hexdigest()
        provided = sig_header.removeprefix("sha256=").strip()
        if secrets.compare_digest(provided, expected):
            return
    raise HTTPException(401, "Webhook no autorizado")


ALLOWED_AVATAR_EXT = {".jpg", ".jpeg", ".png", ".webp", ".gif"}


def _safe_evidence_filename(raw: str) -> str:
    base = os.path.basename(raw or "file")
    base = _re.sub(r"[^\w.\-]", "_", base)
    return base[:200] or "evidence.bin"


ALLOWED_EVIDENCE_EXT = {".png", ".jpg", ".jpeg", ".gif", ".pdf", ".txt", ".log", ".json", ".csv", ".pcap", ".zip"}


def _migrate_users_rank_column(sync_conn) -> None:
    """Renombra users.rank → security_rank en BDs creadas antes de la rama Rosa."""
    if "users" not in inspect(sync_conn).get_table_names():
        return
    cols = {c["name"] for c in inspect(sync_conn).get_columns("users")}
    if "rank" in cols and "security_rank" not in cols:
        sync_conn.execute(text("ALTER TABLE users RENAME COLUMN rank TO security_rank"))
        logger.info("Migración DB: users.rank → users.security_rank")


def _migrate_tickets_resolved_at(sync_conn) -> None:
    """Añade tickets.resolved_at (necesario para medir el tiempo de resolución / MTTR)."""
    if "tickets" not in inspect(sync_conn).get_table_names():
        return
    cols = {c["name"] for c in inspect(sync_conn).get_columns("tickets")}
    if "resolved_at" not in cols:
        sync_conn.execute(text("ALTER TABLE tickets ADD COLUMN resolved_at TIMESTAMP WITH TIME ZONE"))
        sync_conn.execute(text("UPDATE tickets SET resolved_at = updated_at WHERE status = 'resolved'"))
        logger.info("Migración DB: tickets.resolved_at")


# Columnas añadidas después de la primera versión (create_all no altera tablas existentes).
_ADDED_COLUMNS: dict[str, dict[str, str]] = {
    "audit_logs": {"status_code": "INTEGER"},
    "tickets": {"classification": "VARCHAR(32)"},
    "evidence": {
        "sha256": "VARCHAR(64)",
        "uploaded_by_id": "INTEGER REFERENCES users(id) ON DELETE SET NULL",
        "uploaded_by_username": "VARCHAR(64)",
    },
}


def _migrate_added_columns(sync_conn) -> None:
    insp = inspect(sync_conn)
    tables = set(insp.get_table_names())
    for table, cols in _ADDED_COLUMNS.items():
        if table not in tables:
            continue
        existing = {c["name"] for c in insp.get_columns(table)}
        for col, ddl in cols.items():
            if col not in existing:
                sync_conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {ddl}"))
                logger.info(f"Migración DB: {table}.{col}")


def _track_resolution(t: "Ticket", new_status: str | None) -> None:
    """Fija o limpia resolved_at según el estado."""
    if new_status == "resolved" and t.resolved_at is None:
        t.resolved_at = datetime.now(timezone.utc)
    elif new_status and new_status != "resolved":
        t.resolved_at = None
        t.classification = None


STATUS_LABEL_ES = {"open": "Triaje", "in_progress": "Investigación", "escalated": "Contención", "resolved": "Resuelto", "closed": "Cerrado"}
CLASSIFICATION_LABEL_ES = {"true_positive": "verdadero positivo", "false_positive": "falso positivo", "benign": "benigno"}
SEVERITY_RANK = {"low": 0, "medium": 1, "high": 2, "critical": 3}
ALERT_CORRELATION_WINDOW = timedelta(hours=24)


def _log_event(db: AsyncSession, ticket_id: int, user: "User | None", kind: str, message: str) -> None:
    """Añade una entrada a la línea de tiempo del incidente (sin commit)."""
    db.add(TicketEvent(
        ticket_id=ticket_id,
        user_id=user.id if user else None,
        username=user.username if user else "sistema",
        kind=kind,
        message=message[:2000],
    ))


async def _ingest_alert(db: AsyncSession, alert: dict[str, Any], actor: "User | None") -> tuple["Ticket", str]:
    """Convierte una alerta de Wazuh en incidente o la vincula a uno activo.

    Correlación: incidente activo creado en las últimas 24 h con la misma IP origen;
    si la alerta no trae IP, con la misma regla en el mismo agente.
    Devuelve (ticket, "created" | "linked" | "duplicate"). No hace commit.
    """
    alert_id = str(alert["alert_id"])
    dup = (await db.execute(select(TicketAlert).where(TicketAlert.alert_id == alert_id).limit(1))).scalar_one_or_none()
    if dup:
        return (await db.get(Ticket, dup.ticket_id)), "duplicate"

    since = datetime.now(timezone.utc) - ALERT_CORRELATION_WINDOW
    q = select(Ticket).where(Ticket.status.in_(ACTIVE_TICKET_STATUSES), Ticket.created_at >= since)
    ip = alert.get("source_ip") or None
    if ip:
        q = q.where(Ticket.source_ip == ip)
    else:
        q = (q.join(TicketAlert, TicketAlert.ticket_id == Ticket.id)
              .where(TicketAlert.rule_id == str(alert.get("rule_id") or ""),
                     TicketAlert.agent_name == (alert.get("agent_name") or None)))
    ticket = (await db.execute(q.order_by(desc(Ticket.created_at)).limit(1))).scalars().first()

    severity = alert.get("severity") or "medium"
    link = TicketAlert(
        alert_id=alert_id,
        rule_id=str(alert.get("rule_id") or "") or None,
        rule_level=alert.get("rule_level"),
        description=(alert.get("description") or "")[:1000] or None,
        source_ip=ip,
        agent_name=alert.get("agent_name") or None,
        alert_timestamp=alert.get("timestamp") or None,
    )
    if ticket:
        link.ticket_id = ticket.id
        db.add(link)
        if SEVERITY_RANK.get(severity, 0) > SEVERITY_RANK.get(ticket.severity, 0):
            _log_event(db, ticket.id, actor, "severity", f"Severidad elevada de {ticket.severity} a {severity} por una alerta vinculada")
            ticket.severity = severity
        _log_event(db, ticket.id, actor, "alert_linked", f"Alerta vinculada (regla {link.rule_id or '?'}): {link.description or ''}")
        return ticket, "linked"

    ticket = Ticket(
        title=f"Wazuh: {alert.get('description') or 'Alerta'}"[:200],
        description=(
            f"Origen: {ip or 'N/A'}\nAgente: {alert.get('agent_name') or 'N/A'}\n"
            f"Regla: {alert.get('rule_id') or '?'} (nivel {alert.get('rule_level') if alert.get('rule_level') is not None else '?'})\n\n"
            f"{alert.get('description') or ''}"
        ),
        severity=severity,
        category="wazuh-alert",
        source_ip=ip,
        affected_asset=alert.get("agent_name") or "Manager",
        wazuh_alert_id=alert_id,
        mitre_technique=alert.get("mitre_technique") or None,
        reporter_id=actor.id if actor else None,
        status="open",
    )
    db.add(ticket)
    await db.flush()
    link.ticket_id = ticket.id
    db.add(link)
    _log_event(db, ticket.id, actor, "created", "Incidente creado a partir de una alerta de Wazuh")
    return ticket, "created"


@app.on_event("startup")
async def on_startup():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(_migrate_users_rank_column)
        await conn.run_sync(_migrate_tickets_resolved_at)
        await conn.run_sync(_migrate_added_columns)
    await _load_runtime_settings()
    
    # Bootstrap admin solo si ADMIN_PASSWORD está definido (nunca hardcodeado)
    async with SessionLocal() as db:
        if not (await db.execute(select(User).where(User.username == "admin"))).scalar_one_or_none():
            if settings.admin_password:
                InputValidator.validate_password(settings.admin_password)
                db.add(User(
                    username="admin",
                    password_hash=get_password_hash(settings.admin_password),
                    role="admin",
                    security_rank="Commander",
                ))
                logger.info("Usuario admin creado desde ADMIN_PASSWORD")
            elif settings.env.lower() == "production":
                raise RuntimeError(
                    "CRITICAL: No existe usuario admin y ADMIN_PASSWORD vacío con ENV=production."
                )
            else:
                logger.warning(
                    "Sin usuario admin y ADMIN_PASSWORD vacío — cree un admin con scripts/reset_admin.py"
                )
        
        # Usuario de sistema para el asistente IA del chat (VALHALLA-IA)
        if not (await db.execute(select(User).where(User.username == "valhalla-ia"))).scalar_one_or_none():
            db.add(User(
                username="valhalla-ia",
                password_hash=get_password_hash(secrets.token_urlsafe(32)),
                role="viewer",
                security_rank="AI",
            ))
            logger.info("Usuario de sistema VALHALLA-IA creado")

        if not (await db.execute(select(Monitor))).scalars().first():
            defaults = [
                ("SSH Bruteforce", "Intentos masivos SSH — reglas 5710/5712", 5, "high", "5710,5712"),
                ("Cowrie Honeypot", "Eventos en señuelo Cowrie", 10, "medium", "cowrie"),
                ("Web Attack", "Inyección SQL/XSS en aplicaciones", 1, "high", "31103,31106"),
                ("Privilege Escalation", "Escalada de privilegios", 3, "critical", "550,551"),
                ("Malware Detection", "Ejecutables o scripts sospechosos", 1, "critical", "554,750"),
            ]
            for name, desc, thr, sev, pat in defaults:
                db.add(Monitor(
                    name=name, description=desc, threshold=thr,
                    severity_floor=sev, rule_id_pattern=pat, enabled=True,
                ))
        await seed_runbooks_if_empty(db)
        await purge_expired_revoked_tokens(db)
        await db.commit()
    
    if settings.auto_sync_wazuh_tickets:
        asyncio.create_task(_auto_sync_loop())
    logger.info("Valhalla SOC API Started")

# --- WEBSOCKET CHAT ---

class ConnectionManager:
    """Conexiones WebSocket por usuario.

    Antes todas las conexiones recibían todos los mensajes, incluidos los privados de
    otros usuarios (el filtrado lo hacía el navegador). Ahora el servidor decide quién
    recibe cada evento y mantiene la presencia (usuarios conectados y su rol).
    """

    def __init__(self):
        self.active_connections: dict[WebSocket, dict[str, Any]] = {}

    async def connect(self, websocket: WebSocket, user: User):
        await websocket.accept()
        self.active_connections[websocket] = {"id": user.id, "username": user.username, "role": user.role}
        await self.broadcast_presence()

    async def disconnect(self, websocket: WebSocket):
        if self.active_connections.pop(websocket, None) is not None:
            await self.broadcast_presence()

    def online(self) -> list[dict[str, Any]]:
        seen: dict[int, dict[str, Any]] = {}
        for info in self.active_connections.values():
            u = seen.setdefault(info["id"], {**info, "sessions": 0})
            u["sessions"] += 1
        return sorted(seen.values(), key=lambda u: u["username"].lower())

    async def _send(self, message: Any, allowed=lambda info: True):
        if not isinstance(message, str):
            message = json.dumps(message)
        for ws, info in list(self.active_connections.items()):
            if not allowed(info):
                continue
            try:
                await ws.send_text(message)
            except Exception:
                self.active_connections.pop(ws, None)

    async def broadcast(self, message: Any):
        """Eventos para todos los usuarios autenticados (alertas del SIEM, chat global)."""
        await self._send(message)

    async def send_chat(self, chat_id: str, message: Any):
        """Evento de un chat: global a todos; DM solo a sus dos participantes."""
        if chat_id == "global":
            await self._send(message)
            return
        members = _dm_members(chat_id)
        if members:
            await self._send(message, lambda info: info["id"] in members)

    async def broadcast_presence(self):
        await self._send({"type": "PRESENCE", "users": self.online()})

manager = ConnectionManager()

def _ws_origin_allowed(websocket: WebSocket) -> bool:
    """Evita el secuestro del WebSocket desde otra web (CSWSH): la cookie de sesión viaja sola.

    Sin cabecera Origin (clientes no navegador con Bearer) se permite; si la hay, debe
    estar en CORS_ORIGINS o coincidir con el Host de la petición.
    """
    origin = websocket.headers.get("origin")
    if not origin:
        return True
    host = websocket.headers.get("host", "")
    return origin in _cors_origins or origin.split("://", 1)[-1] == host


@app.websocket("/ws/chat")
async def websocket_endpoint(websocket: WebSocket):
    if not _ws_origin_allowed(websocket):
        logger.warning("WebSocket rechazado por origen: %s", websocket.headers.get("origin"))
        await websocket.close(code=1008)
        return
    token = websocket.cookies.get("access_token")
    if not token:
        auth_header = websocket.headers.get("authorization", "")
        if auth_header.lower().startswith("bearer "):
            token = auth_header.split(" ", 1)[1].strip()
    async with SessionLocal() as db:
        try:
            await validate_access_token(token or "", db)
        except HTTPException:
            await websocket.close(code=1008)
            return
        user = await get_user_from_token(token, db)
        if not user:
            await websocket.close(code=1008)
            return
    await manager.connect(websocket, user)
    try:
        while True:
            await websocket.receive_text()  # Keep alive
    except WebSocketDisconnect:
        pass
    finally:
        await manager.disconnect(websocket)


@app.get("/api/presence")
async def presence(current: User = Depends(get_current_user)):
    """Usuarios conectados ahora mismo (para trabajar varios analistas a la vez)."""
    return manager.online()

# --- ENDPOINTS ---

@app.get("/health")
async def health(): return {"status": "ok", "version": "2.0.0"}

# AUTH
@app.post("/api/auth/login", response_model=Token)
@limiter.limit("5/minute")
async def login(request: Request, response: Response, req: LoginRequest, db: AsyncSession = Depends(get_db)):
    client_ip = request.client.host if request.client else "unknown"
    
    # Validate and sanitize
    username = InputValidator.validate_username(req.username)
    InputValidator.validate_password(req.password)
    check_user_blocked(username)
    
    user = (await db.execute(select(User).where(User.username == username))).scalar_one_or_none()
    
    if not user or not verify_password(req.password, user.password_hash):
        rate_limiter.record_failed_login(req.username, client_ip)
        raise HTTPException(401, "Credenciales inválidas")
    
    rate_limiter.record_successful_login(username)
    # El AuditMiddleware lee request.state.user: así el login queda registrado a nombre del usuario.
    request.state.user = user
    access_token, _, _ = create_access_token_with_meta(user.username)
    refresh_token, _, _ = create_refresh_token_with_meta(user.username)
    csrf = request.cookies.get("csrf_token") or secrets.token_urlsafe(32)
    set_auth_cookies(response, access_token=access_token, refresh_token=refresh_token, csrf_token=csrf)
    return Token(
        access_token=access_token,
        expires_in=settings.access_token_expire_minutes * 60,
    )


@app.post("/api/auth/refresh", response_model=Token)
@limiter.limit("30/minute")
async def refresh_session(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    raw = request.cookies.get("refresh_token")
    if not raw:
        raise HTTPException(401, "Refresh token no presente")
    payload = decode_token_payload(raw)
    if not payload or payload.get("typ") != TOKEN_TYPE_REFRESH:
        raise HTTPException(401, "Refresh token inválido")
    if await is_token_revoked(payload.get("jti"), db):
        raise HTTPException(401, "Sesión revocada")
    username = payload.get("sub")
    if not username:
        raise HTTPException(401, "Refresh token inválido")
    user = (await db.execute(select(User).where(User.username == username))).scalar_one_or_none()
    if not user:
        raise HTTPException(401, "Usuario no encontrado")

    exp = payload.get("exp")
    if isinstance(exp, (int, float)):
        expires_at = datetime.fromtimestamp(exp, tz=timezone.utc)
        await revoke_token_jti(payload.get("jti", ""), expires_at, db)

    access_token, _, _ = create_access_token_with_meta(user.username)
    refresh_token, _, refresh_exp = create_refresh_token_with_meta(user.username)
    csrf = request.cookies.get("csrf_token") or secrets.token_urlsafe(32)
    set_auth_cookies(response, access_token=access_token, refresh_token=refresh_token, csrf_token=csrf)
    return Token(
        access_token=access_token,
        expires_in=settings.access_token_expire_minutes * 60,
    )


@app.post("/api/auth/logout")
async def logout(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_user_optional),
):
    await revoke_tokens_from_request(request, db)
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/api/auth")
    response.delete_cookie("csrf_token", path="/")
    return {"ok": True}


@app.get("/api/auth/me/session")
async def my_session(request: Request, current: User = Depends(get_current_user)):
    client_ip = request.client.host if request.client else "unknown"
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        client_ip = forwarded.split(",")[0].strip()
    return {
        "username": current.username,
        "ip": client_ip,
        "user_agent": request.headers.get("User-Agent", "unknown"),
        "expires_minutes": settings.access_token_expire_minutes,
    }


@app.get("/api/users", response_model=list[UserOut])
async def list_users_ep(db: AsyncSession = Depends(get_db), current: User = Depends(require_admin)):
    rows = (await db.execute(select(User))).scalars().all()
    return rows

@app.post("/api/users", response_model=UserOut)
async def create_user_ep(req: UserCreate, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    if current.role != "admin": raise HTTPException(403, "Forbidden")
    # Check if exists
    existing = (await db.execute(select(User).where(User.username == req.username))).scalar_one_or_none()
    if existing: raise HTTPException(400, "Username already exists")
    
    new_user = User(
        username=req.username,
        email=req.email,
        password_hash=get_password_hash(req.password),
        role=req.role,
        security_rank=req.security_rank
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    return new_user

@app.put("/api/users/{user_id}", response_model=UserOut)
async def update_user_ep(user_id: int, req: UserUpdate, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    if current.role != "admin" and current.id != user_id: raise HTTPException(403, "Forbidden")
    u = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not u: raise HTTPException(404, "User not found")
    
    is_admin = current.role == "admin"

    # Identidad y privilegios: solo un administrador puede cambiarlos.
    if (req.username or req.role or req.security_rank) and not is_admin:
        raise HTTPException(403, "Solo un administrador puede cambiar usuario, rol o rango")
    if req.username: u.username = InputValidator.validate_username(req.username)
    if req.role: u.role = req.role
    if req.security_rank: u.security_rank = req.security_rank
    if req.email: u.email = InputValidator.validate_email(req.email)

    # El avatar solo puede quitarse ("") o apuntar a una imagen subida al propio servidor.
    if req.avatar_url is not None:
        if req.avatar_url and not req.avatar_url.startswith("/api/avatars/"):
            raise HTTPException(400, "avatar_url no permitido")
        u.avatar_url = req.avatar_url

    if req.password:
        InputValidator.validate_password(req.password)
        # Cambio de la propia contraseña: exige la actual (evita secuestro con una sesión abierta).
        if current.id == u.id and not (req.current_password and verify_password(req.current_password, u.password_hash)):
            raise HTTPException(400, "La contraseña actual no es correcta")
        u.password_hash = get_password_hash(req.password)

    await db.commit()
    return u

@app.post("/api/users/me/avatar")
async def upload_my_avatar(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user)
):
    upload_dir = os.path.abspath("uploads/avatars")
    os.makedirs(upload_dir, exist_ok=True)
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_AVATAR_EXT:
        raise HTTPException(400, f"Extensión no permitida. Use: {', '.join(sorted(ALLOWED_AVATAR_EXT))}")
    header = await file.read(2048)
    try:
        import magic

        mime = magic.from_buffer(header, mime=True) or ""
        if not mime.startswith("image/"):
            raise HTTPException(400, "El archivo no es una imagen válida")
    except ImportError:
        pass
    filename = f"avatar_{current.id}{ext}"
    file_path = os.path.join(upload_dir, filename)
    real_path = os.path.realpath(file_path)
    if not real_path.startswith(upload_dir):
        raise HTTPException(400, "Ruta de archivo inválida")

    with open(real_path, "wb") as buffer:
        buffer.write(header)
        shutil.copyfileobj(file.file, buffer)
    
    current.avatar_url = f"/api/avatars/{filename}"
    await db.commit()
    return {"avatar_url": current.avatar_url}

@app.get("/api/avatars/{filename}")
async def get_avatar_file(filename: str, current: User = Depends(get_current_user)):
    safe_name = os.path.basename(filename)
    upload_dir = os.path.abspath("uploads/avatars")
    path = os.path.realpath(os.path.join(upload_dir, safe_name))
    if not path.startswith(upload_dir) or not os.path.isfile(path):
        raise HTTPException(404)
    return FileResponse(path)

@app.delete("/api/users/{user_id}")
async def delete_user_ep(user_id: int, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    if current.role != "admin": raise HTTPException(403, "Forbidden")
    u = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not u: raise HTTPException(404, "User not found")
    await db.delete(u)
    await db.commit()
    return {"ok": True}

@app.post("/api/users/{user_id}/reset-password")
async def reset_password_ep(user_id: int, req: PasswordReset, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    if current.role != "admin": raise HTTPException(403, "Forbidden")
    u = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not u: raise HTTPException(404, "User not found")
    InputValidator.validate_password(req.new_password)
    u.password_hash = get_password_hash(req.new_password)
    await db.commit()
    return {"ok": True}

@app.get("/api/auth/me", response_model=UserOut)
async def me(current_user: User = Depends(get_current_user)): return current_user

@app.get("/api/auth/me/activity")
async def my_activity(limit: int = 20, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    """Actividad auditada del propio usuario (el log global /api/audit es solo para admin)."""
    q = (
        select(AuditLog)
        .where(AuditLog.user_id == current.id)
        .order_by(desc(AuditLog.timestamp))
        .limit(max(1, min(limit, 100)))
    )
    rows = (await db.execute(q)).scalars().all()
    return [
        {"id": r.id, "method": r.action, "route": r.route, "ip": r.ip_address, "timestamp": r.timestamp.isoformat()}
        for r in rows
    ]

# TICKETS (rutas fijas antes de /{ticket_id} para no capturar "count" como id)
@app.get("/api/tickets/count/open")
async def count_open_tickets(db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    q = select(func.count(Ticket.id)).where(Ticket.status.in_(ACTIVE_TICKET_STATUSES))
    q = _tickets_assignee_filter(q, current)
    n = (await db.execute(q)).scalar() or 0
    return {"open": int(n)}


@app.get("/api/tickets", response_model=list[TicketOut])
async def list_tickets(
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
    status: str | None = None,
    active_only: bool = False,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    from sqlalchemy.orm import selectinload

    q = (
        select(Ticket)
        .options(selectinload(Ticket.assignee), selectinload(Ticket.reporter), selectinload(Ticket.evidence), selectinload(Ticket.alerts))
        .order_by(desc(Ticket.created_at))
    )
    q = _tickets_assignee_filter(q, current)
    if active_only:
        q = q.where(Ticket.status.in_(ACTIVE_TICKET_STATUSES))
    elif status:
        q = q.where(Ticket.status == status)
    q = q.limit(limit).offset(offset)
    rows = (await db.execute(q)).scalars().all()
    for t in rows:
        if t.assignee:
            t.assignee_username = t.assignee.username
        if t.reporter:
            t.reporter_username = t.reporter.username
    return rows


@app.get("/api/tickets/{ticket_id}", response_model=TicketOut)
async def get_ticket(
    ticket_id: int,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
):
    from sqlalchemy.orm import selectinload
    t = (await db.execute(select(Ticket).options(
        selectinload(Ticket.assignee), 
        selectinload(Ticket.reporter), 
        selectinload(Ticket.evidence),
        selectinload(Ticket.alerts),
    ).where(Ticket.id == ticket_id))).scalar_one_or_none()
    if not t:
        raise HTTPException(404, "Ticket not found")
    _require_ticket_access(current, t)
    if t.assignee:
        t.assignee_username = t.assignee.username
    if t.reporter:
        t.reporter_username = t.reporter.username
    return t

@app.post("/api/tickets", response_model=TicketOut)
async def create_ticket(req: TicketCreate, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    ticket = Ticket(
        title=req.title,
        description=req.description,
        severity=req.severity,
        category=req.category,
        source_ip=req.source_ip,
        affected_asset=req.affected_asset,
        affected_user=req.affected_user,
        mitre_technique=req.mitre_technique,
        wazuh_alert_id=req.wazuh_alert_id,
        status="open",
        reporter_id=current.id,
        assigned_to_id=req.assigned_to_id,
    )
    db.add(ticket)
    await db.flush()
    _log_event(db, ticket.id, current, "created", "Incidente creado manualmente")
    if req.assigned_to_id:
        assignee = await db.get(User, req.assigned_to_id)
        _log_event(db, ticket.id, current, "assigned", f"Asignado a {assignee.username if assignee else req.assigned_to_id}")
    await db.commit()
    await db.refresh(ticket)
    return await get_ticket(ticket.id, db, current)

@app.put("/api/tickets/{ticket_id}", response_model=TicketOut)
async def update_ticket_ep(ticket_id: int, req: TicketUpdate, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    t = (await db.execute(select(Ticket).where(Ticket.id == ticket_id))).scalar_one_or_none()
    if not t:
        raise HTTPException(404, "Ticket not found")
    _require_ticket_access(current, t)
    changes = req.model_dump(exclude_unset=True)
    if "status" in changes and changes["status"] != t.status:
        _log_event(db, t.id, current, "status", f"Fase: {STATUS_LABEL_ES.get(t.status, t.status)} → {STATUS_LABEL_ES.get(changes['status'], changes['status'])}")
    if "severity" in changes and changes["severity"] != t.severity:
        _log_event(db, t.id, current, "severity", f"Severidad: {t.severity} → {changes['severity']}")
    if "analysis_notes" in changes and (changes["analysis_notes"] or "") != (t.analysis_notes or ""):
        _log_event(db, t.id, current, "notes", "Notas del analista actualizadas")
    for field, value in changes.items():
        setattr(t, field, value)
    _track_resolution(t, changes.get("status"))
    await db.commit()
    return await get_ticket(t.id, db, current)

@app.post("/api/tickets/{ticket_id}/assign", response_model=TicketOut)
async def assign_ticket_ep(ticket_id: int, req: TicketAssign, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    t = (await db.execute(select(Ticket).where(Ticket.id == ticket_id))).scalar_one_or_none()
    if not t:
        raise HTTPException(404, "Ticket not found")
    _require_ticket_access(current, t)
    assignee = await db.get(User, req.assigned_to_id)
    if not assignee:
        raise HTTPException(404, "Usuario no encontrado")
    t.assigned_to_id = req.assigned_to_id
    _log_event(db, t.id, current, "assigned", f"Asignado a {assignee.username}")
    await db.commit()
    return await get_ticket(t.id, db, current)

@app.post("/api/tickets/{ticket_id}/resolve", response_model=TicketOut)
async def resolve_ticket_ep(ticket_id: int, req: TicketResolve, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    t = (await db.execute(select(Ticket).where(Ticket.id == ticket_id))).scalar_one_or_none()
    if not t:
        raise HTTPException(404, "Ticket not found")
    _require_ticket_access(current, t)
    previous = t.status
    t.status = req.status
    t.resolution_notes = req.resolution_notes
    if req.classification:
        t.classification = req.classification
    _track_resolution(t, req.status)
    label = CLASSIFICATION_LABEL_ES.get(req.classification or "", "sin clasificar")
    _log_event(db, t.id, current, "resolved", f"Resuelto como {label} (desde {STATUS_LABEL_ES.get(previous, previous)})")
    await db.commit()
    return await get_ticket(t.id, db, current)

@app.delete("/api/tickets/{ticket_id}")
async def delete_ticket_ep(ticket_id: int, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    if not _can_delete_tickets(current):
        raise HTTPException(403, "Solo admin o analista puede eliminar tickets")
    t = (await db.execute(select(Ticket).where(Ticket.id == ticket_id))).scalar_one_or_none()
    if not t:
        raise HTTPException(404, "Ticket not found")
    _require_ticket_access(current, t)
    await db.delete(t)
    await db.commit()
    return {"ok": True}

def _sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


@app.post("/api/tickets/{ticket_id}/evidence", response_model=EvidenceOut)
async def upload_evidence(
    ticket_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user)
):
    t = (await db.execute(select(Ticket).where(Ticket.id == ticket_id))).scalar_one_or_none()
    if not t:
        raise HTTPException(404, "Ticket not found")
    _require_ticket_access(current, t)

    upload_dir = os.path.abspath(settings.evidence_dir)
    os.makedirs(upload_dir, exist_ok=True)
    safe_name = _safe_evidence_filename(file.filename or "file")
    ext = os.path.splitext(safe_name)[1].lower()
    if ext not in ALLOWED_EVIDENCE_EXT:
        raise HTTPException(400, f"Tipo de archivo no permitido: {ext}")

    file_content = await file.read()
    max_mb = int(await _get_setting(db, "max_upload_mb", str(settings.max_upload_size_mb)))
    if len(file_content) > max_mb * 1024 * 1024:
        raise HTTPException(400, f"Archivo supera {max_mb} MB")
    if not file_content:
        raise HTTPException(400, "Archivo vacío")

    # Nombre único en disco: dos evidencias con el mismo nombre ya no se sobrescriben.
    stored = f"{ticket_id}_{secrets.token_hex(8)}_{safe_name}"
    real_path = os.path.realpath(os.path.join(upload_dir, stored))
    if not real_path.startswith(upload_dir + os.sep):
        raise HTTPException(400, "Ruta de archivo inválida")

    digest = hashlib.sha256(file_content).hexdigest()
    with open(real_path, "wb") as buffer:
        buffer.write(file_content)

    evidence = Evidence(
        ticket_id=ticket_id,
        filename=safe_name,
        file_path=real_path,
        file_size=len(file_content),
        content_type=file.content_type,
        sha256=digest,
        uploaded_by_id=current.id,
        uploaded_by_username=current.username,
    )
    db.add(evidence)
    _log_event(db, ticket_id, current, "evidence", f"Evidencia añadida: {safe_name} (SHA-256 {digest[:16]}…)")
    await db.commit()
    await db.refresh(evidence)
    return evidence


async def _get_evidence_checked(evidence_id: int, db: AsyncSession, current: User) -> Evidence:
    ev = await db.get(Evidence, evidence_id)
    if not ev:
        raise HTTPException(404, "Evidencia no encontrada")
    ticket = await db.get(Ticket, ev.ticket_id)
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    _require_ticket_access(current, ticket)
    upload_dir = os.path.abspath(settings.evidence_dir)
    if not os.path.realpath(ev.file_path).startswith(upload_dir + os.sep) or not os.path.isfile(ev.file_path):
        raise HTTPException(410, "El fichero de la evidencia ya no existe en el servidor")
    return ev


@app.get("/api/evidence/{evidence_id}/download")
async def download_evidence(evidence_id: int, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    ev = await _get_evidence_checked(evidence_id, db, current)
    headers = {"X-Evidence-SHA256": ev.sha256 or "", "Cache-Control": "no-store"}
    return FileResponse(ev.file_path, filename=ev.filename, media_type="application/octet-stream", headers=headers)


@app.get("/api/evidence/{evidence_id}/verify")
async def verify_evidence(evidence_id: int, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    """Recalcula el SHA-256 y lo compara con el registrado al subir (integridad de la cadena de custodia)."""
    ev = await _get_evidence_checked(evidence_id, db, current)
    current_hash = _sha256_file(ev.file_path)
    ok = bool(ev.sha256) and hmac.compare_digest(current_hash, ev.sha256)
    _log_event(db, ev.ticket_id, current, "evidence_verified",
               f"Integridad de {ev.filename} {'verificada' if ok else 'NO coincide'} (SHA-256 {current_hash[:16]}…)")
    await db.commit()
    return {"ok": ok, "stored": ev.sha256, "current": current_hash}


@app.get("/api/tickets/{ticket_id}/timeline", response_model=list[TicketEventOut])
async def ticket_timeline(ticket_id: int, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    t = await db.get(Ticket, ticket_id)
    if not t:
        raise HTTPException(404, "Ticket not found")
    _require_ticket_access(current, t)
    rows = (await db.execute(select(TicketEvent).where(TicketEvent.ticket_id == ticket_id).order_by(TicketEvent.id))).scalars().all()
    return rows


@app.post("/api/tickets/{ticket_id}/comments", response_model=TicketEventOut)
async def add_ticket_comment(ticket_id: int, req: TicketCommentIn, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    t = await db.get(Ticket, ticket_id)
    if not t:
        raise HTTPException(404, "Ticket not found")
    _require_ticket_access(current, t)
    ev = TicketEvent(ticket_id=ticket_id, user_id=current.id, username=current.username, kind="comment", message=req.text)
    db.add(ev)
    await db.commit()
    await db.refresh(ev)
    return ev


@app.post("/api/tickets/from-alert")
async def ticket_from_alert(req: AlertToTicketIn, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    """Escala una alerta a incidente; si ya hay uno activo correlacionado, la vincula a él."""
    ticket, outcome = await _ingest_alert(db, req.model_dump(), current)
    await db.commit()
    return {"outcome": outcome, "ticket_id": ticket.id, "title": ticket.title}

@app.get("/api/incidents", response_model=list[TicketOut])
async def list_incidents(db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    from sqlalchemy.orm import selectinload
    q = (
        select(Ticket)
        .options(selectinload(Ticket.assignee), selectinload(Ticket.reporter), selectinload(Ticket.evidence), selectinload(Ticket.alerts))
        .where(Ticket.severity.in_(["high", "critical"]))
        .order_by(desc(Ticket.created_at))
    )
    q = _tickets_assignee_filter(q, current)
    rows = (await db.execute(q)).scalars().all()
    return rows

# SETTINGS
# Ajustes editables desde "Ajustes globales": clave -> validación. Cualquier otra clave se rechaza.
AI_LEVEL_THRESHOLDS = {"low": 3, "medium": 5, "high": 7, "critical": 12}


def _validate_setting(key: str, value: str) -> str:
    v = (value or "").strip()
    if key == "ollama_url":
        if not _re.match(r"^https?://[\w.\-]+(:\d{1,5})?/?$", v):
            raise HTTPException(422, "URL de Ollama no válida (http(s)://host:puerto)")
        return v.rstrip("/")
    if key == "ollama_model":
        if not _re.match(r"^[\w.\-/]+(:[\w.\-]+)?$", v):
            raise HTTPException(422, "Nombre de modelo no válido")
        return v
    if key == "ollama_temperature":
        try:
            f = float(v)
        except ValueError:
            raise HTTPException(422, "Temperatura no válida")
        if not 0 <= f <= 1:
            raise HTTPException(422, "La temperatura debe estar entre 0 y 1")
        return str(f)
    if key == "ollama_min_alert_level":
        if v not in AI_LEVEL_THRESHOLDS:
            raise HTTPException(422, "Nivel mínimo no válido")
        return v
    if key == "max_upload_mb":
        if not v.isdigit() or not 1 <= int(v) <= 50:
            raise HTTPException(422, "El límite de subida debe estar entre 1 y 50 MB")
        return v
    if key == "retention_days":
        if not v.isdigit() or not 7 <= int(v) <= 365:
            raise HTTPException(422, "La retención debe estar entre 7 y 365 días")
        return v
    if key in ("vt_api_key", "otx_api_key", "abuseipdb_api_key"):
        return v
    raise HTTPException(422, f"Ajuste no reconocido: {key}")


async def _get_setting(db: AsyncSession, key: str, default: str) -> str:
    row = (await db.execute(select(SystemSetting).where(SystemSetting.key == key))).scalar_one_or_none()
    return row.value if row and not row.is_sensitive and row.value else default


def _apply_ai_runtime(key: str, value: str) -> None:
    """Aplica al momento los ajustes de IA (el cliente de Ollama lee `settings`)."""
    if key == "ollama_url":
        settings.ollama_base_url = value
    elif key == "ollama_model":
        settings.ollama_model = value
    elif key == "ollama_temperature":
        settings.ollama_temperature = float(value)


async def _load_runtime_settings() -> None:
    async with SessionLocal() as db:
        for key in ("ollama_url", "ollama_model", "ollama_temperature"):
            val = await _get_setting(db, key, "")
            if val:
                _apply_ai_runtime(key, val)


@app.get("/api/settings", response_model=list[SystemSettingOut])
async def get_settings(db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    if current.role != "admin": raise HTTPException(403, "Forbidden")
    rows = (await db.execute(select(SystemSetting))).scalars().all()
    out = [SystemSettingOut(key=r.key, value="********" if r.is_sensitive else r.value, is_sensitive=r.is_sensitive, updated_at=r.updated_at) for r in rows]
    # Valores efectivos del .env para lo que no se ha personalizado (antes la UI mostraba valores inventados)
    effective = {
        "ollama_url": settings.ollama_base_url,
        "ollama_model": settings.ollama_model,
        "ollama_temperature": str(settings.ollama_temperature),
        "max_upload_mb": str(settings.max_upload_size_mb),
        "ollama_min_alert_level": "high",
        "retention_days": "",  # vacío = sin política: las alertas se conservan indefinidamente
    }
    stored = {r.key for r in rows}
    out += [SystemSettingOut(key=k, value=v, is_sensitive=False, source="env") for k, v in effective.items() if k not in stored]
    return out

@app.put("/api/settings")
async def update_settings(payload: list[SystemSettingIn], db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    if current.role != "admin": raise HTTPException(403, "Forbidden")
    applied: dict[str, str] = {}
    for s in payload:
        # Clave enmascarada o vacía: no sobrescribir el secreto guardado
        if s.is_sensitive and (s.value == "********" or not s.value.strip()): continue
        # Campo opcional vacío (p. ej. retención sin configurar): no se guarda
        if not s.is_sensitive and not s.value.strip() and s.key == "retention_days": continue
        value = _validate_setting(s.key, s.value)
        existing = (await db.execute(select(SystemSetting).where(SystemSetting.key == s.key))).scalar_one_or_none()
        if not s.is_sensitive and existing and existing.value == value:
            continue
        val = encrypt_secret(value) if s.is_sensitive else value
        if existing:
            existing.value = val; existing.is_sensitive = s.is_sensitive
        else:
            db.add(SystemSetting(key=s.key, value=val, is_sensitive=s.is_sensitive))
        applied[s.key] = "***" if s.is_sensitive else value
    await db.commit()

    for key, value in applied.items():
        _apply_ai_runtime(key, value)
    retention = None
    if "retention_days" in applied:
        try:
            retention = await osc.apply_retention_policy(int(applied["retention_days"]))
        except Exception as e:
            logger.warning(f"No se pudo aplicar la política de retención: {e}")
            raise HTTPException(502, "Ajustes guardados, pero el Wazuh Indexer no aceptó la política de retención")
    return {"status": "ok", "changed": sorted(applied), "retention": retention}

# AGENTS & WAZUH
@app.get("/api/agents")
async def list_agents(_=Depends(get_current_user)):
    try:
        return await wazuh.get_agents()
    except Exception as e:
        logger.warning(f"Wazuh API /agents no disponible: {e}")
        raise HTTPException(502, "No se pudo consultar la API de Wazuh (agentes)")

_AGENT_ID = Path(..., pattern=r"^\d{3,5}$")  # evita inyectar rutas en la URL de la API de Wazuh


@app.get("/api/agents/vulnerability-summary")
async def agents_vuln_summary(_=Depends(get_current_user)):
    """Vulnerabilidades por agente y severidad (índice wazuh-states-vulnerabilities-*)."""
    return await osc.get_vulnerability_summary()


@app.get("/api/agents/{agent_id}/inventory")
async def agent_inventory(agent_id: str = _AGENT_ID, _=Depends(get_current_user)):
    """Inventario real del agente (syscollector): sistema, hardware, puertos a la escucha y recuentos."""
    os_i, hw, ports, pkgs, procs = await asyncio.gather(
        wazuh.get_syscollector(agent_id, "os", 1), wazuh.get_syscollector(agent_id, "hardware", 1),
        wazuh.get_syscollector(agent_id, "ports", 200), wazuh.get_syscollector(agent_id, "packages", 1),
        wazuh.get_syscollector(agent_id, "processes", 1),
    )
    counts = {}
    for kind in ("packages", "processes"):
        r = await wazuh.request("GET", f"/syscollector/{agent_id}/{kind}", params={"limit": 1})
        counts[kind] = r.json().get("data", {}).get("total_affected_items", 0) if r.status_code == 200 else 0
    listening = [p for p in ports if (p.get("state") in (None, "", "listening"))]
    return {
        "os": (os_i[0] if os_i else {}).get("os", {}), "kernel": (os_i[0] if os_i else {}).get("release", ""),
        "hostname": (os_i[0] if os_i else {}).get("hostname", ""), "architecture": (os_i[0] if os_i else {}).get("architecture", ""),
        "hardware": hw[0] if hw else {}, "counts": counts,
        "ports": [{"port": (p.get("local") or {}).get("port"), "ip": (p.get("local") or {}).get("ip"), "protocol": p.get("protocol", ""),
                   "process": p.get("process", ""), "pid": p.get("pid")} for p in listening][:60],
        "scan_time": ((os_i[0] if os_i else {}).get("scan") or {}).get("time", ""),
    }


@app.get("/api/agents/{agent_id}/packages")
async def agent_packages(agent_id: str = _AGENT_ID, _=Depends(get_current_user)):
    return await wazuh.get_syscollector(agent_id, "packages", 500)


@app.get("/api/agents/{agent_id}/vulnerabilities")
async def agent_vulnerabilities(agent_id: str = _AGENT_ID, _=Depends(get_current_user)):
    """Antes llamaba a /vulnerability/{id}, retirado en Wazuh 4.8 (siempre vacío)."""
    return await osc.get_agent_vulnerabilities(agent_id)


@app.get("/api/wazuh/recent-alerts")
async def recent_alerts(limit: int = 50, hours: int = 24, _=Depends(get_current_user)):
    return await osc.get_recent_alerts(limit, hours)

@app.get("/api/wazuh/top-attackers")
async def top_attackers(limit: int = 10, hours: int = 24, _=Depends(get_current_user)):
    return await osc.get_top_attackers(limit, hours)

@app.get("/api/wazuh/alert-volume")
async def alert_volume(hours: int = 24, interval: str = "1h", _=Depends(get_current_user)):
    return await osc.get_alert_volume(hours, interval)

@app.get("/api/wazuh/mitre")
async def mitre_coverage(hours: int = 168, _=Depends(get_current_user)):
    return await osc.get_mitre_coverage(hours)

@app.get("/api/honeypot/overview")
async def honeypot_overview(hours: int = Query(24, ge=1, le=720), _=Depends(get_current_user)):
    """Resumen real del honeypot Cowrie (sin las alertas del bucle antiguo de la IA)."""
    from app import honeypot
    return await honeypot.overview(hours)


@app.get("/api/honeypot/sessions")
async def honeypot_sessions(hours: int = Query(24, ge=1, le=720), limit: int = Query(40, ge=1, le=100), _=Depends(get_current_user)):
    from app import honeypot
    return await honeypot.sessions(hours, limit)


@app.get("/api/honeypot/sessions/{session_id}")
async def honeypot_session_events(session_id: str = Path(..., pattern=r"^[a-f0-9]{8,32}$"), _=Depends(get_current_user)):
    from app import honeypot
    return await honeypot.session_events(session_id)


@app.get("/api/wazuh/cowrie-stats")
async def cowrie_stats(hours: int = 24, _=Depends(get_current_user)):
    return await osc.get_cowrie_stats(hours)

@app.get("/api/wazuh/cowrie-sessions")
async def cowrie_sessions(limit: int = 100, hours: int = 24, _=Depends(get_current_user)):
    return await osc.get_cowrie_sessions(limit, hours)

@app.get("/api/wazuh/cowrie-timeline")
async def cowrie_timeline(hours: int = 24, interval: str = "1h", _=Depends(get_current_user)):
    return await osc.get_cowrie_timeline(hours, interval)


async def _tcp_reachable(host: str, port: int, timeout: float = 2.0) -> bool:
    try:
        async with asyncio.timeout(timeout):
            _r, w = await asyncio.open_connection(host, port)
            w.close()
            await w.wait_closed()
            return True
    except Exception:
        return False


@app.get("/api/wazuh/services")
async def wazuh_services(_=Depends(get_current_user)):
    """Estado del stack para el widget Salud del Stack (dashboard)."""
    manager_status = "disconnected"
    try:
        agents = await wazuh.get_agents()
        manager_status = "active" if agents is not None else "disconnected"
    except Exception as e:
        logger.debug("Wazuh manager check failed: %s", e)

    indexer_status = "disconnected"
    try:
        import httpx
        async with asyncio.timeout(3):
            async with httpx.AsyncClient(verify=httpx_verify()) as client:
                res = await client.get(
                    f"{settings.opensearch_url}/",
                    auth=(settings.opensearch_user, settings.opensearch_pass),
                )
                indexer_status = "active" if res.status_code == 200 else "disconnected"
    except Exception as e:
        logger.debug("Indexer check failed: %s", e)

    cowrie_host = os.getenv("COWRIE_HOST", "cowrie")
    cowrie_ssh = int(os.getenv("COWRIE_SSH_PORT", "2222"))
    cowrie_events = 0
    try:
        stats = await osc.get_cowrie_stats(24)
        cowrie_events = int(stats.get("total") or 0)
    except Exception:
        pass

    cowrie_port_up = await _tcp_reachable(cowrie_host, cowrie_ssh)
    if cowrie_port_up:
        cowrie_status = "active" if cowrie_events > 0 else "warning"
    elif cowrie_events > 0:
        cowrie_status = "active"
    else:
        cowrie_status = "disconnected"

    attacker_host = os.getenv("ATTACKER_HOST", "attacker")
    attacker_up = await _tcp_reachable(attacker_host, 22, timeout=1.5)

    return {
        "status": manager_status,
        "manager": manager_status,
        "indexer": indexer_status,
        "api": "active",
        "cowrie": cowrie_status,
        "honeypot": cowrie_status,
        "cowrie_events_24h": cowrie_events,
        "attacker": "active" if attacker_up else "disconnected",
    }


@app.get("/api/threat-map")
async def threat_map(hours: int = 24, _=Depends(get_current_user)):
    return await get_threat_map_data(hours)

# ─────────────────────────────────────────────
# TRIAGE IA ESTRUCTURADO (Fase 3 — SOAR + IA táctica)
# Ollama devuelve scoring accionable: risk_score, mitre_ttp, recommended_action, fp_likelihood
# ─────────────────────────────────────────────
@app.post("/api/triage/analyze")
@limiter.limit("20/minute")
async def triage_analyze(request: Request, req: TriageRequest, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    if current.role not in ("admin", "analyst", "analista"):
        raise HTTPException(403, "Solo admin o analista puede ejecutar triage IA")
    # RAG: recuperar runbooks + MITRE relevantes para fundamentar la recomendación
    knowledge = await build_knowledge(db, f"{req.description} {req.full_log or ''}", [])
    context = {
        "rule": {"id": req.rule_id, "level": req.rule_level, "description": req.description},
        "data": {"srcip": req.source_ip} if req.source_ip else {},
        "full_log": req.full_log or "",
        "knowledge": knowledge,
    }
    res = await analyze_alert(req.rule_id or 0, context)
    return {"ok": res.ok, "analysis": res.data, "knowledge": knowledge}

@app.get("/api/wazuh/sync-alerts")
async def sync_alerts_manual(hours: int = 1, _=Depends(get_current_user)):
    return await _sync_wazuh_alerts_to_tickets(hours=hours)


@app.get("/api/dashboard")
async def get_dashboard(db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    wazuh_stats = await osc.get_dashboard_stats(24)
    tickets_open = (
        await db.execute(
            select(func.count(Ticket.id)).where(
                Ticket.status.in_(["open", "in_progress", "escalated"])
            )
        )
    ).scalar() or 0
    tickets_total = (await db.execute(select(func.count(Ticket.id)))).scalar() or 0

    return {
        "metrics": {
            "alerts": wazuh_stats.get("total_alerts_24h", 0),
            "tickets_open": tickets_open,
            "tickets_total": tickets_total,
            **wazuh_stats,
        },
        "status": "operational",
    }

# MONITORS (reglas SOC configurables)
@app.get("/api/monitors", response_model=list[MonitorOut])
async def list_monitors(db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    if current.role != "admin":
        raise HTTPException(403, "Solo admin puede ver monitores")
    return (await db.execute(select(Monitor).order_by(Monitor.name))).scalars().all()

@app.get("/api/monitors/activity")
async def monitors_activity(hours: int = Query(24, ge=1, le=168), db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    """Alertas reales que ha coincidido cada monitor en la ventana y si alcanzaría su umbral."""
    alerts = await osc.get_recent_alerts(limit=500, hours=hours)
    monitors = (await db.execute(select(Monitor))).scalars().all()
    out = {}
    for m in monitors:
        matched = [a for a in alerts if _monitor_matches(m, a)]
        eligible = [a for a in matched if SEVERITY_RANK.get(a.get("severity") or "low", 0) >= SEVERITY_RANK.get(m.severity_floor, 0)]
        out[m.id] = {"matches": len(matched), "eligible": len(eligible), "would_trigger": bool(m.enabled and eligible and len(matched) >= m.threshold),
                     "last": matched[0].get("timestamp") if matched else None}
    return {"hours": hours, "sampled": len(alerts), "monitors": out}


@app.put("/api/monitors/{monitor_id}", response_model=MonitorOut)
async def update_monitor_ep(
    monitor_id: int,
    payload: MonitorUpdate,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
):
    if current.role != "admin":
        raise HTTPException(403, "Solo admin puede editar monitores")
    m = (await db.execute(select(Monitor).where(Monitor.id == monitor_id))).scalar_one_or_none()
    if not m:
        raise HTTPException(404, "Monitor no encontrado")
    if payload.enabled is not None:
        m.enabled = payload.enabled
    if payload.threshold is not None:
        m.threshold = payload.threshold
    if payload.severity_floor is not None:
        m.severity_floor = payload.severity_floor
    m.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(m)
    return m

# AUDIT
@app.get("/api/audit")
async def list_audit(
    page: int = 1,
    size: int = 50,
    user: str | None = None,
    action: str | None = None,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
):
    if current.role != "admin":
        raise HTTPException(403)
    q = select(AuditLog).order_by(desc(AuditLog.timestamp))
    if user:
        q = q.where(AuditLog.username.ilike(f"%{user}%"))
    if action:
        q = q.where(AuditLog.action.ilike(f"%{action}%"))
    offset = max(0, (page - 1) * size)
    q = q.offset(offset).limit(min(size, 200))
    return (await db.execute(q)).scalars().all()

# REPORTS
@app.get("/api/reports/grc")
async def grc_report(
    start: datetime | None = None,
    end: datetime | None = None,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
):
    """Informe GRC: matriz de riesgo, madurez NIST CSF, cobertura ATT&CK, cumplimiento y plan de tratamiento."""
    if current.role not in ("admin", "analyst", "analista"):
        raise HTTPException(403, "Solo admin o analista puede ver el informe GRC")
    end = end or datetime.now(timezone.utc)
    start = start or (end - timedelta(days=30))
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    if end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)
    if end <= start:
        raise HTTPException(422, "El fin del periodo debe ser posterior al inicio")
    return await grc_builder.build_grc(db, start, end, author=current.username)


@app.get("/api/reports/executive")
async def executive_report(
    start: datetime | None = None,
    end: datetime | None = None,
    ai: bool = False,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
):
    """Datos del PDF ejecutivo/técnico (plantilla de Julieta) para el periodo indicado.

    Usa el mismo generador que el Centro de informes (report_builder), así que todas
    las cifras son reales. Antes: siempre 24 h, activos 'SRV-SAP-PROD' escritos a mano,
    MTTR fijo de 15 min, ISO 27001 fijo al 75 % y recomendaciones fijas.
    """
    if current.role not in ("admin", "analyst", "analista"):
        raise HTTPException(403, "Solo admin o analista puede ver el informe ejecutivo")
    end = end or datetime.now(timezone.utc)
    start = start or (end - timedelta(days=30))
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    if end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)
    if end <= start:
        raise HTTPException(422, "El fin del periodo debe ser posterior al inicio")

    d = await rb.build_report(db, start, end, author=current.username, tlp="AMBER", kind="executive")
    a, h, inc = d["alerts"], d["honeypot"], d["incidents"]
    sev = a.get("by_severity", {})

    # La IA local (~3 tokens/s en la VM) es opcional: por defecto resumen cuantitativo instantáneo
    summary = _AI_UNAVAILABLE if not ai else await generate_executive_summary({
        "periodo": f"{start:%Y-%m-%d} a {end:%Y-%m-%d}", "alertas": a.get("total"), "por_severidad": sev,
        "incidentes": inc["total"], "mttr_min": inc["mttr_minutes"], "riesgo": d["risk"],
        "fuerza_bruta": h.get("bruteforce_detections"), "intrusiones": h.get("intrusions_after_bruteforce"),
    })
    if summary.startswith(_AI_UNAVAILABLE):
        summary = (f"Periodo {start:%d/%m/%Y}-{end:%d/%m/%Y}: {a.get('total', 0)} alertas "
                   f"({sev.get('critical', 0)} críticas, {sev.get('high', 0)} altas), {inc['total']} incidentes. "
                   f"Riesgo {d['risk']['level']} ({d['risk']['score']}/100).")

    # ISO 27001: porcentaje de controles cubiertos (parcial = medio punto)
    ctrls = d["controls"]
    iso_overall = round(sum(1 if c["status"] == "covered" else 0.5 if c["status"] == "partial" else 0 for c in ctrls) * 100 / len(ctrls)) if ctrls else 0
    level_for = lambda n: "Critical" if n >= 50 else "High" if n >= 10 else "Medium"  # noqa: E731
    return {
        "source": "api",
        "generatedAt": d["meta"]["generated_at"],
        "executiveSummary": summary,
        "riskScore": d["risk"]["score"],
        "metrics": {"by_severity": sev, "total_alerts": a.get("total", 0)},
        "topThreats": [
            {"attackType": t["tactic"], "count": t["count"], "severity": "high" if t["count"] > 10 else "medium"}
            for t in a.get("mitre_tactics", [])
        ],
        "iso27001": {
            "overall": iso_overall,
            "controls": [
                {"control": f"{c['iso']} {c['control']}", "status": {"missing": "gap"}.get(c["status"], c["status"]), "note": c["evidence"]}
                for c in ctrls
            ],
        },
        "recommendations": [f"[{r['priority'].upper()}] {r['text']}" for r in d["recommendations"]],
        "geo_intel": [
            {"country": c["country"], "code": "", "pct": round(c["count"] * 100 / max(1, sum(x["count"] for x in a.get("countries", [])))), "desc": ""}
            for c in a.get("countries", [])[:5]
        ],
        "report_metadata": {
            "report_id": f"VHL-{end:%Y%m%d}-EXEC",
            "generation_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "analyst_name": current.username.upper(),
            "company_name": "VALHALLA SOC",
            "period": f"{start:%d/%m/%Y} - {end:%d/%m/%Y}",
        },
        "executive_summary": {
            "status": "Alerta" if d["risk"]["score"] >= 50 else "Operativo",
            "health_score": 100 - d["risk"]["score"],
            "key_finding": summary,
        },
        "wazuh_metrics": {
            "total_alerts": a.get("total", 0),
            "critical_alerts": sev.get("critical", 0),
            "top_affected_assets": [{"name": g["name"], "ip": g["ip"], "alerts": g["count"]} for g in a.get("top_agents", [])],
        },
        "mitre_coverage": [
            {"tactic": t["tactic"], "count": t["count"], "level": level_for(t["count"]), "icon": ""}
            for t in a.get("mitre_tactics", [])
        ],
        "honeypot_intel": {
            "unique_attackers": len(a.get("top_attackers", [])),
            "top_passwords_captured": [p["value"] for p in h.get("top_passwords", [])[:5]],
            "malware_samples_collected": len(h.get("downloads", [])),
        },
        "incident_management": {
            "total_tickets": inc["total"],
            "closed_tickets": inc["resolved"],
            "avg_resolution_time_min": inc["mttr_minutes"] or 0,
        },
        "remediation_steps": [{"task": r["text"]} for r in d["recommendations"][:6]],
        # Detalle completo del generador para la vista en pantalla (mismas cifras que el Informe SOC)
        "detail": {
            "risk": d["risk"],
            "alerts": {k: a.get(k) for k in ("available", "total", "by_severity", "per_day", "agents_reporting",
                                             "top_agents", "top_rules", "top_attackers", "countries", "mitre_tactics")},
            "honeypot": {k: h.get(k) for k in ("available", "events", "sessions", "login_failed", "login_success",
                                               "bruteforce_detections", "intrusions_after_bruteforce",
                                               "top_usernames", "top_passwords", "top_commands")},
            "incidents": {k: v for k, v in inc.items() if k != "items"},
            "blocked_ips_total": d["response"].get("blocked_ips_total", 0),
            "controls": ctrls,
            "recommendations": d["recommendations"],
            "limitations": d["limitations"],
            "ai_summary": ai and not summary.startswith("Periodo "),
        },
    }


# FORENSICS
@app.get("/api/forensics/attack-path/{ip}")
async def attack_path(ip: str, hours: int = 48, _=Depends(get_current_user)):
    """Timeline detallada de un atacante."""
    return await osc.get_attack_path(ip, hours)

# SETTINGS
@app.get("/api/settings/ai")
async def get_ai_settings(db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    """Obtiene la configuracion de IA de la base de datos o env."""
    model = (await db.execute(select(SystemSetting).where(SystemSetting.key == "ollama_model"))).scalar_one_or_none()
    temp = (await db.execute(select(SystemSetting).where(SystemSetting.key == "ollama_temperature"))).scalar_one_or_none()
    
    return {
        "model": model.value if model else settings.ollama_model,
        "temperature": float(temp.value) if temp else settings.ollama_temperature
    }

@app.post("/api/settings/ai")
async def update_ai_settings(
    data: AiSettingsUpdate,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(require_admin),
):
    """Actualiza la configuracion de IA."""
    payload = data.model_dump(exclude_unset=True)
    for key, val in payload.items():
        s = (await db.execute(select(SystemSetting).where(SystemSetting.key == key))).scalar_one_or_none()
        if not s:
            s = SystemSetting(key=key, value=str(val))
            db.add(s)
        else:
            s.value = str(val)
    await db.commit()
    return {"status": "updated"}
@app.get("/api/runbooks", response_model=list[RunbookOut])
async def list_runbooks(db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    return (await db.execute(select(Runbook).where(Runbook.is_active == True).order_by(Runbook.category))).scalars().all()

@app.post("/api/runbooks", response_model=RunbookOut)
async def create_runbook_ep(payload: RunbookIn, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    if current.role.lower() not in ("admin", "analyst", "analista"):
        raise HTTPException(403, "Solo admin o analista")
    rb = Runbook(**payload.model_dump(), created_by_id=current.id, is_active=True)
    db.add(rb)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409, "Ya existe un runbook con ese nombre")
    await db.refresh(rb)
    return rb

@app.put("/api/runbooks/{runbook_id}", response_model=RunbookOut)
async def update_runbook_ep(
    runbook_id: int,
    payload: RunbookIn,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
):
    if current.role.lower() not in ("admin", "analyst", "analista"):
        raise HTTPException(403)
    rb = (await db.execute(select(Runbook).where(Runbook.id == runbook_id))).scalar_one_or_none()
    if not rb:
        raise HTTPException(404, "Runbook no encontrado")
    for k, v in payload.model_dump().items():
        setattr(rb, k, v)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409, "Ya existe un runbook con ese nombre")
    await db.refresh(rb)
    return rb

@app.delete("/api/runbooks/{runbook_id}")
async def delete_runbook_ep(runbook_id: int, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    if current.role != "admin":
        raise HTTPException(403)
    rb = (await db.execute(select(Runbook).where(Runbook.id == runbook_id))).scalar_one_or_none()
    if not rb:
        raise HTTPException(404, "Runbook no encontrado")
    rb.is_active = False
    await db.commit()
    return {"ok": True}

@app.post("/api/runbooks/seed")
async def seed_runbooks_ep(db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    if current.role != "admin":
        raise HTTPException(403)
    n = await seed_runbooks_if_empty(db)
    await db.commit()
    return {"seeded": n, "message": f"{n} runbooks creados" if n else "Ya existían runbooks"}

async def _resolve_vt_api_key(request: Request, db: AsyncSession, user: User) -> str:
    key = request.headers.get("X-VT-API-Key")
    if key and settings.env.lower() == "development":
        return key
    user_key = (
        await db.execute(
            select(SystemSetting).where(SystemSetting.key == f"vt_api_key_user_{user.id}")
        )
    ).scalar_one_or_none()
    if user_key:
        return decrypt_secret(user_key.value)
    global_key = (await db.execute(select(SystemSetting).where(SystemSetting.key == "vt_api_key"))).scalar_one_or_none()
    if global_key:
        return decrypt_secret(global_key.value)
    if settings.virustotal_api_key:
        return settings.virustotal_api_key
    raise HTTPException(404, "API Key de VirusTotal no configurada. Añádala en Threat Intel.")

@app.get("/api/users/me/vt-api-key")
async def get_my_vt_key_status(db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    row = (
        await db.execute(
            select(SystemSetting).where(SystemSetting.key == f"vt_api_key_user_{current.id}")
        )
    ).scalar_one_or_none()
    return {"configured": row is not None}

@app.put("/api/users/me/vt-api-key")
async def set_my_vt_key(data: VtKeyIn, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    key = data.api_key.strip()
    setting_key = f"vt_api_key_user_{current.id}"
    row = (await db.execute(select(SystemSetting).where(SystemSetting.key == setting_key))).scalar_one_or_none()
    enc = encrypt_secret(key)
    if row:
        row.value = enc
        row.is_sensitive = True
    else:
        db.add(SystemSetting(key=setting_key, value=enc, is_sensitive=True))
    await db.commit()
    test = await vt.check_ip("8.8.8.8", key)
    if "error" in test and ("401" in str(test["error"]) or "Forbidden" in str(test["error"])):
        raise HTTPException(401, "API Key inválida")
    return {"status": "ok", "configured": True}

@app.delete("/api/users/me/vt-api-key")
async def delete_my_vt_key(db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    setting_key = f"vt_api_key_user_{current.id}"
    row = (await db.execute(select(SystemSetting).where(SystemSetting.key == setting_key))).scalar_one_or_none()
    if row:
        await db.delete(row)
        await db.commit()
    return {"ok": True}

# VIRUSTOTAL
@app.get("/api/virustotal/check-key")
async def vt_check_key(request: Request, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    key = await _resolve_vt_api_key(request, db, current)
    res = await vt.check_ip("8.8.8.8", key)
    if "error" in res and ("401" in str(res["error"]) or "Forbidden" in str(res["error"])):
        raise HTTPException(401, "API Key inválida")
    return {"status": "ok", "message": "API Key válida"}

@app.get("/api/virustotal/ip/{ip}")
async def vt_scan_ip(ip: str, request: Request, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    ip = InputValidator.validate_ip(ip)  # la IP va en la URL hacia VirusTotal: validar antes
    key = await _resolve_vt_api_key(request, db, current)
    return await vt.check_ip(ip, key)

@app.get("/api/virustotal/hash/{file_hash}")
async def vt_scan_hash(file_hash: str, request: Request, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    key = await _resolve_vt_api_key(request, db, current)
    return await vt.check_hash(file_hash, key)

@app.get("/api/virustotal/domain/{domain}")
async def vt_scan_domain(domain: str, request: Request, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    key = await _resolve_vt_api_key(request, db, current)
    return await vt.check_domain(domain, key)

# ─────────────────────────────────────────────
# ABUSEIPDB (Fase 2 — enriquecimiento IOC multi-fuente)
# ─────────────────────────────────────────────

async def _resolve_abuseipdb_api_key(request: Request, db: AsyncSession, user: User) -> str:
    header_key = request.headers.get("X-AbuseIPDB-API-Key")
    if header_key and settings.env.lower() == "development":
        return header_key
    user_key = (
        await db.execute(
            select(SystemSetting).where(SystemSetting.key == f"abuseipdb_api_key_user_{user.id}")
        )
    ).scalar_one_or_none()
    if user_key:
        return decrypt_secret(user_key.value)
    global_key = (await db.execute(select(SystemSetting).where(SystemSetting.key == "abuseipdb_api_key"))).scalar_one_or_none()
    if global_key:
        return decrypt_secret(global_key.value)
    if settings.abuseipdb_api_key:
        return settings.abuseipdb_api_key
    raise HTTPException(404, "API Key de AbuseIPDB no configurada. Añádela en Threat Intel.")


@app.put("/api/users/me/abuseipdb-api-key")
async def set_my_abuseipdb_key(data: VtKeyIn, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    key = data.api_key.strip()
    setting_key = f"abuseipdb_api_key_user_{current.id}"
    row = (await db.execute(select(SystemSetting).where(SystemSetting.key == setting_key))).scalar_one_or_none()
    enc = encrypt_secret(key)
    if row:
        row.value = enc
        row.is_sensitive = True
    else:
        db.add(SystemSetting(key=setting_key, value=enc, is_sensitive=True))
    await db.commit()
    test = await abuse.check_ip("8.8.8.8", key)
    if "error" in test and ("401" in str(test["error"]) or "403" in str(test["error"])):
        raise HTTPException(401, "API Key inválida")
    return {"status": "ok", "configured": True}


@app.get("/api/users/me/abuseipdb-api-key")
async def get_my_abuseipdb_key_status(db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    row = (
        await db.execute(
            select(SystemSetting).where(SystemSetting.key == f"abuseipdb_api_key_user_{current.id}")
        )
    ).scalar_one_or_none()
    return {"configured": row is not None}


@app.get("/api/abuseipdb/ip/{ip}")
async def abuseipdb_scan_ip(ip: str, request: Request, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    ip = InputValidator.validate_ip(ip)
    key = await _resolve_abuseipdb_api_key(request, db, current)
    return await abuse.check_ip(ip, key)

# CHAT PERSISTENCE
@app.get("/api/chat/{chat_id}", response_model=list[ChatMessageOut])
async def get_chat_history(chat_id: str, limit: int = Query(100, ge=1, le=200), db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    _require_chat_access(current, chat_id)
    q = select(ChatMessage).where(ChatMessage.chat_id == chat_id).order_by(desc(ChatMessage.timestamp)).limit(limit)
    rows = (await db.execute(q)).scalars().all()
    # Return in chronological order
    return sorted(rows, key=lambda x: x.timestamp)

_CHAT_RATE: dict[int, list[float]] = {}
_CHAT_RATE_LIMIT = (20, 10.0)  # 20 mensajes cada 10 s por usuario


def _chat_rate_ok(user_id: int) -> bool:
    now = time.monotonic()
    n, window = _CHAT_RATE_LIMIT
    hits = [t for t in _CHAT_RATE.get(user_id, []) if now - t < window]
    hits.append(now)
    _CHAT_RATE[user_id] = hits
    return len(hits) <= n


@app.post("/api/chat", response_model=ChatMessageOut)
async def save_chat_message(msg: ChatMessageIn, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    chat_id = msg.chat_id
    if not _chat_rate_ok(current.id):
        raise HTTPException(429, "Demasiados mensajes seguidos; espera unos segundos")
    _require_chat_access(current, chat_id)
    members = _dm_members(chat_id)
    if members:
        partner = members[0] if members[1] == current.id else members[1]
        if not (await db.execute(select(User.id).where(User.id == partner))).scalar_one_or_none():
            raise HTTPException(404, "El destinatario no existe")
    msg_id = msg.id or uuid.uuid4().hex
    if (await db.execute(select(ChatMessage.id).where(ChatMessage.id == msg_id))).scalar_one_or_none():
        raise HTTPException(409, "Ya existe un mensaje con ese id")
    new_msg = ChatMessage(
        id=msg_id,
        user_id=current.id,
        username=current.username,
        text=msg.text,
        chat_id=chat_id,
        mentions=msg.mentions,
        attachment=msg.attachment.model_dump() if msg.attachment else None,
    )
    db.add(new_msg)
    await db.commit()
    await db.refresh(new_msg)
    
    # Solo a quien puede ver el chat (antes: a todas las conexiones)
    broadcast_data = ChatMessageOut.model_validate(new_msg).model_dump(by_alias=True, mode="json")
    await manager.send_chat(chat_id, broadcast_data)

    # Chatbot IA: si mencionan al asistente, responde en background.
    if _AI_CHAT_TRIGGER.search(msg.text or ""):
        asyncio.create_task(_ai_chat_reply(chat_id, current.id, msg.text or ""))

    return new_msg


_AI_CHAT_TRIGGER = _re.compile(r"@(chatbot|ia|valhalla|heimdall)\b", _re.IGNORECASE)
_AI_CHAT_MAX_QUESTION_CHARS = 1200
_IP_RE = _re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b")
_TICKET_RE = _re.compile(r"\b(?:ticket|incidente|caso)\s*#?\s*(\d{1,10})\b", _re.IGNORECASE)
_ALERT_RE = _re.compile(r"\b(?:alerta|alert|wazuh)\s*#?\s*([A-Za-z0-9_.:-]{2,80})\b", _re.IGNORECASE)


def _wants_soc_snapshot(question: str) -> bool:
    q = (question or "").lower()
    return any(word in q for word in (
        "log", "logs", "lgos", "alerta", "alertas", "wazuh", "siem", "resumen",
        "resume", "cuantos", "cuantas", "cuánto", "cuánta", "hoy", "24h",
        "dia", "día", "estado", "dashboard", "incidente", "incidentes", "ticket", "tickets",
    ))


def _chat_context_needed(question: str) -> bool:
    q = (question or "").lower()
    context_words = (
        "ioc", "alerta", "alertas", "incidente", "incidentes", "ticket", "tickets",
        "log", "logs", "lgos", "resumen", "resume", "analiza", "analizar", "estado",
        "dashboard", "wazuh", "siem", "runbook", "monitor", "paso", "pasado",
        "ocurrio", "ocurri", "hoy", "24h", "ultimas", "activo", "activos",
        "agente", "agentes", "auditoria", "auditoría", "honeypot", "honeypots",
        "cowrie", "threat", "intel", "iocs", "mapa", "threatmap", "lsa",
        "bifrost", "bifröst", "heimdall", "cve", "cves", "vulnerabilidad",
        "vulnerabilidades", "usuario", "usuarios", "firewall", "bloqueadas",
        "bloqueados", "health", "salud", "integraciones", "metrica", "métrica",
        "metricas", "métricas", "hunting",
    )
    if any(word in q for word in context_words):
        return True
    return bool(
        _IP_RE.search(q)
        or _TICKET_RE.search(q)
        or _ALERT_RE.search(q)
        or any(word in q for word in ("ioc", "alerta", "incidente", "ticket", "paso", "pasado", "ocurrio", "ocurrió"))
    )


async def _build_direct_soc_answer(db: AsyncSession, user: User, question: str) -> str | None:
    """Respuesta directa para consultas SOC frecuentes; no depende de Ollama."""
    if not _wants_soc_snapshot(question):
        return None

    q = (question or "").lower()
    wants_health = any(word in q for word in ("health", "salud", "integraciones", "servicios", "stack"))
    if wants_health:
        return None
    wants_tickets = "ticket" in q or "tickets" in q or "incidente" in q or "incidentes" in q
    wants_logs = any(word in q for word in (
        "log", "logs", "lgos", "alerta", "alertas", "wazuh", "siem", "resumen",
        "resume", "hoy", "24h", "dia", "dÃ­a", "dashboard", "estado",
    ))

    if wants_tickets and not wants_logs:
        ticket_q = _tickets_assignee_filter(
            select(Ticket).where(Ticket.status.in_(["open", "in_progress", "escalated"])).order_by(desc(Ticket.created_at)).limit(10),
            user,
        )
        tickets = (await db.execute(ticket_q)).scalars().all()
        if not tickets:
            return "No tienes tickets abiertos visibles ahora mismo."
        lines = [f"Tienes {len(tickets)} tickets abiertos visibles:"]
        for t in tickets:
            lines.append(
                f"- #{t.id} {t.severity.upper()} {t.status}: {t.title[:140]} "
                f"activo={t.affected_asset or 'N/A'} ip={t.source_ip or 'N/A'}"
            )
        return "\n".join(lines)[:1800]

    try:
        stats = await osc.get_dashboard_stats(24)
    except Exception as e:
        logger.debug("Direct SOC stats unavailable: %s", e)
        stats = {}

    try:
        recent_alerts = await osc.get_recent_alerts(limit=10, hours=24)
    except Exception as e:
        logger.debug("Direct SOC alerts unavailable: %s", e)
        recent_alerts = []

    ticket_q = _tickets_assignee_filter(
        select(Ticket).where(Ticket.status.in_(["open", "in_progress", "escalated"])).order_by(desc(Ticket.created_at)).limit(5),
        user,
    )
    tickets = (await db.execute(ticket_q)).scalars().all()

    total = int(stats.get("total_alerts_24h") or len(recent_alerts) or 0)
    critical = int(stats.get("critical_alerts") or 0)
    high = int(stats.get("high_alerts") or 0)
    unique_agents = int(stats.get("unique_agents") or 0)
    unique_attackers = int(stats.get("unique_attackers") or 0)

    if "cuant" in q and ("log" in q or "lgo" in q or "alert" in q):
        return (
            f"Hoy hay {total} eventos/alertas Wazuh en las ultimas 24h. "
            f"Criticas: {critical}; altas: {high}; agentes implicados: {unique_agents}; "
            f"origenes unicos: {unique_attackers}. Tickets abiertos visibles: {len(tickets)}."
        )

    lines = [
        f"Resumen de logs/alertas de hoy: {total} eventos en 24h, {critical} criticos y {high} altos.",
        f"Agentes implicados: {unique_agents}; origenes unicos detectados: {unique_attackers}; tickets abiertos visibles: {len(tickets)}.",
    ]
    if recent_alerts:
        lines.append("Ultimas alertas destacadas:")
        for a in recent_alerts[:5]:
            lines.append(
                f"- {a.get('severity', 'N/A').upper()} regla {a.get('rule_id') or 'N/A'} "
                f"en {a.get('agent_name') or 'N/A'} ip={a.get('source_ip') or 'N/A'}: "
                f"{str(a.get('description') or '')[:140]}"
            )
    else:
        lines.append("No pude leer alertas recientes desde OpenSearch ahora mismo; si el panel muestra datos, revisa conectividad backend-indexer.")

    if tickets:
        lines.append("Tickets abiertos relevantes:")
        for t in tickets[:3]:
            lines.append(f"- #{t.id} {t.severity.upper()} {t.status}: {t.title[:120]}")

    lines.append("Siguiente paso recomendado: priorizar los eventos HIGH/CRITICAL repetidos por agente, validar si hay IP origen real y abrir/incorporar ticket si hay patron persistente.")
    return "\n".join(lines)[:1800]


async def _build_ai_chat_context(db: AsyncSession, user: User, question: str) -> str:
    """Contexto interno acotado para el chatbot: solo lectura, pocos registros y sin secretos."""
    if not _chat_context_needed(question):
        return ""

    context: list[str] = []
    q = (question or "").lower()
    ips = []
    for raw_ip in _IP_RE.findall(question or "")[:3]:
        try:
            ips.append(InputValidator.validate_ip(raw_ip))
        except HTTPException:
            continue

    ticket_ids = [int(x) for x in _TICKET_RE.findall(question or "")[:3]]
    alert_refs = [x.strip() for x in _ALERT_RE.findall(question or "")[:3]]

    if any(word in q for word in ("activo", "activos", "agente", "agentes", "endpoint", "endpoints")):
        try:
            agents = await wazuh.get_agents()
            if agents:
                active = sum(1 for a in agents if str(a.get("status", "")).lower() == "active")
                context.append(f"Activos/Agentes Wazuh: total={len(agents)} activos={active}")
                for a in agents[:8]:
                    context.append(
                        f"- id={a.get('id')} nombre={a.get('name')} ip={a.get('ip', 'N/A')} "
                        f"estado={a.get('status')} os={a.get('os', {}).get('name') if isinstance(a.get('os'), dict) else a.get('os', 'N/A')}"
                    )
        except Exception as e:
            logger.debug("AI chat agents context unavailable: %s", e)

    if any(word in q for word in ("auditoria", "auditoría", "audit", "acciones", "usuarios")):
        if user.role == "admin":
            audits = (await db.execute(select(AuditLog).order_by(desc(AuditLog.timestamp)).limit(8))).scalars().all()
            if audits:
                context.append("Auditoria reciente:")
                for a in audits:
                    context.append(f"- {a.timestamp.isoformat()} usuario={a.username or 'N/A'} accion={a.action} ruta={a.route} ip={a.ip_address or 'N/A'}")
        else:
            context.append("Auditoria: se requiere rol admin para ver eventos de auditoria.")

    if any(word in q for word in ("usuario", "usuarios", "equipo", "analistas")):
        if user.role == "admin":
            users = (await db.execute(select(User).order_by(User.username).limit(12))).scalars().all()
            context.append(f"Usuarios: total_muestra={len(users)}")
            for u in users:
                context.append(f"- id={u.id} username={u.username} rol={u.role} rango={u.security_rank}")

    if any(word in q for word in ("ioc", "iocs", "threat intel", "intel", "indicador", "indicadores")):
        iocs_q = select(IOC).order_by(desc(IOC.updated_at)).limit(10)
        iocs = (await db.execute(iocs_q)).scalars().all()
        if iocs:
            context.append("Threat Intel / IOCs:")
            for i in iocs:
                context.append(
                    f"- {i.value} tipo={i.ioc_type} estado={i.status} score={i.malicious_score}/{i.total_engines} "
                    f"pais={i.country or 'N/A'} tags={','.join(i.tags or [])}"
                )

    if any(word in q for word in ("firewall", "bloqueada", "bloqueadas", "bloqueado", "bloqueados", "block")):
        blocked = (await db.execute(
            select(IOC).where(IOC.status == "blocked", IOC.ioc_type == "ip").order_by(desc(IOC.updated_at)).limit(10)
        )).scalars().all()
        context.append(f"Firewall / IPs bloqueadas: total_muestra={len(blocked)}")
        for b in blocked:
            context.append(f"- ip={b.value} pais={b.country or 'N/A'} tags={','.join(b.tags or [])} desde={b.updated_at.isoformat()}")

    if any(word in q for word in ("honeypot", "honeypots", "cowrie", "ssh/tel", "telnet")):
        try:
            hp = await osc.get_cowrie_stats(24)
            context.append(f"Honeypot Cowrie 24h: total={hp.get('total', 'N/A')} attackers={hp.get('unique_attackers', 'N/A')}")
            sessions = await osc.get_cowrie_sessions(limit=5, hours=24)
            if sessions:
                context.append("Sesiones Cowrie recientes:")
                for s in sessions[:5]:
                    context.append(f"- {s}")
        except Exception as e:
            logger.debug("AI chat cowrie context unavailable: %s", e)

    if any(word in q for word in ("mapa", "threatmap", "geo", "geograf", "pais", "país", "ataques geo")):
        try:
            tm = await get_threat_map_data(24)
            context.append(f"Threat Map 24h: ataques={tm.get('total_attacks', 'N/A') if isinstance(tm, dict) else 'N/A'}")
            attacks = tm.get("attacks", []) if isinstance(tm, dict) else []
            for a in attacks[:8]:
                context.append(f"- ip={a.get('ip')} pais={a.get('country')} ciudad={a.get('city')} count={a.get('count')}")
        except Exception as e:
            logger.debug("AI chat threat map context unavailable: %s", e)

    if any(word in q for word in ("lsa", "lsass", "credencial", "credential dumping")):
        try:
            from app.lsa_monitor import fetch_lsa_alerts
            lsa_alerts = await fetch_lsa_alerts(24)
            context.append(f"LSA Monitor 24h: alertas={len(lsa_alerts)}")
            for a in lsa_alerts[:6]:
                context.append(f"- host={a.hostname} severidad={a.severity} usuario={a.user or 'N/A'} proceso={a.process_name} desc={a.description[:160]}")
        except Exception as e:
            logger.debug("AI chat LSA context unavailable: %s", e)

    if any(word in q for word in ("bifrost", "bifröst", "madurez", "metrica", "métrica", "metricas", "métricas", "hunting")):
        if user.role.lower() in ("admin", "analyst", "analista"):
            try:
                metrics = await soc_metrics(db, user)
                context.append(
                    f"Bifrost/Metricas SOC: tickets={metrics.get('tickets')} mttr_min={metrics.get('mttr_minutes')} "
                    f"dwell_min={metrics.get('dwell_open_avg_minutes')} attack_coverage={metrics.get('attack_coverage_pct')}%"
                )
                context.append(f"Severidad tickets={metrics.get('by_severity')} alertas_24h={metrics.get('alerts_24h')}")
            except Exception as e:
                logger.debug("AI chat metrics context unavailable: %s", e)

    if any(word in q for word in ("grc", "riesgo", "riesgos", "cumplimiento", "informe", "reporte", "cobertura")):
        if user.role.lower() in ("admin", "analyst", "analista"):
            try:
                end = datetime.now(timezone.utc)
                grc = await grc_builder.build_grc(db, end - timedelta(days=7), end, author=user.username)
                k = grc["kpis"]
                top = "; ".join(f"{s['id']} {s['title']} ({s['level']})" for s in grc["scenarios"][:3])
                context.append(
                    f"Informe GRC 7d: riesgo={k['residual_risk']} cumplimiento={k['compliance_pct']}% "
                    f"cobertura_attack={k['attack_coverage_pct']}% acciones_abiertas={k['open_actions']} riesgos_principales: {top}"
                )
            except Exception as e:
                logger.debug("AI chat GRC context unavailable: %s", e)

    if any(word in q for word in ("cve", "cves", "vulnerabilidad", "vulnerabilidades", "kev", "exploit")):
        try:
            cves = await cve_feed.get_latest_cves(10)
            context.append("CVE Intel recientes:")
            for c in cves[:8]:
                context.append(
                    f"- {c.get('id')} sev={c.get('severity', 'N/A')} ransomware={c.get('ransomware', False)} "
                    f"producto={c.get('product', 'N/A')} resumen={str(c.get('summary', ''))[:180]}"
                )
        except Exception as e:
            logger.debug("AI chat CVE context unavailable: %s", e)

    if any(word in q for word in ("health", "salud", "estado", "integraciones", "servicios", "stack")):
        try:
            services = await wazuh_services()
            context.append(f"Estado integraciones/stack: {services}")
        except Exception as e:
            logger.debug("AI chat health context unavailable: %s", e)

    if any(word in q for word in ("resumen", "resume", "dashboard", "estado", "hoy", "24h", "alerta", "alertas", "siem", "wazuh", "log", "logs", "lgos")):
        try:
            stats = await osc.get_dashboard_stats(24)
            context.append(
                "Resumen SOC 24h: "
                f"alertas_totales={stats.get('total_alerts_24h', stats.get('total_alerts', 'N/A'))} "
                f"criticas={stats.get('critical_alerts', 'N/A')} altas={stats.get('high_alerts', 'N/A')} "
                f"agentes_activos={stats.get('active_agents', 'N/A')}"
            )
        except Exception as e:
            logger.debug("AI chat dashboard context unavailable: %s", e)

        try:
            recent_alerts = await osc.get_recent_alerts(limit=10, hours=24)
            if recent_alerts:
                context.append("Alertas Wazuh ultimas 24h:")
                for a in recent_alerts[:10]:
                    context.append(
                        f"- hora={a.get('timestamp') or 'N/A'} regla={a.get('rule_id') or 'N/A'} "
                        f"sev={a.get('severity') or 'N/A'} ip={a.get('source_ip') or 'N/A'} "
                        f"agente={a.get('agent_name') or 'N/A'} desc={str(a.get('description') or '')[:220]}"
                    )
        except Exception as e:
            logger.debug("AI chat recent alerts context unavailable: %s", e)

    if any(word in q for word in ("runbook", "procedimiento", "pasos", "contener", "mitigar")):
        runbooks = (await db.execute(
            select(Runbook).where(Runbook.is_active.is_(True)).order_by(Runbook.name).limit(5)
        )).scalars().all()
        if runbooks:
            context.append("Runbooks activos:")
            for r in runbooks:
                context.append(
                    f"- {r.name} categoria={r.category} severidad={r.severity_applicable} "
                    f"descripcion={r.description[:180]} identificacion={str(r.identification_steps)[:180]} "
                    f"contencion={str(r.containment_steps)[:180]}"
                )

    if any(word in q for word in ("monitor", "monitores", "regla", "reglas", "config")):
        monitor_q = select(Monitor).order_by(Monitor.name).limit(8)
        if user.role != "admin":
            monitor_q = monitor_q.where(Monitor.enabled.is_(True))
        monitors = (await db.execute(monitor_q)).scalars().all()
        if monitors:
            context.append("Monitores SOC:")
            for m in monitors:
                context.append(
                    f"- {m.name} enabled={m.enabled} umbral={m.threshold} severidad_min={m.severity_floor} "
                    f"patron={m.rule_id_pattern or 'N/A'} descripcion={(m.description or '')[:180]}"
                )

    ticket_q = select(Ticket).order_by(desc(Ticket.created_at)).limit(5)
    filters = []
    if ips:
        filters.append(Ticket.source_ip.in_(ips))
    if ticket_ids:
        filters.append(Ticket.id.in_(ticket_ids))
    if alert_refs:
        filters.append(Ticket.wazuh_alert_id.in_(alert_refs))
    if filters:
        ticket_q = select(Ticket).where(or_(*filters)).order_by(desc(Ticket.created_at)).limit(5)
    elif any(word in (question or "").lower() for word in ("incidente", "ticket", "alerta")):
        ticket_q = select(Ticket).order_by(desc(Ticket.created_at)).limit(5)
    else:
        ticket_q = None

    if ticket_q is not None:
        ticket_q = _tickets_assignee_filter(ticket_q, user)
        tickets = (await db.execute(ticket_q)).scalars().all()
        if tickets:
            context.append("Tickets visibles:")
            for t in tickets:
                context.append(
                    f"- ticket={t.id} estado={t.status} severidad={t.severity} ip={t.source_ip or 'N/A'} "
                    f"wazuh_alert_id={t.wazuh_alert_id or 'N/A'} titulo={t.title[:160]} "
                    f"resumen={(t.ai_summary or t.description or '')[:240]}"
                )

    if ips:
        iocs = (await db.execute(select(IOC).where(IOC.value.in_(ips)).limit(5))).scalars().all()
        if iocs:
            context.append("IOCs:")
            for ioc in iocs:
                context.append(
                    f"- value={ioc.value} tipo={ioc.ioc_type} estado={ioc.status} score={ioc.malicious_score}/{ioc.total_engines} "
                    f"pais={ioc.country or 'N/A'} as_owner={ioc.as_owner or 'N/A'} tags={','.join(ioc.tags or [])}"
                )

    if ips:
        alerts = (await db.execute(
            select(Alert).join(Event, Alert.event_id == Event.id, isouter=True)
            .where(Event.source_ip.in_(ips))
            .order_by(desc(Alert.timestamp))
            .limit(5)
        )).scalars().all()
        if alerts:
            context.append("Alertas locales:")
            for a in alerts:
                context.append(
                    f"- alert_id={a.id} rule_id={a.rule_id or 'N/A'} severidad={a.severity} "
                    f"fecha={a.timestamp.isoformat()} descripcion={(a.description or '')[:220]}"
                )

    if ips:
        try:
            recent = await osc.get_recent_alerts(limit=50, hours=168)
            matches = [a for a in recent if a.get("source_ip") in ips][:5]
            if matches:
                context.append("Alertas Wazuh recientes:")
                for a in matches:
                    context.append(
                        f"- rule_id={a.get('rule_id')} severidad={a.get('severity')} ip={a.get('source_ip')} "
                        f"agente={a.get('agent_name')} descripcion={str(a.get('description') or '')[:220]}"
                    )
        except Exception as e:
            logger.debug("AI chat Wazuh context unavailable: %s", e)

    return "\n".join(context)[:3000]


_DAILY_RE = _re.compile(r"\b(resumen|informe|reporte|parte)\b.*\b(dia|día|hoy|diario|24\s*h)\b|\b(resumen|informe) diario\b", _re.IGNORECASE)


async def _daily_summary(db: AsyncSession, requester: User) -> tuple[str, dict | None]:
    """Genera el informe SOC real de las últimas 24 h y devuelve (texto corto, tarjeta del informe).

    El informe queda en el Centro de informes con su id y huella; en el chat solo van cifras
    agregadas (el chat global lo ven todos los roles). Un lector recibe el resumen sin informe.
    """
    end = datetime.now(timezone.utc)
    start = end - timedelta(hours=24)
    data = await rb.build_report(db, start, end, author=requester.username, tlp="AMBER", kind="soc")
    data["ai_summary"] = None
    a, h, inc, risk = data["alerts"], data["honeypot"], data["incidents"], data["risk"]
    sev = a.get("by_severity", {})
    active = inc["total"] - inc["resolved"]
    lines = [
        f"Resumen últimas 24 h · riesgo {risk['level']} ({risk['score']}/100)",
        f"• Alertas: {a.get('total', 0)} ({sev.get('critical', 0)} críticas, {sev.get('high', 0)} altas)",
        f"• Incidentes: {active} abiertos, {inc['resolved']} resueltos",
    ]
    if h.get("available"):
        lines.append(f"• Honeypot: {h.get('bruteforce_detections', 0)} fuerza bruta, {h.get('intrusions_after_bruteforce', 0)} accesos")
    if data["recommendations"]:
        lines.append(f"• Prioridad: {data['recommendations'][0]['text']}")
    if requester.role.lower() not in ("admin", "analyst", "analista"):
        lines.append("(El informe completo requiere rol analista.)")
        return "\n".join(lines), None
    row = await _store_report(db, data, start, end, requester, "AMBER", "soc")
    card = {"type": "valhalla/report", "name": row.report_id, "size": 0, "data": "",
            "tlp": row.tlp, "sha256": row.sha256}
    return "\n".join(lines), card


async def _ai_chat_reply(chat_id: str, requester_id: int, question: str) -> None:
    """Genera y publica la respuesta del asistente IA en el chat interno."""
    await manager.send_chat(chat_id, {"type": "AI_TYPING", "chatId": chat_id, "isTyping": True})
    clean_question = _AI_CHAT_TRIGGER.sub("", question or "").strip()
    clean_question = clean_question[:_AI_CHAT_MAX_QUESTION_CHARS]
    if not clean_question:
        clean_question = "Explica como usar el asistente de forma segura en el chat del SOC."
    try:
        async with SessionLocal() as db:
            requester = (await db.execute(select(User).where(User.id == requester_id))).scalar_one_or_none()
            if not requester:
                await manager.send_chat(chat_id, {"type": "AI_TYPING", "chatId": chat_id, "isTyping": False})
                return
            report_card = None
            if _DAILY_RE.search(clean_question):
                direct_answer, report_card = await _daily_summary(db, requester)
            else:
                direct_answer = await _build_direct_soc_answer(db, requester, clean_question)
            app_context = "" if direct_answer else await _build_ai_chat_context(db, requester, clean_question)
        answer = direct_answer or await chat_assistant(clean_question, app_context=app_context)
    except Exception as e:
        logger.warning("AI chat reply falló: %s", e)
        await manager.send_chat(chat_id, {"type": "AI_TYPING", "chatId": chat_id, "isTyping": False})
        return
    async with SessionLocal() as db:
        ai = (await db.execute(select(User).where(User.username == "valhalla-ia"))).scalar_one_or_none()
        if not ai:
            await manager.send_chat(chat_id, {"type": "AI_TYPING", "chatId": chat_id, "isTyping": False})
            return
        m = ChatMessage(
            id=f"ai-{secrets.token_hex(8)}",
            user_id=ai.id,
            username="VALHALLA-IA",
            text=answer,
            chat_id=chat_id,
            mentions=[str(requester_id)],
            attachment=report_card,
        )
        db.add(m)
        await db.commit()
        await db.refresh(m)
        broadcast_data = ChatMessageOut.model_validate(m).model_dump(by_alias=True, mode="json")
        await manager.send_chat(chat_id, {"type": "AI_TYPING", "chatId": chat_id, "isTyping": False})
        await manager.send_chat(chat_id, broadcast_data)

_AI_UNAVAILABLE = "El sistema de IA no esta disponible"  # prefijo del texto de error de ollama_client

# WEBHOOKS
@app.post("/api/webhook/wazuh")
async def wazuh_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """Real-time alert webhook from Wazuh integrations."""
    body = await request.body()
    _verify_webhook_auth(request, body)
    try:
        alert = json.loads(body.decode("utf-8") if body else "{}")
    except json.JSONDecodeError:
        raise HTTPException(400, "Invalid JSON")
    
    rule = alert.get("rule", {})
    level = int(rule.get("level", 0))
    description = rule.get("description", "Alert")
    rule_id = rule.get("id", "0")
    # Wazuh usa data.srcip y Cowrie data.src_ip
    source_ip = alert.get("data", {}).get("srcip") or alert.get("data", {}).get("src_ip") or alert.get("srcip", "N/A")
    agent_name = alert.get("agent", {}).get("name") or "Manager"
    
    # Map Wazuh level to Valhalla severity
    if level >= 12: severity = "critical"
    elif level >= 9: severity = "high"
    elif level >= 5: severity = "medium"
    else: severity = "low"

    # ── CO-PILOTO IA (Fase 3): triage estructurado con barreras ──
    # Hacemos el triage SÍNCRONO solo cuando hay que tomar una decisión (ticket/bloqueo);
    # si no, en background para no bloquear el webhook de Wazuh.
    ai = None
    # Umbral de análisis IA configurable en Ajustes (por defecto "high" = nivel 7)
    ai_min_level = AI_LEVEL_THRESHOLDS.get(await _get_setting(db, "ollama_min_alert_level", "high"), 7)
    need_decision = (settings.auto_create_webhook_tickets and level >= 9) or (
        settings.auto_block_enabled and level >= 7
    )
    if level >= ai_min_level and need_decision:
        try:
            alert["knowledge"] = await build_knowledge(db, description, [])
            res = await analyze_alert(int(rule_id), alert)
            if res.ok:
                ai = res.data
        except Exception as e:
            logger.warning("Co-piloto: triage falló para %s: %s", rule_id, e)
    elif level >= ai_min_level:
        async def run_ai():
            try:
                res = await analyze_alert(int(rule_id), alert)
                if res.ok:
                    logger.info("AI Insight %s: rs=%s %s", rule_id, res.data.get("risk_score"), res.data.get("summary"))
            except Exception:
                pass
        asyncio.create_task(run_ai())

    risk_score = int(ai.get("risk_score", 0)) if ai else None
    mitre_ttp = ai.get("mitre_ttp", []) if ai else []
    # La IA puede refinar la severidad según el riesgo real
    if risk_score is not None:
        severity = "critical" if risk_score >= 85 else "high" if risk_score >= 60 else "medium" if risk_score >= 30 else "low"

    # Tier 0 (auto, seguro): ticket auto-priorizado con contexto IA
    if settings.auto_create_webhook_tickets and level >= 9:
        admin = (await db.execute(select(User).where(User.username == "admin"))).scalar_one_or_none()
        if admin:
            desc = description
            if ai:
                desc = (
                    f"{description}\n\n[Triage IA] risk_score={risk_score} · "
                    f"fp_likelihood={ai.get('false_positive_likelihood')}\n"
                    f"Resumen: {ai.get('summary')}\n"
                    f"Acción recomendada: {ai.get('recommended_action')}"
                )
            db.add(Ticket(
                title=f"Wazuh Real-time: {description}",
                description=desc,
                severity=severity,
                category="wazuh-realtime",
                source_ip=source_ip if source_ip != "N/A" else None,
                affected_asset=agent_name,
                mitre_technique=",".join(mitre_ttp) if mitre_ttp else None,
                wazuh_alert_id=str(alert.get("id") or rule_id),
                reporter_id=admin.id,
                status="open",
            ))
            await db.commit()

    # Tier 1 (auto CON BARRERAS): bloqueo de IP reversible y auditado.
    # Solo si: habilitado + risk_score alto + baja prob. de falso positivo + IP válida + NO whitelist.
    auto_blocked = False
    block_reason = None
    if (settings.auto_block_enabled and ai and source_ip and source_ip != "N/A"
            and risk_score is not None and risk_score >= settings.auto_block_risk_threshold
            and ai.get("false_positive_likelihood") == "low"):
        try:
            ip = InputValidator.validate_ip(source_ip)
            wl = (await db.execute(select(IOC).where(IOC.value == ip))).scalar_one_or_none()
            if wl and any("whitelist" in (t or "").lower() for t in (wl.tags or [])):
                block_reason = "omitido: IP en whitelist"
            else:
                r = await _apply_ip_block(db, ip)
                if r["cdb_ok"] or r["ar_ok"]:
                    db.add(AuditLog(user_id=None, username="ai-copilot",
                                    action="AUTO_BLOCK", route="/api/webhook/wazuh", ip_address=ip))
                    await db.commit()
                    auto_blocked = True
                    block_reason = f"auto-bloqueo IA (risk={risk_score}, reversible {settings.auto_block_timeout_seconds}s)"
                else:
                    await db.rollback()
                    block_reason = "fallo: Wazuh no confirmó"
        except HTTPException:
            block_reason = "omitido: IP inválida"
        except Exception as e:
            await db.rollback()
            block_reason = f"error: {e}"
            logger.warning("Co-piloto auto-block falló: %s", e)

    # Broadcast a la UI con scoring IA y estado de la acción autónoma
    broadcast_payload = {
        "type": "NEW_ALERT",
        "data": {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "rule_id": rule_id,
            "description": description,
            "severity": severity,
            "source_ip": source_ip,
            "agent_name": agent_name,
            "risk_score": risk_score,
            "mitre_ttp": mitre_ttp,
            "recommended_action": ai.get("recommended_action") if ai else None,
            "auto_blocked": auto_blocked,
            "block_reason": block_reason,
        },
    }
    await manager.broadcast(broadcast_payload)

    return {"status": "processed", "risk_score": risk_score, "auto_blocked": auto_blocked}

@app.get("/api/ioc")
async def list_iocs_ep(status: str = None, ioc_type: str = None, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    q = select(IOC).order_by(desc(IOC.created_at))
    if status: q = q.where(IOC.status == status)
    if ioc_type: q = q.where(IOC.ioc_type == ioc_type)
    return (await db.execute(q)).scalars().all()

@app.post("/api/ioc")
async def add_ioc_ep(req: IocCreate, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    existing = (await db.execute(select(IOC).where(IOC.value == req.value))).scalar_one_or_none()
    if existing:
        if req.status:
            existing.status = req.status
            if req.tags:
                existing.tags = list(set((existing.tags or []) + req.tags))
            if req.vt_report:
                existing.vt_report = req.vt_report
            existing.malicious_score = req.malicious_score
            await db.commit()
            await db.refresh(existing)
            return existing
        raise HTTPException(400, "IOC ya existe en la lista")

    ioc = IOC(
        value=req.value,
        ioc_type=req.ioc_type,
        malicious_score=req.malicious_score,
        total_engines=req.total_engines,
        country=req.country,
        asn=req.asn,
        as_owner=req.as_owner,
        tags=req.tags,
        status=req.status,
        vt_report=req.vt_report,
    )
    db.add(ioc)
    try:
        await db.commit()
        await db.refresh(ioc)
    except IntegrityError:
        raise HTTPException(400, "IOC ya existe")
    return ioc

@app.patch("/api/ioc/{id}")
async def update_ioc_ep(id: int, req: IocUpdate, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    ioc = (await db.execute(select(IOC).where(IOC.id == id))).scalar_one_or_none()
    if not ioc:
        raise HTTPException(404, "IOC no encontrado")
    for field, value in req.model_dump(exclude_unset=True).items():
        if field == "tags" and value is not None:
            ioc.tags = list(set((ioc.tags or []) + value))
        else:
            setattr(ioc, field, value)
    await db.commit()
    return ioc

@app.delete("/api/ioc/{id}")
async def delete_ioc_ep(id: int, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    ioc = (await db.execute(select(IOC).where(IOC.id == id))).scalar_one_or_none()
    if not ioc: raise HTTPException(404, "IOC no encontrado")
    await db.delete(ioc)
    await db.commit()
    return {"ok": True}

# ─────────────────────────────────────────────
# FIREWALL / ACTIVE RESPONSE (Fase 1 — Consolidación Defensiva)
# Flujo: UI → endpoint → API Wazuh (CDB blocked-ips + firewall-drop) → iptables DROP
# La tabla IOC (Postgres) es la fuente de verdad; la lista CDB es su proyección.
# ─────────────────────────────────────────────

def _can_block_ips(user: User) -> bool:
    return user.role.lower() in ("admin", "analyst", "analista")


async def _build_blocked_cdb(db: AsyncSession) -> str:
    """Contenido de la lista CDB 'blocked-ips' desde los IOC bloqueados (formato key:value).

    Incluye siempre una línea de cabecera para que el archivo nunca quede vacío: la API
    de Wazuh rechaza subir un cuerpo vacío (error 1912) cuando se desbloquea la última IP.
    """
    rows = (
        await db.execute(
            select(IOC.value).where(IOC.status == "blocked", IOC.ioc_type == "ip")
        )
    ).scalars().all()
    header = "valhalla-soc-managed:1\n"  # entrada centinela inocua (no es una IP)
    return header + "".join(f"{ip}:drop\n" for ip in sorted(set(rows)))


async def _push_blocked_cdb(db: AsyncSession) -> dict:
    return await wazuh.upload_cdb_list("blocked-ips", await _build_blocked_cdb(db))


async def _apply_ip_block(db: AsyncSession, ip: str) -> dict[str, Any]:
    """Núcleo de bloqueo reutilizable (endpoint manual y co-piloto IA).

    Upsert del IOC como blocked + proyección a la lista CDB + firewall-drop.
    NO hace commit/rollback (lo gestiona el llamante). Devuelve estado real.
    """
    existing = (await db.execute(select(IOC).where(IOC.value == ip))).scalar_one_or_none()
    if existing:
        existing.status = "blocked"
        existing.tags = list({*(existing.tags or []), "blocked-firewall"})
    else:
        db.add(IOC(value=ip, ioc_type="ip", status="blocked", tags=["blocked-firewall"], malicious_score=0))
    await db.flush()

    cdb_ok = ar_ok = ar_skipped = False
    detail: dict[str, Any] = {}
    try:
        cdb_res = await _push_blocked_cdb(db)
        cdb_ok = int(cdb_res.get("error", 1)) == 0
        detail["cdb"] = cdb_res
    except Exception as e:
        detail["cdb_error"] = str(e)
        logger.warning("Block — CDB upload falló para %s: %s", ip, e)
    try:
        ar_res = await wazuh.run_firewall_drop(ip)
        ar_skipped = bool(ar_res.get("skipped"))
        ar_ok = int(ar_res.get("error", 1)) == 0 and not ar_skipped
        detail["active_response"] = ar_res
    except Exception as e:
        detail["ar_error"] = str(e)
        logger.warning("Block — firewall-drop falló para %s: %s", ip, e)

    return {"cdb_ok": cdb_ok, "ar_ok": ar_ok, "ar_skipped": ar_skipped, "detail": detail}


@app.get("/api/firewall/blocked")
async def list_blocked_ips(db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    rows = (
        await db.execute(
            select(IOC)
            .where(IOC.status == "blocked", IOC.ioc_type == "ip")
            .order_by(desc(IOC.updated_at))
        )
    ).scalars().all()
    return [
        {
            "ip": r.value,
            "country": r.country,
            "as_owner": r.as_owner,
            "tags": r.tags,
            "since": r.updated_at,
        }
        for r in rows
    ]


@app.post("/api/firewall/block")
async def firewall_block(
    req: FirewallBlockIn,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
):
    if not _can_block_ips(current):
        raise HTTPException(403, "Solo admin o analista puede bloquear IPs")
    ip = InputValidator.validate_ip(req.ip.strip())

    existing = (await db.execute(select(IOC).where(IOC.value == ip))).scalar_one_or_none()
    if existing and any("whitelist" in (t or "").lower() for t in (existing.tags or [])):
        raise HTTPException(409, "La IP está en lista blanca; retírala antes de bloquear")

    r = await _apply_ip_block(db, ip)
    cdb_ok, ar_ok, ar_skipped, detail = r["cdb_ok"], r["ar_ok"], r["ar_skipped"], r["detail"]

    # Éxito = la IP quedó persistida en la lista CDB (regla 100500 la aplicará en el
    # manager al reaparecer; en agentes reales el AR-API la bloquea de inmediato).
    # Solo es fallo real si la CDB no se pudo actualizar Y el AR tampoco se ejecutó.
    if not cdb_ok and not ar_ok:
        await db.rollback()
        raise HTTPException(502, f"Wazuh no confirmó el bloqueo de {ip}. Detalle: {detail}")

    await db.commit()
    return {
        "ok": True,
        "ip": ip,
        "cdb_applied": cdb_ok,
        "active_response": ar_ok,
        "active_response_skipped": ar_skipped,
        "timeout": req.timeout,
        "detail": detail,
    }


@app.post("/api/cowrie/block")
async def cowrie_block_alias(
    req: FirewallBlockIn,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
):
    """Alias de compatibilidad citado en docs/WAZUH_ACTIVE_RESPONSE.md."""
    return await firewall_block(req, db, current)


@app.post("/api/firewall/unblock")
async def firewall_unblock(
    req: FirewallUnblockIn,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
):
    if not _can_block_ips(current):
        raise HTTPException(403, "Solo admin o analista puede desbloquear IPs")
    ip = InputValidator.validate_ip(req.ip.strip())

    existing = (await db.execute(select(IOC).where(IOC.value == ip))).scalar_one_or_none()
    if existing:
        existing.status = "cleared"
        existing.tags = [t for t in (existing.tags or []) if t != "blocked-firewall"]
    await db.flush()

    cdb_ok = False
    detail: dict[str, Any] = {}
    try:
        cdb_res = await _push_blocked_cdb(db)
        cdb_ok = int(cdb_res.get("error", 1)) == 0
        detail["cdb"] = cdb_res
    except Exception as e:
        detail["cdb_error"] = str(e)
        logger.warning("Firewall unblock — CDB upload falló para %s: %s", ip, e)

    await db.commit()
    # iptables: el DROP activo expira por el <timeout> del active-response configurado en ossec.conf
    return {"ok": True, "ip": ip, "cdb_applied": cdb_ok, "detail": detail}


# ─────────────────────────────────────────────
# SOAR — PLAYBOOKS EJECUTABLES (Fase 3)
# Los pasos de un runbook dejan de ser texto: el operador aprueba (1 clic) y el
# backend ejecuta la acción REAL, con auditoría. Solo acciones seguras/reversibles.
# ─────────────────────────────────────────────
@app.post("/api/playbooks/execute")
@limiter.limit("30/minute")
async def playbook_execute(
    request: Request,
    req: PlaybookActionIn,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
):
    if current.role.lower() not in ("admin", "analyst", "analista"):
        raise HTTPException(403, "Solo admin o analista puede ejecutar playbooks")

    action = req.action
    if action in ("block_ip", "unblock_ip", "enrich_ip", "add_ioc") and not req.ip:
        raise HTTPException(400, "Falta 'ip' para esta acción")

    if action == "block_ip":
        ip = InputValidator.validate_ip(req.ip)
        wl = (await db.execute(select(IOC).where(IOC.value == ip))).scalar_one_or_none()
        if wl and any("whitelist" in (t or "").lower() for t in (wl.tags or [])):
            raise HTTPException(409, "La IP está en whitelist")
        r = await _apply_ip_block(db, ip)
        if not r["cdb_ok"] and not r["ar_ok"]:
            await db.rollback()
            raise HTTPException(502, f"Wazuh no confirmó el bloqueo: {r['detail']}")
        await db.commit()
        return {"ok": True, "action": action, "ip": ip, "cdb_applied": r["cdb_ok"], "active_response": r["ar_ok"]}

    if action == "unblock_ip":
        ip = InputValidator.validate_ip(req.ip)
        existing = (await db.execute(select(IOC).where(IOC.value == ip))).scalar_one_or_none()
        if existing:
            existing.status = "cleared"
            existing.tags = [t for t in (existing.tags or []) if t != "blocked-firewall"]
        await db.flush()
        try:
            await _push_blocked_cdb(db)
        except Exception as e:
            logger.warning("Playbook unblock CDB falló: %s", e)
        await db.commit()
        return {"ok": True, "action": action, "ip": ip}

    if action == "create_ticket":
        if not req.title:
            raise HTTPException(400, "Falta 'title' para crear el ticket")
        sev = (req.severity or "medium").lower()
        if sev not in ("low", "medium", "high", "critical"):
            sev = "medium"
        t = Ticket(
            title=req.title,
            description=req.description or "",
            severity=sev,
            category="playbook",
            source_ip=req.ip,
            status="open",
            reporter_id=current.id,
        )
        db.add(t)
        await db.commit()
        await db.refresh(t)
        return {"ok": True, "action": action, "ticket_id": t.id}

    if action == "add_ioc":
        existing = (await db.execute(select(IOC).where(IOC.value == req.ip))).scalar_one_or_none()
        if existing:
            return {"ok": True, "action": action, "note": "El IOC ya existía"}
        db.add(IOC(value=req.ip, ioc_type="ip", status="watchlist", tags=["playbook"], malicious_score=0))
        await db.commit()
        return {"ok": True, "action": action, "value": req.ip}

    if action == "enrich_ip":
        ip = InputValidator.validate_ip(req.ip)
        out: dict[str, Any] = {}
        try:
            out["virustotal"] = await vt.check_ip(ip, await _resolve_vt_api_key(request, db, current))
        except HTTPException:
            out["virustotal"] = {"error": "API key de VirusTotal no configurada"}
        try:
            out["abuseipdb"] = await abuse.check_ip(ip, await _resolve_abuseipdb_api_key(request, db, current))
        except HTTPException:
            out["abuseipdb"] = {"error": "API key de AbuseIPDB no configurada"}
        return {"ok": True, "action": action, "ip": ip, "enrichment": out}

    raise HTTPException(400, "Acción no soportada")


# ─────────────────────────────────────────────
# FASE 4 — MADUREZ Y MÉTRICAS
# ─────────────────────────────────────────────
@app.get("/api/metrics/soc")
async def soc_metrics(db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    """KPIs reales del SOC: MTTR, dwell (edad de abiertos), por severidad/analista, cobertura ATT&CK %."""
    if current.role.lower() not in ("admin", "analyst", "analista"):
        raise HTTPException(403, "Solo admin o analista puede ver métricas del SOC")

    rows = (await db.execute(
        select(Ticket.created_at, Ticket.resolved_at, Ticket.status, Ticket.severity, Ticket.assigned_to_id)
    )).all()
    closed_states = {"closed", "resolved"}
    open_states = {"open", "in_progress", "escalated"}
    now = datetime.now(timezone.utc)

    mttr_samples, dwell_samples = [], []
    by_sev: dict[str, int] = {}
    by_analyst: dict[int | None, int] = {}
    total = len(rows)
    closed = 0
    for created, resolved, status, severity, assignee in rows:
        st = (status or "").lower()
        by_sev[severity or "unknown"] = by_sev.get(severity or "unknown", 0) + 1
        if st in closed_states:
            closed += 1
            # MTTR con la fecha real de resolución (antes updated_at: un comentario posterior lo alteraba)
            if created and resolved and resolved >= created:
                mttr_samples.append((resolved - created).total_seconds() / 60)
            by_analyst[assignee] = by_analyst.get(assignee, 0) + 1
        elif st in open_states and created:
            dwell_samples.append((now - created).total_seconds() / 60)

    # nombres de analistas
    users = {u.id: u.username for u in (await db.execute(select(User))).scalars().all()}
    tickets_by_analyst = [
        {"analyst": users.get(aid, "sin asignar") if aid else "sin asignar", "closed": n}
        for aid, n in sorted(by_analyst.items(), key=lambda x: x[1], reverse=True)
    ]

    # Cobertura ATT&CK: la misma que el Informe GRC (reglas cargadas en Wazuh); antes se medía
    # contra una lista corta fija y no coincidía con el informe.
    try:
        cov = await osc.get_mitre_coverage(168)
    except Exception:
        cov = []
    seen_base = {c.get("technique_id", "").split(".")[0] for c in cov if c.get("technique_id")}
    ruleset = await grc_builder.attack_coverage()
    coverage_pct = round(ruleset["coverage_pct"]) if ruleset else None

    try:
        stats = await osc.get_dashboard_stats(24)
    except Exception:
        stats = {}

    def _avg(xs: list[float]) -> int:
        return round(sum(xs) / len(xs)) if xs else 0

    return {
        "tickets": {"total": total, "closed": closed, "open": total - closed,
                    "resolution_rate_pct": round(100 * closed / max(1, total))},
        "mttr_minutes": _avg(mttr_samples),
        "dwell_open_avg_minutes": _avg(dwell_samples),
        "by_severity": by_sev,
        "tickets_by_analyst": tickets_by_analyst,
        "attack_coverage_pct": coverage_pct,
        "techniques_seen": sorted(seen_base),
        "techniques_covered": ruleset["techniques_covered"] if ruleset else None,
        "techniques_total": ruleset["techniques_total"] if ruleset else None,
        "alerts_24h": stats.get("total_alerts_24h", stats.get("total_alerts", 0)),
        "generated_at": now.isoformat(),
    }


@app.get("/api/mitre/navigator-layer")
async def mitre_navigator_layer(hours: int = 168, current: User = Depends(get_current_user)):
    """Capa JSON para MITRE ATT&CK Navigator generada desde alertas reales (heat por frecuencia)."""
    try:
        cov = await osc.get_mitre_coverage(hours)
    except Exception:
        cov = []
    techniques = [
        {"techniqueID": c["technique_id"], "score": c["count"], "enabled": True,
         "comment": f"{c['count']} eventos · {c.get('tactic','')}"}
        for c in cov if c.get("technique_id")
    ]
    max_score = max([t["score"] for t in techniques], default=1)
    return {
        "name": "Valhalla SOC — TTPs detectadas",
        "versions": {"layer": "4.5", "navigator": "4.9", "attack": "14"},
        "domain": "enterprise-attack",
        "description": f"Técnicas observadas en las últimas {hours}h",
        "gradient": {"colors": ["#ffe766", "#ff6666"], "minValue": 0, "maxValue": max_score},
        "techniques": techniques,
    }


@app.get("/api/hunting/queries")
async def hunting_queries(current: User = Depends(get_current_user)):
    return hunting.list_queries()


@app.get("/api/hunting/run/{query_id}")
async def hunting_run(query_id: str = Path(..., pattern=r"^[a-z_]{3,40}$"), hours: int = Query(168, ge=1, le=720), current: User = Depends(get_current_user)):
    if current.role.lower() not in ("admin", "analyst", "analista"):
        raise HTTPException(403, "Solo admin o analista puede ejecutar threat hunting")
    return await hunting.run_query(query_id, hours=hours)


# ─────────────────────────────────────────────
# CVE INTEL — feed de vulnerabilidades + post IA para redes (Fase 5)
# La IA redacta un BORRADOR (no publica). Difusión la decide el analista.
# ─────────────────────────────────────────────
@app.get("/api/cve/latest")
async def cve_latest(limit: int = Query(15, ge=1, le=50), _=Depends(get_current_user)):
    return await cve_feed.get_latest_cves(limit)


@app.get("/api/cve/{cve_id}/enrich")
async def cve_enrich_one(cve_id: str = Path(..., pattern=r"^CVE-\d{4}-\d{4,7}$"), _=Depends(get_current_user)):
    """CVSS (NVD), PoC públicos (GitHub), Exploit-DB y prioridad de parcheo para una CVE."""
    from app import cve_enrich
    kev = next((c for c in cve_feed._CACHE.get("data", []) if c.get("id") == cve_id), None)
    return await cve_enrich.enrich(cve_id, kev)


@app.get("/api/cve/{cve_id}/exploits")
async def cve_exploits(cve_id: str, _=Depends(get_current_user)):
    """Exploits públicos (Exploit-DB / searchsploit en Kali) para una CVE."""
    from app import exploit_search
    return await exploit_search.search_exploits(cve_id)


@app.post("/api/cve/social-post")
@limiter.limit("10/minute")
async def cve_social_post(request: Request, req: SocialPostIn | None = None, current: User = Depends(get_current_user)):
    """La IA redacta un post de difusión. Si se indican cve_ids, sobre esas; si no, top recientes."""
    if current.role.lower() not in ("admin", "analyst", "analista"):
        raise HTTPException(403, "Solo admin o analista puede generar el post")
    cves = await cve_feed.get_latest_cves(50)
    ids = (req.cve_ids if req else []) or []
    if ids:
        idset = {i.upper() for i in ids}
        selected = [c for c in cves if c["id"].upper() in idset][:8]
        if not selected:
            raise HTTPException(404, "No se encontraron las CVE seleccionadas en el feed actual")
    else:
        selected = sorted(cves, key=lambda c: c.get("published", ""), reverse=True)[:5]
    post = await draft_social_post(selected)
    return {"post": post, "cves_used": [{"id": c["id"], "severity": c.get("severity")} for c in selected], "auto_published": False}


# ─────────────────────────────────────────────────────────────────────────────
# CENTRO DE INFORMES — informes por periodo con datos reales, historial y huella
# ─────────────────────────────────────────────────────────────────────────────

_REPORT_ID_RE = r"^VHL-\d{8}-\d{3,}$"


def _require_report_role(user: User) -> None:
    if user.role not in ("admin", "analyst", "analista"):
        raise HTTPException(403, "Solo admin o analista puede gestionar informes")


def _report_summary(r: Report) -> dict[str, Any]:
    risk = (r.data or {}).get("risk", {})
    return {
        "report_id": r.report_id, "kind": r.kind, "tlp": r.tlp,
        "period_start": r.period_start.isoformat(), "period_end": r.period_end.isoformat(),
        "created_by": r.created_by_username, "created_at": r.created_at.isoformat(),
        "sha256": r.sha256, "risk_level": risk.get("level"), "risk_score": risk.get("score"),
    }


@app.get("/api/reports")
async def list_reports(db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    _require_report_role(current)
    rows = (await db.execute(select(Report).order_by(desc(Report.created_at)).limit(100))).scalars().all()
    return [_report_summary(r) for r in rows]


@app.post("/api/reports/generate")
async def generate_report(req: ReportGenerateIn, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    _require_report_role(current)
    start = req.start if req.start.tzinfo else req.start.replace(tzinfo=timezone.utc)
    end = req.end if req.end.tzinfo else req.end.replace(tzinfo=timezone.utc)
    if end <= start:
        raise HTTPException(422, "El fin del periodo debe ser posterior al inicio")
    if end - start > timedelta(days=366):
        raise HTTPException(422, "El periodo no puede superar un año")

    data = await rb.build_report(db, start, end, author=current.username, tlp=req.tlp, kind=req.kind)

    data["ai_summary"] = None
    if req.include_ai_summary:
        context = {
            "periodo": f"{start:%Y-%m-%d} a {end:%Y-%m-%d}",
            "alertas": data["alerts"].get("total"), "por_severidad": data["alerts"].get("by_severity"),
            "incidentes": data["incidents"]["total"], "mttr_min": data["incidents"]["mttr_minutes"],
            "fuerza_bruta": data["honeypot"].get("bruteforce_detections"),
            "intrusiones": data["honeypot"].get("intrusions_after_bruteforce"),
            "tecnicas_mitre": [t["id"] for t in data["alerts"].get("mitre_techniques", [])][:8],
            "riesgo": data["risk"],
        }
        summary = await generate_executive_summary(context)
        if summary and not summary.startswith(_AI_UNAVAILABLE):
            data["ai_summary"] = summary
        else:
            data["limitations"].append("La IA local no estaba disponible: el resumen ejecutivo es solo cuantitativo.")

    row = await _store_report(db, data, start, end, current, req.tlp, req.kind)
    return {**_report_summary(row), "data": data}


async def _store_report(db: AsyncSession, data: dict, start: datetime, end: datetime, user: User, tlp: str, kind: str) -> Report:
    """Asigna el id VHL-AAAAMMDD-NNN, calcula la huella SHA-256 y guarda el informe."""
    today = datetime.now(timezone.utc).strftime("%Y%m%d")
    seq = (await db.execute(select(func.count(Report.id)).where(Report.report_id.like(f"VHL-{today}-%")))).scalar() or 0
    report_id = f"VHL-{today}-{seq + 1:03d}"
    data["meta"]["report_id"] = report_id
    row = Report(report_id=report_id, kind=kind, tlp=tlp, period_start=start, period_end=end,
                 created_by_id=user.id, created_by_username=user.username, sha256=rb.fingerprint(data), data=data)
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


@app.get("/api/reports/{report_id}")
async def get_report(report_id: str = Path(..., pattern=_REPORT_ID_RE), db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    _require_report_role(current)
    r = (await db.execute(select(Report).where(Report.report_id == report_id))).scalar_one_or_none()
    if not r:
        raise HTTPException(404, "Informe no encontrado")
    return {**_report_summary(r), "data": r.data}


@app.get("/api/reports/{report_id}/verify")
async def verify_report(report_id: str = Path(..., pattern=_REPORT_ID_RE), db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    """Recalcula la huella del contenido guardado y la compara con la registrada al generarlo."""
    _require_report_role(current)
    r = (await db.execute(select(Report).where(Report.report_id == report_id))).scalar_one_or_none()
    if not r:
        raise HTTPException(404, "Informe no encontrado")
    current_hash = rb.fingerprint(r.data)
    return {"ok": hmac.compare_digest(current_hash, r.sha256), "stored": r.sha256, "current": current_hash}
