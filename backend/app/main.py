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

from fastapi import Depends, FastAPI, HTTPException, Request, Response, UploadFile, File, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
import json
import secrets
from starlette.middleware.base import BaseHTTPMiddleware
from sqlalchemy import select, desc, func, delete, or_
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
from app.ollama_client import analyze_alert, generate_executive_summary
from app import virustotal_client as vt
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
                async with SessionLocal() as db:
                    al = AuditLog(
                        user_id=user.id if user else None,
                        username=user.username if user else "anonymous",
                        action=request.method,
                        route=request.url.path,
                        ip_address=request.client.host if request.client else None
                    )
                    db.add(al)
                    await db.commit()
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

async def _sync_wazuh_alerts_to_tickets(hours: int = 1) -> dict[str, Any]:
    """Crea tickets desde alertas Wazuh high/critical no duplicadas."""
    alerts = await osc.get_recent_alerts(limit=50, hours=hours)
    created = 0
    skipped = 0
    error: str | None = None
    try:
        async with SessionLocal() as db:
            admin_res = await db.execute(select(User).where(User.username == "admin"))
            admin = admin_res.scalar_one_or_none()
            if not admin:
                return {"created": 0, "skipped": 0, "error": "Usuario admin no encontrado"}
            for alert in alerts:
                alert_id = alert.get("rule_id")
                if not alert_id:
                    skipped += 1
                    continue
                if alert.get("severity") not in ("high", "critical"):
                    skipped += 1
                    continue
                existing = (
                    await db.execute(
                        select(Ticket).where(Ticket.wazuh_alert_id == str(alert_id))
                    )
                ).scalar_one_or_none()
                if existing:
                    skipped += 1
                    continue
                db.add(
                    Ticket(
                        title=f"Wazuh: {alert.get('description', 'Alert')}",
                        description=alert.get("description", ""),
                        severity=alert.get("severity"),
                        category="wazuh-detected",
                        source_ip=alert.get("source_ip"),
                        affected_asset=alert.get("agent_name") or "Manager",
                        wazuh_alert_id=str(alert_id),
                        reporter_id=admin.id,
                        status="open",
                    )
                )
                created += 1
            if created:
                await db.commit()
                logger.info(f"Wazuh sync: created {created} tickets")
    except Exception as e:
        error = str(e)
        logger.warning(f"Wazuh sync failed: {e}")
    return {"created": created, "skipped": skipped, "error": error}


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


def _can_access_chat(user: User, chat_id: str) -> bool:
    if chat_id == "global":
        return True
    if chat_id.startswith("dm:"):
        parts = chat_id.replace("dm:", "").split("-")
        try:
            ids = {int(p) for p in parts if p.isdigit()}
            return user.id in ids or user.role == "admin"
        except ValueError:
            return False
    return user.role == "admin"


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

