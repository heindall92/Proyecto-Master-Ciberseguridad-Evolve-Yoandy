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

@app.get("/api/auth/me", response_model=UserOut)
async def me(current_user: User = Depends(get_current_user)): return current_user

# TICKETS
@app.get("/api/tickets", response_model=list[TicketOut])
async def list_tickets(db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    from sqlalchemy.orm import selectinload
    q = select(Ticket).options(selectinload(Ticket.assignee), selectinload(Ticket.reporter), selectinload(Ticket.evidence)).order_by(desc(Ticket.created_at))
    rows = (await db.execute(q)).scalars().all()
    return rows

@app.get("/api/tickets/{ticket_id}", response_model=TicketOut)
async def get_ticket(ticket_id: int, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    from sqlalchemy.orm import selectinload
    t = (await db.execute(select(Ticket).options(selectinload(Ticket.assignee), selectinload(Ticket.reporter), selectinload(Ticket.evidence)).where(Ticket.id == ticket_id))).scalar_one_or_none()
    if not t: raise HTTPException(404, "Ticket not found")
    return t

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

@app.get("/api/wazuh/recent-alerts")
async def recent_alerts(limit: int = 50, hours: int = 24, _=Depends(get_current_user)):
    return await osc.get_recent_alerts(limit, hours)

@app.get("/api/wazuh/top-attackers")
async def top_attackers(limit: int = 10, hours: int = 24, _=Depends(get_current_user)):
    return await osc.get_top_attackers(limit, hours)

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

# GEOLOOKUP HELPER
async def _geo_lookup(ip: str) -> dict | None:
    if not ip or ip in ["127.0.0.1", "::1"]: return None
    try:
        import httpx
        async with httpx.AsyncClient(timeout=5.0) as c:
            r = await c.get(f"http://ip-api.com/json/{ip}")
            return r.json()
    except: return None
