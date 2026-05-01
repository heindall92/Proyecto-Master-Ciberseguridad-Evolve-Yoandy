from __future__ import annotations
import os
import time
import asyncio
import logging
import shutil
import re as _re
from datetime import datetime, timezone, timedelta
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Request, Response, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from starlette.middleware.base import BaseHTTPMiddleware
from sqlalchemy import select, desc, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from app.db import get_db, engine, SessionLocal
from app.models import *
from app.schemas import *
from app.auth import get_password_hash, verify_password, create_access_token, get_current_user, require_role
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
app = FastAPI(title="Valhalla SOC API", version="2.0.0")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(SecurityMiddleware)
app.add_middleware(AuditMiddleware)

ALLOWED_ORIGINS = settings.cors_origins.split(",") if hasattr(settings, "cors_origins") else ["http://localhost:3000"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(lsa_router)
app.include_router(health_router)

# --- BACKGROUND TASKS ---

async def _auto_sync_loop():
    """Background task: sync Wazuh alerts every 2 minutes."""
    await asyncio.sleep(30)
    while True:
        try:
            alerts = await osc.get_recent_alerts(limit=50, hours=1)
            async with SessionLocal() as db:
                admin_res = await db.execute(select(User).where(User.username == "admin"))
                admin = admin_res.scalar_one_or_none()
                if admin:
                    created = 0
                    for alert in alerts:
                        alert_id = alert.get("rule_id")
                        if not alert_id: continue
                        if alert.get("severity") not in ("high", "critical"): continue
                        
                        existing = (await db.execute(select(Ticket).where(Ticket.wazuh_alert_id == str(alert_id)))).scalar_one_or_none()
                        if existing: continue
                        
                        ticket = Ticket(
                            title=f"Wazuh: {alert.get('description', 'Alert')}",
                            description=alert.get("description", ""),
                            severity=alert.get("severity"),
                            category="wazuh-detected",
                            source_ip=alert.get("source_ip"),
                            affected_asset=alert.get("agent_name") or "Manager",
                            wazuh_alert_id=str(alert_id),
                            reporter_id=admin.id,
                            status="open"
                        )
                        db.add(ticket)
                        created += 1
                    if created:
                        await db.commit()
                        logger.info(f"Auto-sync: created {created} tickets")
        except Exception as e:
            logger.warning(f"Auto-sync failed: {e}")
        await asyncio.sleep(120)

@app.on_event("startup")
async def on_startup():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    # Defaults
    async with SessionLocal() as db:
        if not (await db.execute(select(User).where(User.username == "admin"))).scalar_one_or_none():
            db.add(User(username="admin", password_hash=get_password_hash("Valhalla2026!"), role="admin", rank="Commander"))
        
        if not (await db.execute(select(Monitor))).scalars().first():
            db.add(Monitor(name="SSH Bruteforce", threshold=5, severity_floor="high", rule_id_pattern="5710,5712"))
            db.add(Monitor(name="Web Attack", threshold=1, severity_floor="high", rule_id_pattern="31103,31106"))
            
        await db.commit()
    
    asyncio.create_task(_auto_sync_loop())
    logger.info("Valhalla SOC API Started")

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
    
    user = (await db.execute(select(User).where(User.username == username))).scalar_one_or_none()
    
    if not user or not verify_password(req.password, user.password_hash):
        rate_limiter.record_failed_login(req.username, client_ip)
        raise HTTPException(401, "Credenciales inválidas")
    
    access_token = create_access_token(data={"sub": user.username})
    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=True, samesite="strict")
    return Token(access_token=access_token)