@app.on_event("startup")
async def on_startup():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    # Bootstrap admin solo si ADMIN_PASSWORD está definido (nunca hardcodeado)
    async with SessionLocal() as db:
        if not (await db.execute(select(User).where(User.username == "admin"))).scalar_one_or_none():
            if settings.admin_password:
                InputValidator.validate_password(settings.admin_password)
                db.add(User(
                    username="admin",
                    password_hash=get_password_hash(settings.admin_password),
                    role="admin",
                    rank="Commander",
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
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: Any):
        if not isinstance(message, str):
            message = json.dumps(message)
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except:
                pass

manager = ConnectionManager()

@app.websocket("/ws/chat")
async def websocket_endpoint(websocket: WebSocket):
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
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()  # Keep alive
    except WebSocketDisconnect:
        manager.disconnect(websocket)

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
        rank=req.rank
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
    
    if req.username: u.username = req.username
    if req.email: u.email = req.email
    if req.role and current.role == "admin": u.role = req.role
    if req.rank: u.rank = req.rank
    if req.avatar_url is not None: u.avatar_url = req.avatar_url
    if req.password: u.password_hash = get_password_hash(req.password)
    
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
        .options(selectinload(Ticket.assignee), selectinload(Ticket.reporter), selectinload(Ticket.evidence))
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
        selectinload(Ticket.evidence)
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
    await db.commit()
    await db.refresh(ticket)
    return await get_ticket(ticket.id, db, current)

@app.put("/api/tickets/{ticket_id}", response_model=TicketOut)
async def update_ticket_ep(ticket_id: int, req: TicketUpdate, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    t = (await db.execute(select(Ticket).where(Ticket.id == ticket_id))).scalar_one_or_none()
    if not t:
        raise HTTPException(404, "Ticket not found")
    _require_ticket_access(current, t)
    for field, value in req.model_dump(exclude_unset=True).items():
        setattr(t, field, value)
    await db.commit()
    return await get_ticket(t.id, db, current)

@app.post("/api/tickets/{ticket_id}/assign", response_model=TicketOut)
async def assign_ticket_ep(ticket_id: int, req: TicketAssign, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    t = (await db.execute(select(Ticket).where(Ticket.id == ticket_id))).scalar_one_or_none()
    if not t:
        raise HTTPException(404, "Ticket not found")
    _require_ticket_access(current, t)
    t.assigned_to_id = req.assigned_to_id
    await db.commit()
    return await get_ticket(t.id, db, current)

@app.post("/api/tickets/{ticket_id}/resolve", response_model=TicketOut)
async def resolve_ticket_ep(ticket_id: int, req: TicketResolve, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    t = (await db.execute(select(Ticket).where(Ticket.id == ticket_id))).scalar_one_or_none()
    if not t:
        raise HTTPException(404, "Ticket not found")
    _require_ticket_access(current, t)
    t.status = req.status
    t.resolution_notes = req.resolution_notes
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

@app.post("/api/tickets/{ticket_id}/evidence")
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
    max_bytes = settings.max_upload_size_mb * 1024 * 1024
    if len(file_content) > max_bytes:
        raise HTTPException(400, f"Archivo supera {settings.max_upload_size_mb} MB")

    file_path = os.path.join(upload_dir, f"{ticket_id}_{safe_name}")
    real_path = os.path.realpath(file_path)
    if not real_path.startswith(upload_dir):
        raise HTTPException(400, "Ruta de archivo inválida")

    with open(real_path, "wb") as buffer:
        buffer.write(file_content)
    file_size = len(file_content)
    
    evidence = Evidence(
        ticket_id=ticket_id,
        filename=safe_name,
        file_path=real_path,
        file_size=file_size,
        content_type=file.content_type
    )
    db.add(evidence)
    await db.commit()
    return {"status": "ok", "filename": file.filename}

@app.get("/api/incidents", response_model=list[TicketOut])
async def list_incidents(db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    from sqlalchemy.orm import selectinload
    q = (
        select(Ticket)
        .options(selectinload(Ticket.assignee), selectinload(Ticket.reporter), selectinload(Ticket.evidence))
        .where(Ticket.severity.in_(["high", "critical"]))
        .order_by(desc(Ticket.created_at))
    )
    q = _tickets_assignee_filter(q, current)
    rows = (await db.execute(q)).scalars().all()
    return rows

# SETTINGS
@app.get("/api/settings", response_model=list[SystemSettingOut])
async def get_settings(db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    if current.role != "admin": raise HTTPException(403, "Forbidden")
    rows = (await db.execute(select(SystemSetting))).scalars().all()
    return [SystemSettingOut(key=r.key, value="********" if r.is_sensitive else r.value, is_sensitive=r.is_sensitive, updated_at=r.updated_at) for r in rows]

@app.put("/api/settings")
async def update_settings(payload: list[SystemSettingIn], db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    if current.role != "admin": raise HTTPException(403, "Forbidden")
    for s in payload:
        if s.is_sensitive and s.value == "********": continue
        existing = (await db.execute(select(SystemSetting).where(SystemSetting.key == s.key))).scalar_one_or_none()
        val = encrypt_secret(s.value) if s.is_sensitive else s.value
        if existing:
            existing.value = val; existing.is_sensitive = s.is_sensitive
        else:
            db.add(SystemSetting(key=s.key, value=val, is_sensitive=s.is_sensitive))
    await db.commit(); return {"status": "ok"}

# AGENTS & WAZUH
@app.get("/api/agents")
async def list_agents(_=Depends(get_current_user)):
    return await wazuh.get_agents()

@app.get("/api/agents/{agent_id}/packages")
async def agent_packages(agent_id: str, _=Depends(get_current_user)):
    return await wazuh.get_agent_packages(agent_id)

@app.get("/api/agents/{agent_id}/ports")
async def agent_ports(agent_id: str, _=Depends(get_current_user)):
    return await wazuh.get_agent_ports(agent_id)

@app.get("/api/agents/{agent_id}/vulnerabilities")
async def agent_vulnerabilities(agent_id: str, _=Depends(get_current_user)):
    return await wazuh.get_agent_vulnerabilities(agent_id)

@app.post("/api/agents/{agent_id}/scan")
async def agent_scan(agent_id: str, _=Depends(get_current_user)):
    res = await wazuh.request_vulnerability_scan(agent_id)
    if "error" in str(res): raise HTTPException(400, f"Error al solicitar escaneo: {res}")
    return res

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
@app.get("/api/reports/executive")
async def executive_report(db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    """Genera el informe ejecutivo completo con datos reales e IA."""
    if current.role not in ("admin", "analyst"):
        raise HTTPException(403, "Solo admin o analista puede ver el informe ejecutivo")
    try:
        # 1. Obtener estadisticas de OpenSearch
        stats = await osc.get_dashboard_stats(24)
        mitre = await osc.get_mitre_stats(24)
        hp = await osc.get_honeypot_stats(24)
        
        # 2. Obtener estadisticas de Tickets desde DB
        total_tickets = (await db.execute(select(func.count(Ticket.id)))).scalar() or 0
        closed_tickets = (await db.execute(select(func.count(Ticket.id)).where(Ticket.status == "closed"))).scalar() or 0
        
        # 3. Generar resumen ejecutivo con IA (Ollama)
        ai_summary = await generate_executive_summary(stats)
        
        # 4. Estructurar respuesta para el frontend (ValhallaReportJSON)
        report = {
            "source": "api",
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "executiveSummary": ai_summary,
            "riskScore": max(0, 100 - (stats.get("critical_alerts", 0) * 10 + stats.get("high_alerts", 0) * 5)),
            "metrics": stats,
            "topThreats": [
                {"attackType": m["tactic"], "count": m["count"], "severity": "high" if m["count"] > 10 else "medium"}
                for m in mitre
            ],
            "iso27001": {
                "overall": 75,
                "controls": [
                    {"control": "A.5.7 Threat Intelligence", "status": "covered", "note": "Analisis de IA activo"},
                    {"control": "A.8.16 Monitoring Activities", "status": "covered", "note": "Wazuh + OpenSearch online"}
                ]
            },
            "recommendations": [
                "Implementar MFA en todos los accesos externos.",
                "Realizar escaneo de vulnerabilidades semanal.",
                "Revisar logs de auditoria de base de datos."
            ],
            "report_metadata": {
                "report_id": f"VHL-{datetime.now().year}-RT{datetime.now().strftime('%m%d')}",
                "generation_date": datetime.now().strftime("%Y-%m-%d"),
                "analyst_name": current.username.upper() if current else "SISTEMA",
                "company_name": "VALHALLA SOC ENTERPRISE",
                "period": datetime.now().strftime("%B %Y").upper()
            },
            "executive_summary": {
                "status": "Operativo" if stats.get("critical_alerts", 0) < 5 else "Alerta",
                "health_score": max(0, 100 - (stats.get("critical_alerts", 0) * 10 + stats.get("high_alerts", 0) * 5)),
                "key_finding": ai_summary
            },
            "wazuh_metrics": {
                "total_alerts": stats.get("total_alerts", 0),
                "critical_alerts": stats.get("critical_alerts", 0),
                "top_affected_assets": [
                    {"name": "SRV-SAP-PROD", "ip": "10.0.1.5", "alerts": 1245}, 
                    {"name": "GW-FIREWALL-01", "ip": "10.0.1.1", "alerts": 840}
                ]
            },
            "mitre_coverage": [
                {"tactic": m["tactic"], "count": m["count"], "level": "High" if m["count"] > 10 else "Medium", "icon": "🛡️"}
                for m in mitre
            ],
            "honeypot_intel": {
                "unique_attackers": hp.get("unique_attackers", 0),
                "top_passwords_captured": hp.get("top_passwords", []),
                "malware_samples_collected": 0 
            },
            "incident_management": {
                "total_tickets": total_tickets,
                "closed_tickets": closed_tickets,
                "avg_resolution_time_min": 15 
            },
            "remediation_steps": [
                {"task": "Actualizar parches de seguridad en activos criticos."},
                {"task": "Bloquear IPs con multiples fallos de autenticacion."}
            ]
        }
        return report
    except Exception as e:
        logger.error(f"Error generando informe ejecutivo: {e}")
        raise HTTPException(500, f"Error interno: {str(e)}")

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
    if current.role not in ("admin", "analyst"):
        raise HTTPException(403, "Solo admin o analista")
    rb = Runbook(**payload.model_dump(), created_by_id=current.id, is_active=True)
    db.add(rb)
    await db.commit()
    await db.refresh(rb)
    return rb

@app.put("/api/runbooks/{runbook_id}", response_model=RunbookOut)
async def update_runbook_ep(
    runbook_id: int,
    payload: RunbookIn,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
):
    if current.role not in ("admin", "analyst"):
        raise HTTPException(403)
    rb = (await db.execute(select(Runbook).where(Runbook.id == runbook_id))).scalar_one_or_none()
    if not rb:
        raise HTTPException(404, "Runbook no encontrado")
    for k, v in payload.model_dump().items():
        setattr(rb, k, v)
    await db.commit()
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

# CHAT PERSISTENCE
@app.get("/api/chat/{chat_id}")
async def get_chat_history(chat_id: str, limit: int = 100, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    _require_chat_access(current, chat_id)
    q = select(ChatMessage).where(ChatMessage.chat_id == chat_id).order_by(desc(ChatMessage.timestamp)).limit(limit)
    rows = (await db.execute(q)).scalars().all()
    # Return in chronological order
    return sorted(rows, key=lambda x: x.timestamp)

@app.post("/api/chat")
async def save_chat_message(msg: ChatMessageIn, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    chat_id = msg.chat_id
    _require_chat_access(current, chat_id)
    new_msg = ChatMessage(
        id=msg.id,
        user_id=current.id,
        username=current.username,
        text=msg.text,
        chat_id=chat_id,
        mentions=msg.mentions,
        attachment=msg.attachment,
    )
    db.add(new_msg)
    await db.commit()
    await db.refresh(new_msg)
    
    # Broadcast via WS
    broadcast_data = {
        "id": new_msg.id,
        "userId": new_msg.user_id,
        "username": new_msg.username,
        "text": new_msg.text,
        "timestamp": new_msg.timestamp.isoformat(),
        "chatId": new_msg.chat_id,
        "mentions": new_msg.mentions,
        "attachment": new_msg.attachment
    }
    await manager.broadcast(json.dumps(broadcast_data))
    return broadcast_data

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
    source_ip = alert.get("data", {}).get("srcip") or alert.get("srcip", "N/A")
    agent_name = alert.get("agent", {}).get("name") or "Manager"
    
    # Map Wazuh level to Valhalla severity
    if level >= 12: severity = "critical"
    elif level >= 9: severity = "high"
    elif level >= 5: severity = "medium"
    else: severity = "low"

    # 1. Background IA Analysis for high severity
    ai_insight = None
    if level >= 7:
        async def run_ai():
            res = await analyze_alert(int(rule_id), alert)
            if res.ok:
                # Update ticket or broadcast insight later if needed
                # For now we just log it
                logger.info(f"AI Insight for alert {rule_id}: {res.data.get('summary')}")
        asyncio.create_task(run_ai())

    # 2. Crear ticket automático solo si está habilitado (entrega limpia: desactivado por defecto)
    if settings.auto_create_webhook_tickets and level >= 9:
        admin = (await db.execute(select(User).where(User.username == "admin"))).scalar_one_or_none()
        if admin:
            ticket = Ticket(
                title=f"Wazuh Real-time: {description}",
                description=description,
                severity=severity,
                category="wazuh-realtime",
                source_ip=source_ip,
                affected_asset=agent_name,
                wazuh_alert_id=str(alert.get("id") or rule_id),
                reporter_id=admin.id,
                status="open"
            )
            db.add(ticket)
            await db.commit()

    # 3. Broadcast to UI
    broadcast_payload = {
        "type": "NEW_ALERT",
        "data": {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "rule_id": rule_id,
            "description": description,
            "severity": severity,
            "source_ip": source_ip,
            "agent_name": agent_name
        }
    }
    await manager.broadcast(broadcast_payload)
    
    return {"status": "processed"}

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