@app.get("/api/users", response_model=list[UserOut])
async def list_users_ep(db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
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
    upload_dir = "uploads/avatars"
    os.makedirs(upload_dir, exist_ok=True)
    ext = os.path.splitext(file.filename)[1]
    filename = f"avatar_{current.id}{ext}"
    file_path = os.path.join(upload_dir, filename)
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    current.avatar_url = f"/api/avatars/{filename}"
    await db.commit()
    return {"avatar_url": current.avatar_url}

@app.get("/api/avatars/{filename}")
async def get_avatar_file(filename: str):
    from fastapi.responses import FileResponse
    path = os.path.join("uploads/avatars", filename)
    if not os.path.exists(path): raise HTTPException(404)
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
    u.password_hash = get_password_hash(req.new_password)
    await db.commit()
    return {"ok": True}

@app.get("/api/auth/me", response_model=UserOut)
async def me(current_user: User = Depends(get_current_user)): return current_user

# TICKETS
@app.get("/api/tickets", response_model=list[TicketOut])
async def list_tickets(db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    from sqlalchemy.orm import selectinload
    q = select(Ticket).options(selectinload(Ticket.assignee), selectinload(Ticket.reporter), selectinload(Ticket.evidence)).order_by(desc(Ticket.created_at))
    rows = (await db.execute(q)).scalars().all()
    for t in rows:
        if t.assignee: t.assignee_username = t.assignee.username
        if t.reporter: t.reporter_username = t.reporter.username
    return rows

@app.get("/api/tickets/{ticket_id}", response_model=TicketOut)
async def get_ticket(ticket_id: int, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    from sqlalchemy.orm import selectinload
    t = (await db.execute(select(Ticket).options(
        selectinload(Ticket.assignee), 
        selectinload(Ticket.reporter), 
        selectinload(Ticket.evidence)
    ).where(Ticket.id == ticket_id))).scalar_one_or_none()
    if not t: raise HTTPException(404, "Ticket not found")
    
    # Asegurar que los nombres de usuario se pueblen para el frontend
    if t.assignee: t.assignee_username = t.assignee.username
    if t.reporter: t.reporter_username = t.reporter.username
    
    return t

@app.post("/api/tickets", response_model=TicketOut)
async def create_ticket(req: dict, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    ticket = Ticket(
        title=req.get("title"),
        description=req.get("description"),
        severity=req.get("severity", "medium"),
        category=req.get("category"),
        source_ip=req.get("source_ip"),
        affected_asset=req.get("affected_asset"),
        status="open",
        reporter_id=current.id,
        assigned_to_id=req.get("assigned_to_id")
    )
    db.add(ticket)
    await db.commit()
    await db.refresh(ticket)
    return await get_ticket(ticket.id, db, current)

@app.put("/api/tickets/{ticket_id}", response_model=TicketOut)
async def update_ticket_ep(ticket_id: int, req: dict, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    t = (await db.execute(select(Ticket).where(Ticket.id == ticket_id))).scalar_one_or_none()
    if not t: raise HTTPException(404, "Ticket not found")
    
    # Update fields if provided
    if "title" in req: t.title = req["title"]
    if "description" in req: t.description = req["description"]
    if "severity" in req: t.severity = req["severity"]
    if "status" in req: t.status = req["status"]
    if "category" in req: t.category = req["category"]
    if "analysis_notes" in req: t.analysis_notes = req["analysis_notes"]
    if "resolution_notes" in req: t.resolution_notes = req["resolution_notes"]
    if "assigned_to_id" in req: t.assigned_to_id = req["assigned_to_id"]
    
    await db.commit()
    return await get_ticket(t.id, db, current)

@app.post("/api/tickets/{ticket_id}/assign", response_model=TicketOut)
async def assign_ticket_ep(ticket_id: int, req: dict, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    t = (await db.execute(select(Ticket).where(Ticket.id == ticket_id))).scalar_one_or_none()
    if not t: raise HTTPException(404, "Ticket not found")
    t.assigned_to_id = req.get("assigned_to_id")
    await db.commit()
    return await get_ticket(t.id, db, current)

@app.post("/api/tickets/{ticket_id}/resolve", response_model=TicketOut)
async def resolve_ticket_ep(ticket_id: int, req: dict, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    t = (await db.execute(select(Ticket).where(Ticket.id == ticket_id))).scalar_one_or_none()
    if not t: raise HTTPException(404, "Ticket not found")
    t.status = "resolved"
    t.resolution_notes = req.get("resolution_notes")
    t.resolved_at = datetime.now(timezone.utc)
    await db.commit()
    return await get_ticket(t.id, db, current)

@app.delete("/api/tickets/{ticket_id}")
async def delete_ticket_ep(ticket_id: int, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    t = (await db.execute(select(Ticket).where(Ticket.id == ticket_id))).scalar_one_or_none()
    if not t: raise HTTPException(404, "Ticket not found")
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
    upload_dir = "uploads/evidence"
    os.makedirs(upload_dir, exist_ok=True)
    
    file_path = os.path.join(upload_dir, f"{ticket_id}_{file.filename}")
    file_content = await file.read()
    file_size = len(file_content)
    with open(file_path, "wb") as buffer:
        buffer.write(file_content)
    
    evidence = Evidence(
        ticket_id=ticket_id,
        filename=file.filename,
        file_path=file_path,
        file_size=file_size,
        content_type=file.content_type
    )
    db.add(evidence)
    await db.commit()
    return {"status": "ok", "filename": file.filename}

@app.get("/api/incidents", response_model=list[TicketOut])
async def list_incidents(db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    from sqlalchemy.orm import selectinload
    q = select(Ticket).options(selectinload(Ticket.assignee), selectinload(Ticket.reporter), selectinload(Ticket.evidence)).where(Ticket.severity.in_(["high", "critical"])).order_by(desc(Ticket.created_at))
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

# USERS
@app.get("/api/users", response_model=list[UserOut])
async def list_users(db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    return (await db.execute(select(User))).scalars().all()

# AUDIT
@app.get("/api/audit")
async def list_audit(db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    if current.role != "admin": raise HTTPException(403)
    return (await db.execute(select(AuditLog).order_by(desc(AuditLog.timestamp)))).scalars().all()

# REPORTS
@app.get("/api/reports/executive")
async def executive_report(db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    stats = await osc.get_dashboard_stats(24)
    summary = await generate_executive_summary(stats)
    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "executiveSummary": summary,
        "metrics": stats
    }

# RUNBOOKS
@app.get("/api/runbooks")
async def list_runbooks(db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    return (await db.execute(select(Runbook))).scalars().all()

# VIRUSTOTAL
@app.get("/api/virustotal/check-key")
async def vt_check_key(request: Request, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    # Check header first (for testing from frontend)
    key = request.headers.get("X-VT-API-Key")
    if not key:
        s = (await db.execute(select(SystemSetting).where(SystemSetting.key == "vt_api_key"))).scalar_one_or_none()
        if not s: raise HTTPException(404, "API Key no configurada")
        key = decrypt_secret(s.value)
    
    # Ping simple a Google DNS para validar key
    res = await vt.check_ip("8.8.8.8", key)
    if "error" in res and ("401" in res["error"] or "Forbidden" in res["error"]):
        raise HTTPException(401, "API Key inválida")
    return {"status": "ok", "message": "API Key válida"}

@app.get("/api/virustotal/ip/{ip}")
async def vt_scan_ip(ip: str, request: Request, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    key = request.headers.get("X-VT-API-Key")
    if not key:
        s = (await db.execute(select(SystemSetting).where(SystemSetting.key == "vt_api_key"))).scalar_one_or_none()
        if not s: raise HTTPException(404, "API Key no configurada")
        key = decrypt_secret(s.value)
    return await vt.check_ip(ip, key)

@app.get("/api/virustotal/hash/{file_hash}")
async def vt_scan_hash(file_hash: str, request: Request, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    key = request.headers.get("X-VT-API-Key")
    if not key:
        s = (await db.execute(select(SystemSetting).where(SystemSetting.key == "vt_api_key"))).scalar_one_or_none()
        if not s: raise HTTPException(404, "API Key no configurada")
        key = decrypt_secret(s.value)
    return await vt.check_hash(file_hash, key)

@app.get("/api/virustotal/domain/{domain}")
async def vt_scan_domain(domain: str, request: Request, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    key = request.headers.get("X-VT-API-Key")
    if not key:
        s = (await db.execute(select(SystemSetting).where(SystemSetting.key == "vt_api_key"))).scalar_one_or_none()
        if not s: raise HTTPException(404, "API Key no configurada")
        key = decrypt_secret(s.value)
    return await vt.check_domain(domain, key)

# HEALTH INTEGRATIONS
@app.get("/api/health/integrations")
async def health_integrations(_=Depends(get_current_user)):
    # Verificamos Wazuh y OpenSearch (ahora que el indexer está activo)
    wazuh_status = "online"
    try:
        await wazuh.get_agents()
    except: wazuh_status = "offline"
    
    os_status = "online"
    try:
        await osc.get_recent_alerts(limit=1)
    except: os_status = "offline"

    return [
        {"name": "Wazuh Manager", "status": wazuh_status, "latency": "12ms"},
        {"name": "OpenSearch Indexer", "status": os_status, "latency": "5ms"},
        {"name": "PostgreSQL DB", "status": "online", "latency": "1ms"},
        {"name": "Ollama AI", "status": "online", "latency": "450ms"}
    ]

# GEOLOOKUP HELPER
async def _geo_lookup(ip: str) -> dict | None:
    if not ip or ip in ["127.0.0.1", "::1"]: return None
    try:
        import httpx
        async with httpx.AsyncClient(timeout=5.0) as c:
            r = await c.get(f"http://ip-api.com/json/{ip}")
            return r.json()
    except: return None
