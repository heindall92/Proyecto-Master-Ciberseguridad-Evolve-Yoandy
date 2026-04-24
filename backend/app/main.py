from __future__ import annotations
import logging
logger = logging.getLogger("valhalla.main")
import time
from datetime import datetime, timezone, timedelta
from typing import Any
import asyncio

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from sqlalchemy import select, desc, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError

from app.db import get_db, engine, SessionLocal
from app.models import *
from app.schemas import *
from app.auth import get_password_hash, verify_password, create_access_token, get_current_user, require_role
from app.settings import settings

# Security module
from app.security import (
    InputValidator, 
    rate_limiter, 
    SecurityMiddleware,
    check_user_blocked,
    rate_limit_middleware
)

# Security headers middleware
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        return response

app = FastAPI(title="Valhalla SOC API", version="2.0.0")

# Add security headers
app.add_middleware(SecurityHeadersMiddleware)

# Security: Configure CORS properly
ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
# In production, replace with actual domain
import os
if os.environ.get("PRODUCTION"):
    ALLOWED_ORIGINS = [os.environ.get("FRONTEND_URL", "https://your-domain.com")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
)
from app import opensearch_client as osc
from app.wazuh_client import wazuh
from app.ollama_client import analyze_alert
from app import virustotal_client as vt

from app.lsa_monitor import router as lsa_router

app.include_router(lsa_router)


async def _auto_sync_loop():
    """Background task: sync Wazuh alerts and create tickets every 2 minutes."""
    await asyncio.sleep(30)  # wait for startup
    while True:
        try:
            alerts = await osc.get_recent_alerts(limit=50, hours=2)
            async with SessionLocal() as db:
                admin = (await db.execute(select(User).where(User.username == "admin"))).scalar_one_or_none()
                if admin:
                    created = 0
                    for alert in alerts:
                        alert_id = alert.get("id") or alert.get("rule_id")
                        if not alert_id:
                            continue
                        severity = alert.get("severity", "").lower()
                        if severity not in ("high", "critical"):
                            continue
                        existing = (await db.execute(select(Ticket).where(Ticket.wazuh_alert_id == str(alert_id)))).scalar_one_or_none()
                        if existing:
                            continue
                        ticket = Ticket(
                            title=f"Wazuh: {alert.get('description', 'Alert')}",
                            description=alert.get("description", ""),
                            severity=severity,
                            category="wazuh-detected",
                            source_ip=alert.get("source_ip") or None,
                            affected_asset=alert.get("agent_name") or None,
                            wazuh_alert_id=str(alert_id),
                            reporter_id=admin.id,
                            status="open"
                        )
                        db.add(ticket)
                        created += 1
                    if created:
                        await db.commit()
                        logger.info(f"Auto-sync: created {created} tickets from Wazuh alerts")
        except Exception as e:
            logger.warning(f"Auto-sync failed: {e}")
        await asyncio.sleep(120)

@app.on_event("startup")
async def startup():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with SessionLocal() as db:
        q = select(User).where(User.username == "admin")
        if not (await db.execute(q)).scalar_one_or_none():
            db.add(User(username="admin", password_hash=get_password_hash("Valhalla2026!"), role="admin"))
            await db.commit()
    asyncio.create_task(_auto_sync_loop())


@app.get("/health")
async def health(): return {"status": "ok", "version": "2.0.0"}

def _event_out(ev: Event) -> EventOut:
    return EventOut(id=ev.id, timestamp=ev.timestamp, source_ip=str(ev.source_ip) if ev.source_ip else None, attack_type=ev.attack_type, payload=ev.payload, raw_log=ev.raw_log)

def _ticket_out(t: Ticket) -> TicketOut:
    return TicketOut(
        id=t.id, title=t.title, description=t.description, severity=t.severity,
        status=t.status, category=t.category, source_ip=t.source_ip,
        affected_asset=t.affected_asset, wazuh_alert_id=t.wazuh_alert_id,
        assigned_to_id=t.assigned_to_id, reporter_id=t.reporter_id,
        assignee_username=t.assignee.username if t.assignee else None,
        reporter_username=t.reporter.username if t.reporter else None,
        ai_summary=t.ai_summary, ai_recommendation=t.ai_recommendation,
        analysis_notes=t.analysis_notes, resolution_notes=t.resolution_notes,
        created_at=t.created_at, updated_at=t.updated_at, resolved_at=t.resolved_at
    )

# ── Events & Alerts ──────────────────────────────────────────────────────────

@app.post("/events", response_model=EventOut)
async def create_event(payload: EventIn, db: AsyncSession = Depends(get_db)):
    ev = Event(timestamp=payload.timestamp or datetime.now(tz=timezone.utc), source_ip=payload.source_ip, attack_type=payload.attack_type, payload=payload.payload, raw_log=payload.raw_log)
    db.add(ev); await db.commit(); await db.refresh(ev); return _event_out(ev)

@app.get("/events", response_model=list[EventOut])
async def list_events(page: Page = Depends(), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(Event).order_by(desc(Event.timestamp)).limit(page.limit).offset(page.offset))).scalars().all()
    return [_event_out(r) for r in rows]

@app.post("/alerts", response_model=AlertOut)
async def create_alert(payload: AlertIn, db: AsyncSession = Depends(get_db)):
    al = Alert(event_id=payload.event_id, severity=str(payload.severity).lower(), rule_id=payload.rule_id, description=payload.description, timestamp=payload.timestamp or datetime.now(tz=timezone.utc), raw_alert=payload.raw_alert)
    db.add(al); await db.commit(); await db.refresh(al); return al

@app.get("/alerts", response_model=list[AlertOut])
async def list_alerts(page: Page = Depends(), db: AsyncSession = Depends(get_db)):
    return (await db.execute(select(Alert).order_by(desc(Alert.timestamp)).limit(page.limit).offset(page.offset))).scalars().all()

@app.post("/api/analyze/{alert_id}", response_model=AnalysisOut)
async def analyze(alert_id: int, force: bool = False, auto_ticket: bool = True, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    alert = (await db.execute(select(Alert).where(Alert.id == alert_id))).scalar_one_or_none()
    if not alert: raise HTTPException(404, "Alert not found")
    existing = (await db.execute(select(AIAnalysis).where(AIAnalysis.alert_id == alert_id))).scalar_one_or_none()
    if existing and not force:
        if existing.raw_response is None or existing.attack_type.strip().lower() == "unknown":
            await db.delete(existing); await db.commit()
        else:
            return AnalysisOut(alert_id=existing.alert_id, attack_type=existing.attack_type, severity=existing.severity, summary=existing.summary, recommended_action=existing.recommended_action, created_at=existing.created_at)
    if existing and force:
        await db.delete(existing); await db.commit()
    context: dict[str, Any] = {"alert": {"id": alert.id, "severity": alert.severity, "rule_id": alert.rule_id, "description": alert.description, "timestamp": alert.timestamp.isoformat(), "raw_alert": alert.raw_alert}}
    result = await analyze_alert(alert_id=alert_id, context=context)
    data = result.data
    analysis = AIAnalysis(alert_id=alert_id, attack_type=data["attack_type"], severity=data["severity"], summary=data["summary"], recommended_action=data["recommended_action"], raw_response=data.get("raw_response"))
    db.add(analysis)
    try:
        await db.commit(); await db.refresh(analysis)
    except IntegrityError:
        await db.rollback()
        analysis = (await db.execute(select(AIAnalysis).where(AIAnalysis.alert_id == alert_id))).scalar_one_or_none()
        if not analysis: raise
    
    # Auto-crear ticket si severidad es high o critical
    if auto_ticket and data.get("severity") in ["high", "critical"]:
        existing_ticket = (await db.execute(select(Ticket).where(Ticket.wazuh_alert_id == str(alert_id)))).scalar_one_or_none()
        if not existing_ticket:
            ticket = Ticket(
                title=f"AI Alert #{alert_id}: {data['attack_type']}",
                description=f"Ollama Analysis:\n{data['summary']}\n\nRecommended: {data['recommended_action']}",
                severity=data["severity"],
                category="ai-detected",
                wazuh_alert_id=str(alert_id),
                reporter_id=current.id,
                status="open"
            )
            db.add(ticket)
            await db.commit()
            logger.info(f"Auto-created ticket for AI analysis of alert #{alert_id}: severity={data['severity']}")
    
    return AnalysisOut(alert_id=analysis.alert_id, attack_type=analysis.attack_type, severity=analysis.severity, summary=analysis.summary, recommended_action=analysis.recommended_action, created_at=analysis.created_at)

# ── Auth ─────────────────────────────────────────────────────────────────────

@app.post("/api/auth/login", response_model=Token)
async def login(req: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    # Get client IP
    client_ip = request.client.host if request.client else "unknown"
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        client_ip = forwarded.split(",")[0].strip()
    
    try:
        # Validate and sanitize input
        username = InputValidator.validate_username(req.username)
        # Password validation (strong password policy)
        InputValidator.validate_password(req.password)
        
        # Check if IP is blocked
        if rate_limiter.is_ip_blocked(client_ip):
            raise HTTPException(429, "Too many requests. IP temporarily blocked.")
        
        # Record this login attempt for rate limiting
        req_timestamp = time.time()
        rate_limiter.requests[client_ip].append(req_timestamp)
        
        # Try to authenticate
        user = (await db.execute(select(User).where(User.username == username))).scalar_one_or_none()
        
        if not user or not verify_password(req.password, user.password_hash):
            # Record failed login attempt
            rate_limiter.record_failed_login(username, client_ip)
            logger.warning(f"Failed login for {username} from {client_ip}")
            raise HTTPException(401, "Credenciales inválidas")
        
        # Success - clear failed attempts
        rate_limiter.record_successful_login(username)
        logger.info(f"Successful login for {username} from {client_ip}")
        
        return Token(access_token=create_access_token(data={"sub": user.username}))
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        err = traceback.format_exc()
        print(f"LOGIN ERROR: {err}")
        return {"access_token": f"ERROR: {e}", "token_type": "bearer"}

@app.get("/api/auth/me", response_model=UserOut)
async def me(current_user: User = Depends(get_current_user)): return current_user

# ── Users ────────────────────────────────────────────────────────────────────

@app.get("/api/users", response_model=list[UserOut])
async def list_users(db: AsyncSession = Depends(get_db), _=Depends(require_role("admin"))):
    return (await db.execute(select(User).order_by(User.username))).scalars().all()

@app.post("/api/users", response_model=UserOut)
async def create_user(u: UserCreate, db: AsyncSession = Depends(get_db), _=Depends(require_role("admin"))):
    # Validate and sanitize input
    username = InputValidator.validate_username(u.username)
    email = InputValidator.validate_email(u.email) if u.email else None
    password = InputValidator.validate_password(u.password)
    role = u.role.lower() if u.role else "analyst"
    
    # Additional role validation
    valid_roles = ["admin", "analyst", "viewer"]
    if role not in valid_roles:
        raise HTTPException(400, f"Role must be one of: {', '.join(valid_roles)}")
    
    new_user = User(username=username, email=email, password_hash=get_password_hash(password), role=role)
    db.add(new_user)
    try:
        await db.commit(); await db.refresh(new_user); return new_user
    except IntegrityError:
        raise HTTPException(400, "El usuario ya existe")

@app.put("/api/users/{user_id}", response_model=UserOut)
async def update_user(user_id: int, u: UserUpdate, db: AsyncSession = Depends(get_db), _=Depends(require_role("admin"))):
    user = await db.get(User, user_id)
    if not user: raise HTTPException(404, "Usuario no encontrado")
    if u.username: user.username = u.username.lower()
    if u.email: user.email = u.email.lower()
    if u.role: user.role = u.role.lower()
    if u.password: user.password_hash = get_password_hash(u.password)
    try:
        await db.commit(); await db.refresh(user); return user
    except IntegrityError:
        raise HTTPException(400, "Nombre de usuario en uso")

@app.delete("/api/users/{user_id}")
async def delete_user(user_id: int, db: AsyncSession = Depends(get_db), current: User = Depends(require_role("admin"))):
    if user_id == current.id: raise HTTPException(400, "No puedes borrarte a ti mismo")
    user = await db.get(User, user_id)
    if not user: raise HTTPException(404, "Usuario no encontrado")
    await db.delete(user); await db.commit(); return {"ok": True}

@app.post("/api/users/{user_id}/reset-password")
async def reset_password(user_id: int, req: PasswordReset, db: AsyncSession = Depends(get_db), _=Depends(require_role("admin"))):
    user = await db.get(User, user_id)
    if not user: raise HTTPException(404, "Usuario no encontrado")
    user.password_hash = get_password_hash(req.new_password); await db.commit(); return {"ok": True}

# ── Agents ───────────────────────────────────────────────────────────────────

@app.get("/api/agents", response_model=list[AgentOut])
async def list_agents(_=Depends(get_current_user)):
    try:
        r = await wazuh.request("GET", "/agents?select=id,name,ip,os,status&limit=100")
        if r.status_code != 200: raise HTTPException(500, "Wazuh API Error")
        data = r.json().get("data", {}).get("affected_items", [])
        return [AgentOut(id=a["id"], name=a["name"], ip=a.get("ip"), os=a.get("os", {}).get("name", "N/A"), status=a["status"], type="SIEM Agent", agent="Wazuh", group="default") for a in data]
    except Exception as e:
        logger.warning("Agents fetch failed: %s", e); return []

@app.post("/api/agents/enroll", response_model=AgentEnrollOut)
async def enroll_agent(req: AgentEnrollIn, _=Depends(get_current_user)):
    r = await wazuh.request("POST", "/agents", json={"name": req.name})
    if r.status_code != 200: return AgentEnrollOut(ok=False, error=str(r.json().get("title", "Error")))
    agent_id = r.json().get("data", {}).get("id")
    rk = await wazuh.request("GET", f"/agents/{agent_id}/key")
    return AgentEnrollOut(ok=True, id=agent_id, key=rk.json().get("data", {}).get("key"))

@app.get("/api/agents/{agent_id}/packages")
async def get_agent_packages(agent_id: str, _=Depends(get_current_user)):
    r = await wazuh.request("GET", f"/syscollector/{agent_id}/packages?limit=500")
    return r.json().get("data", {}).get("affected_items", [])

@app.get("/api/agents/{agent_id}/ports")
async def get_agent_ports(agent_id: str, _=Depends(get_current_user)):
    r = await wazuh.request("GET", f"/syscollector/{agent_id}/ports")
    return r.json().get("data", {}).get("affected_items", [])

@app.get("/api/agents/{agent_id}/vulnerabilities")
async def get_agent_vulnerabilities(agent_id: str, _=Depends(get_current_user)):
    r = await wazuh.request("GET", f"/vulnerability/{agent_id}?limit=100")
    return r.json().get("data", {}).get("affected_items", [])

# ── Dashboard ─────────────────────────────────────────────────────────────────

@app.get("/api/dashboard")
async def get_dashboard(db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    alerts_total = (await db.execute(select(func.count(Alert.id)))).scalar() or 0
    events_total = (await db.execute(select(func.count(Event.id)))).scalar() or 0
    tickets_open = (await db.execute(select(func.count(Ticket.id)).where(Ticket.status.in_(["open", "in_progress", "escalated"])))).scalar() or 0
    wazuh_stats = {}
    try:
        wazuh_stats = await osc.get_dashboard_stats(24)
    except Exception as e:
        logger.warning(f"Dashboard: Wazuh stats unavailable: {e}")
    return {"metrics": {"alerts": alerts_total, "events": events_total, "tickets_open": tickets_open, "total_alerts_24h": 0, **wazuh_stats}, "status": "operational"}

@app.get("/api/tickets/count/open")
async def get_open_tickets_count(db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    """Optimized endpoint for just open tickets count - used for notifications"""
    tickets_open = (await db.execute(select(func.count(Ticket.id)).where(Ticket.status.in_(["open", "in_progress", "escalated"])))).scalar() or 0
    return {"open": tickets_open}

# ── Tickets (Incident Management) ─────────────────────────────────────────────

from sqlalchemy.orm import selectinload

@app.get("/api/tickets", response_model=list[TicketOut])
async def list_tickets(status: str | None = None, severity: str | None = None, page: Page = Depends(), db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    q = select(Ticket).options(selectinload(Ticket.assignee), selectinload(Ticket.reporter)).order_by(desc(Ticket.created_at))
    if status: q = q.where(Ticket.status == status)
    if severity: q = q.where(Ticket.severity == severity)
    q = q.limit(page.limit).offset(page.offset)
    rows = (await db.execute(q)).scalars().all()
    return [_ticket_out(t) for t in rows]

@app.post("/api/tickets", response_model=TicketOut)
async def create_ticket(payload: TicketCreate, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    t = Ticket(title=payload.title, description=payload.description, severity=payload.severity, category=payload.category, source_ip=payload.source_ip, affected_asset=payload.affected_asset, wazuh_alert_id=payload.wazuh_alert_id, assigned_to_id=payload.assigned_to_id, reporter_id=current.id)
    db.add(t); await db.commit()
    t2 = (await db.execute(select(Ticket).options(selectinload(Ticket.assignee), selectinload(Ticket.reporter)).where(Ticket.id == t.id))).scalar_one()
    return _ticket_out(t2)

@app.get("/api/tickets/{ticket_id}", response_model=TicketOut)
async def get_ticket(ticket_id: int, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    t = (await db.execute(select(Ticket).options(selectinload(Ticket.assignee), selectinload(Ticket.reporter)).where(Ticket.id == ticket_id))).scalar_one_or_none()
    if not t: raise HTTPException(404, "Ticket not found")
    return _ticket_out(t)

@app.put("/api/tickets/{ticket_id}", response_model=TicketOut)
async def update_ticket(ticket_id: int, payload: TicketUpdate, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    t = (await db.execute(select(Ticket).options(selectinload(Ticket.assignee), selectinload(Ticket.reporter)).where(Ticket.id == ticket_id))).scalar_one_or_none()
    if not t: raise HTTPException(404, "Ticket not found")
    for field, val in payload.model_dump(exclude_none=True).items():
        setattr(t, field, val)
    t.updated_at = datetime.now(tz=timezone.utc)
    await db.commit()
    t2 = (await db.execute(select(Ticket).options(selectinload(Ticket.assignee), selectinload(Ticket.reporter)).where(Ticket.id == ticket_id))).scalar_one()
    return _ticket_out(t2)

@app.delete("/api/tickets/{ticket_id}")
async def delete_ticket(ticket_id: int, db: AsyncSession = Depends(get_db), _=Depends(require_role("admin"))):
    t = await db.get(Ticket, ticket_id)
    if not t: raise HTTPException(404, "Ticket not found")
    await db.delete(t); await db.commit(); return {"ok": True}

@app.post("/api/tickets/{ticket_id}/assign", response_model=TicketOut)
async def assign_ticket(ticket_id: int, payload: TicketAssign, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    t = await db.get(Ticket, ticket_id)
    if not t: raise HTTPException(404, "Ticket not found")
    t.assigned_to_id = payload.assigned_to_id
    t.status = "in_progress" if t.status == "open" else t.status
    t.updated_at = datetime.now(tz=timezone.utc)
    await db.commit()
    t2 = (await db.execute(select(Ticket).options(selectinload(Ticket.assignee), selectinload(Ticket.reporter)).where(Ticket.id == ticket_id))).scalar_one()
    return _ticket_out(t2)

@app.post("/api/tickets/{ticket_id}/resolve", response_model=TicketOut)
async def resolve_ticket(ticket_id: int, payload: TicketResolve, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    t = await db.get(Ticket, ticket_id)
    if not t: raise HTTPException(404, "Ticket not found")
    t.status = payload.status; t.resolution_notes = payload.resolution_notes
    t.resolved_at = datetime.now(tz=timezone.utc); t.updated_at = datetime.now(tz=timezone.utc)
    await db.commit()
    t2 = (await db.execute(select(Ticket).options(selectinload(Ticket.assignee), selectinload(Ticket.reporter)).where(Ticket.id == ticket_id))).scalar_one()
    return _ticket_out(t2)

@app.post("/api/tickets/{ticket_id}/analyze", response_model=TicketOut)
async def analyze_ticket(ticket_id: int, payload: TicketAnalysis, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    t = await db.get(Ticket, ticket_id)
    if not t: raise HTTPException(404, "Ticket not found")
    t.analysis_notes = payload.analysis_notes; t.updated_at = datetime.now(tz=timezone.utc)
    await db.commit()
    t2 = (await db.execute(select(Ticket).options(selectinload(Ticket.assignee), selectinload(Ticket.reporter)).where(Ticket.id == ticket_id))).scalar_one()
    return _ticket_out(t2)

@app.delete("/api/tickets/{ticket_id}")
async def delete_ticket(ticket_id: int, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    t = await db.get(Ticket, ticket_id)
    if not t: raise HTTPException(404, "Ticket not found")
    await db.delete(t)
    await db.commit()
    return {"ok": True}

@app.delete("/api/tickets/purge/resolved")
async def purge_resolved_tickets(days: int = 30, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    cutoff = datetime.now(tz=timezone.utc) - timedelta(days=days)
    result = await db.execute(
        select(Ticket).where(Ticket.status.in_(["resolved", "closed"]), Ticket.updated_at < cutoff)
    )
    tickets_to_delete = result.scalars().all()
    count = len(tickets_to_delete)
    for t in tickets_to_delete:
        await db.delete(t)
    await db.commit()
    return {"deleted": count, "cutoff_days": days}

@app.get("/api/tickets/stats/summary")
async def ticket_stats(db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    total = (await db.execute(select(func.count(Ticket.id)))).scalar() or 0
    open_c = (await db.execute(select(func.count(Ticket.id)).where(Ticket.status == "open"))).scalar() or 0
    in_progress = (await db.execute(select(func.count(Ticket.id)).where(Ticket.status == "in_progress"))).scalar() or 0
    resolved = (await db.execute(select(func.count(Ticket.id)).where(Ticket.status.in_(["resolved", "closed"])))).scalar() or 0
    critical = (await db.execute(select(func.count(Ticket.id)).where(Ticket.severity == "critical", Ticket.status.notin_(["resolved", "closed"])))).scalar() or 0
    return {"total": total, "open": open_c, "in_progress": in_progress, "resolved": resolved, "critical_open": critical}

# ── Wazuh Telemetry (via OpenSearch) ─────────────────────────────────────────

@app.get("/api/wazuh/top-attackers")
async def top_attackers(limit: int = 20, hours: int = 24, _=Depends(get_current_user)):
    return await osc.get_top_attackers(limit, hours)

@app.get("/api/wazuh/alert-levels")
async def alert_levels(hours: int = 24, _=Depends(get_current_user)):
    return await osc.get_alert_levels(hours)

@app.get("/api/wazuh/event-types")
async def event_types(hours: int = 24, _=Depends(get_current_user)):
    return await osc.get_event_types(hours)

@app.get("/api/wazuh/mitre")
async def mitre_coverage(hours: int = 168, _=Depends(get_current_user)):
    return await osc.get_mitre_coverage(hours)

@app.get("/api/wazuh/cowrie-timeline")
async def cowrie_timeline(hours: int = 24, interval: str = "1h", _=Depends(get_current_user)):
    return await osc.get_cowrie_timeline(hours, interval)

@app.get("/api/wazuh/cowrie-stats")
async def cowrie_stats(hours: int = 24, _=Depends(get_current_user)):
    return await osc.get_cowrie_stats(hours)

@app.get("/api/wazuh/alert-volume")
async def alert_volume(hours: int = 24, interval: str = "1h", _=Depends(get_current_user)):
    return await osc.get_alert_volume(hours, interval)

@app.get("/api/wazuh/recent-alerts")
async def recent_alerts(limit: int = 100, hours: int = 24, _=Depends(get_current_user)):
    return await osc.get_recent_alerts(limit, hours)

@app.post("/api/wazuh/auto-create-ticket", response_model=TicketOut)
async def auto_create_ticket_from_alert(
    alert_data: dict,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user)
):
    """
    Crea ticket automáticamente desde alerta de Wazuh o análisis de Ollama.
    Fuente: wazuh, ollama, manual
    """
    title = alert_data.get("title")
    description = alert_data.get("description")
    severity = alert_data.get("severity", "medium")
    source_ip = alert_data.get("source_ip")
    affected_asset = alert_data.get("affected_asset")
    wazuh_alert_id = alert_data.get("wazuh_alert_id")
    category = alert_data.get("category", "security")
    
    if not title:
        raise HTTPException(400, "Title is required")
    
    t = Ticket(
        title=title,
        description=description,
        severity=severity.lower(),
        category=category,
        source_ip=source_ip,
        affected_asset=affected_asset,
        wazuh_alert_id=wazuh_alert_id,
        reporter_id=current.id,
        status="open"
    )
    db.add(t)
    await db.commit()
    t2 = (await db.execute(select(Ticket).options(selectinload(Ticket.assignee), selectinload(Ticket.reporter)).where(Ticket.id == t.id))).scalar_one()
    logger.info(f"Auto-created ticket #{t.id} from {alert_data.get('source', 'unknown')}: {title}")
    return _ticket_out(t2)

@app.get("/api/wazuh/sync-alerts", response_model=dict)
async def sync_wazuh_alerts(hours: int = 1, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    """
    Sincroniza alertas de Wazuh y crea tickets automáticamente para alertas de alta severidad.
    """
    if not settings.opensearch_url:
        return {"created": 0, "skipped": 0, "error": "OpenSearch not configured"}
    
    try:
        alerts = await osc.get_recent_alerts(limit=50, hours=hours)
    except Exception as e:
        logger.warning(f"Failed to fetch Wazuh alerts: {e}")
        return {"created": 0, "skipped": 0, "error": str(e)}
    
    created = 0
    skipped = 0
    
    for alert in alerts:
        alert_id = alert.get("id")
        if not alert_id:
            continue
        
        # Verificar si ya existe ticket para esta alerta
        existing = (await db.execute(select(Ticket).where(Ticket.wazuh_alert_id == str(alert_id)))).scalar_one_or_none()
        if existing:
            skipped += 1
            continue
        
        severity = alert.get("severity", "").lower()
        #Solo crear ticket para severidad alta
        if severity in ["high", "critical"]:
            title = f"Wazuh Alert #{alert_id}: {alert.get('rule', 'Unknown')}"
            description = alert.get("description", "")
            source_ip = alert.get("srcip")
            affected_asset = alert.get("agent_name")
            
            ticket = Ticket(
                title=title[:200],
                description=description[:1000] if description else None,
                severity=severity,
                category="wazuh-detected",
                source_ip=source_ip,
                affected_asset=affected_asset,
                wazuh_alert_id=str(alert_id),
                reporter_id=current.id,
                status="open"
            )
            db.add(ticket)
            created += 1
    
    if created > 0:
        await db.commit()
        logger.info(f"Auto-created {created} tickets from Wazuh alerts")
    
    return {"created": created, "skipped": skipped, "error": None}

@app.get("/api/wazuh/services")
async def wazuh_services(_=Depends(get_current_user)):
    try:
        r = await wazuh.request("GET", "/manager/status")
        if r.status_code == 200:
            return r.json().get("data", {}).get("affected_items", [{}])[0]
        return {"error": "Cannot reach Wazuh Manager API"}
    except Exception as e:
        return {"error": str(e)}

# ── VirusTotal ────────────────────────────────────────────────────────────────

@app.get("/api/vt/ip/{ip}")
async def vt_check_ip(ip: str, _=Depends(get_current_user)):
    if not settings.virustotal_api_key:
        raise HTTPException(503, "VirusTotal API key not configured")
    return await vt.check_ip(ip)

@app.get("/api/vt/hash/{file_hash}")
async def vt_check_hash(file_hash: str, _=Depends(get_current_user)):
    if not settings.virustotal_api_key:
        raise HTTPException(503, "VirusTotal API key not configured")
    return await vt.check_hash(file_hash)

@app.get("/api/vt/domain/{domain}")
async def vt_check_domain(domain: str, _=Depends(get_current_user)):
    if not settings.virustotal_api_key:
        raise HTTPException(503, "VirusTotal API key not configured")
    return await vt.check_domain(domain)

# ── IOC Registry ──────────────────────────────────────────────────────────────

def _ioc_out(ioc: IOCEntry) -> dict:
    import json
    return {
        "id": ioc.id,
        "ioc_type": ioc.ioc_type,
        "value": ioc.value,
        "malicious_score": ioc.malicious_score,
        "total_engines": ioc.total_engines,
        "country": ioc.country,
        "asn": ioc.asn,
        "as_owner": ioc.as_owner,
        "tags": json.loads(ioc.tags) if ioc.tags else [],
        "status": ioc.status,
        "analyst_notes": ioc.analyst_notes,
        "related_ticket_id": ioc.related_ticket_id,
        "added_by": ioc.added_by,
        "created_at": ioc.created_at.isoformat(),
        "updated_at": ioc.updated_at.isoformat(),
    }

@app.get("/api/ioc")
async def list_iocs(
    status: str | None = None,
    ioc_type: str | None = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user)
):
    q = select(IOCEntry).order_by(desc(IOCEntry.created_at))
    if status:
        q = q.where(IOCEntry.status == status)
    if ioc_type:
        q = q.where(IOCEntry.ioc_type == ioc_type)
    rows = (await db.execute(q)).scalars().all()
    return [_ioc_out(r) for r in rows]

@app.post("/api/ioc", status_code=201)
async def add_ioc(
    payload: dict,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user)
):
    import json
    entry = IOCEntry(
        ioc_type=payload.get("ioc_type", "ip"),
        value=payload["value"],
        malicious_score=payload.get("malicious_score", 0),
        total_engines=payload.get("total_engines", 0),
        country=payload.get("country"),
        asn=str(payload.get("asn")) if payload.get("asn") else None,
        as_owner=payload.get("as_owner"),
        tags=json.dumps(payload.get("tags", [])),
        status=payload.get("status", "watchlist"),
        analyst_notes=payload.get("analyst_notes"),
        related_ticket_id=payload.get("related_ticket_id"),
        added_by=user.username,
        vt_report=payload.get("vt_report"),
    )
    db.add(entry)
    try:
        await db.commit()
        await db.refresh(entry)
    except Exception:
        await db.rollback()
        raise HTTPException(400, "IOC ya existe o datos inválidos")
    return _ioc_out(entry)

@app.patch("/api/ioc/{ioc_id}")
async def update_ioc(
    ioc_id: int,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user)
):
    ioc = (await db.execute(select(IOCEntry).where(IOCEntry.id == ioc_id))).scalar_one_or_none()
    if not ioc:
        raise HTTPException(404, "IOC no encontrado")
    if "status" in payload:
        ioc.status = payload["status"]
    if "analyst_notes" in payload:
        ioc.analyst_notes = payload["analyst_notes"]
    if "related_ticket_id" in payload:
        ioc.related_ticket_id = payload["related_ticket_id"]
    await db.commit()
    await db.refresh(ioc)
    return _ioc_out(ioc)

@app.delete("/api/ioc/{ioc_id}", status_code=204)
async def delete_ioc(
    ioc_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user)
):
    ioc = (await db.execute(select(IOCEntry).where(IOCEntry.id == ioc_id))).scalar_one_or_none()
    if not ioc:
        raise HTTPException(404, "IOC no encontrado")
    await db.delete(ioc)
    await db.commit()

# ── Ollama Status ─────────────────────────────────────────────────────────────

@app.get("/api/ollama/status")
async def ollama_status(_=Depends(get_current_user)):
    import httpx as _httpx
    try:
        async with _httpx.AsyncClient(timeout=5.0) as c:
            r = await c.get(f"{settings.ollama_base_url}/api/tags")
            if r.status_code == 200:
                models = [m["name"] for m in r.json().get("models", [])]
                return {"status": "online", "models": models, "active_model": settings.ollama_model}
        return {"status": "offline", "models": []}
    except Exception:
        return {"status": "offline", "models": []}


# ─────────────────────────────────────────────────────────────────────────────
# RUNBOOKS - Procedimientos operativos estándar
# ─────────────────────────────────────────────────────────────────────────────

runbooks = []  # Fallback runbooks por defecto


def _runbook_out(rb: dict) -> dict:
    return {
        "id": rb["id"],
        "name": rb["name"],
        "category": rb["category"],
        "description": rb["description"],
        "containment_steps": rb.get("containment_steps", []),
        "eradication_steps": rb.get("eradication_steps", []),
        "recovery_steps": rb.get("recovery_steps", []),
        "severity_applicable": rb.get("severity_applicable", "all"),
        "is_active": rb.get("is_active", True),
        "created_at": rb.get("created_at", datetime.now()),
        "updated_at": rb.get("updated_at", datetime.now()),
    }


@app.get("/api/runbooks", tags=["runbooks"])
async def list_runbooks(_=Depends(get_current_user)):
    return runbooks


@app.post("/api/runbooks", response_model=dict, tags=["runbooks"])
async def create_runbook(payload: dict, _=Depends(get_current_user)):
    rb = {
        "id": len(runbooks) + 1,
        **payload,
        "is_active": True,
        "created_at": datetime.now(),
        "updated_at": datetime.now(),
    }
    runbooks.append(rb)
    return _runbook_out(rb)


@app.put("/api/runbooks/{rb_id}", response_model=dict, tags=["runbooks"])
async def update_runbook(rb_id: int, payload: dict, _=Depends(get_current_user)):
    for rb in runbooks:
        if rb["id"] == rb_id:
            rb.update(payload)
            rb["updated_at"] = datetime.now()
            return _runbook_out(rb)
    raise HTTPException(404, "Runbook no encontrado")


@app.delete("/api/runbooks/{rb_id}", tags=["runbooks"])
async def delete_runbook(rb_id: int, _=Depends(get_current_user)):
    for i, rb in enumerate(runbooks):
        if rb["id"] == rb_id:
            runbooks.pop(i)
            return {"deleted": True}
    raise HTTPException(404, "Runbook no encontrado")


# Fallback runbooks por defecto
runbooks.extend([
    {
        "id": 1,
        "name": "Brute Force Attack Response",
        "category": "intrusion",
        "description": "Procedimiento de respuesta a ataques de fuerza bruta",
        "containment_steps": [
            "Bloquear IP del atacante con iptables/ufw",
            "Verificar logs de autenticación",
            "Aislar cuenta comprometida"
        ],
        "eradication_steps": [
            "Cambiar contraseñas afectadas",
            "Revisar sistema de monitoreo"
        ],
        "recovery_steps": [
            "Restaurar servicios normales",
            "Documentar incidente"
        ],
        "severity_applicable": "high",
        "is_active": True,
        "created_at": datetime.now(),
        "updated_at": datetime.now(),
    },
    {
        "id": 2,
        "name": "Malware Detection Response",
        "category": "malware",
        "description": "Procedimiento de respuesta a detección de malware",
        "containment_steps": [
            "Aislar equipo infectado",
            "Bloquear tráfico malicioso",
            "Capturar muestra del malware"
        ],
        "eradication_steps": [
            "Escanear con antivirus",
            "Eliminar archivos maliciosos"
        ],
        "recovery_steps": [
            "Restaurar desde backup limpio",
            "Verificar integridad del sistema"
        ],
        "severity_applicable": "critical",
        "is_active": True,
        "created_at": datetime.now(),
        "updated_at": datetime.now(),
    },
    {
        "id": 3,
        "name": "Phishing Incident Response",
        "category": "phishing",
        "description": "Procedimiento de respuesta a incidentes de phishing",
        "containment_steps": [
            "Bloquear dominio/URL de phishing",
            "Notificar a usuarios afectados",
            "Recolectar evidencias del correo"
        ],
        "eradication_steps": [
            "Eliminar correos de phishing",
            "Revisar credenciales comprometidas"
        ],
        "recovery_steps": [
            "Restablecer cuentas",
            "Capacitar usuarios"
        ],
        "severity_applicable": "medium",
        "is_active": True,
        "created_at": datetime.now(),
        "updated_at": datetime.now(),
    },
    {
        "id": 4,
        "name": "Ransomware Response",
        "category": "ransomware",
        "description": "Procedimiento de respuesta a incidentes de ransomware",
        "containment_steps": [
            "Aislar sistemas afectados INMEDIATAMENTE",
            "Cortar conectividad de red",
            "No apagar equipos - preservar evidencias"
        ],
        "eradication_steps": [
            "Identificar variante de ransomware",
            "Verificar vectores de entrada",
            "Eliminar ransomware y payloads"
        ],
        "recovery_steps": [
            "Restaurar desde backups limpios",
            "Verificar que no haya persistencia",
            "Documentar incidente para forénsica"
        ],
        "severity_applicable": "critical",
        "is_active": True,
        "created_at": datetime.now(),
        "updated_at": datetime.now(),
    },
])


# ─────────────────────────────────────────────────────────────────────────────
# THREAT MAP - Mapa geográfico de ataques
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/api/threat-map", tags=["threat-map"])
async def get_threat_map(hours: int = 24, limit: int = 100, _=Depends(get_current_user)):
    """Obtiene datos geolocalizados de ataques para el mapa."""
    import httpx
    
    # Obtener ataques del indexer
    since = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    
    body = {
        "size": 0,
        "query": {"range": {"@timestamp": {"gte": since}}},
        "aggs": {
            "top_ips": {
                "terms": {"field": "data.srcip", "size": limit}
            }
        }
    }
    
    try:
        async with httpx.AsyncClient(verify=False, timeout=15.0) as c:
            r = await c.post(f"{settings.opensearch_url}/wazuh-alerts-*/_search", json=body)
            buckets = r.json().get("aggregations", {}).get("top_ips", {}).get("buckets", [])
    except Exception:
        buckets = []
    
    attacks = []
    countries = {}
    total = 0
    
    for b in buckets:
        ip = b["key"]
        count = b["doc_count"]
        total += count
        
        # Geolocalizar IP (usando ip-api.com - gratuito)
        geo = await _geo_lookup(ip)
        
        if geo and geo.get("status") == "success":
            country = geo.get("country", "Unknown")
            country_code = geo.get("countryCode", "XX")
            
            attacks.append({
                "ip": ip,
                "country": country,
                "country_code": country_code,
                "city": geo.get("city", ""),
                "isp": geo.get("isp", ""),
                "lat": geo.get("lat", 0),
                "lon": geo.get("lon", 0),
                "count": count
            })
            
            countries[country_code] = countries.get(country_code, 0) + count
    
    # Formatear lista de países
    countries_list = [{"country": k, "count": v} for k, v in sorted(countries.items(), key=lambda x: -x[1])]
    
    return {
        "attacks": attacks,
        "countries": countries_list[:10],
        "total_attacks": total
    }


async def _geo_lookup(ip: str) -> dict | None:
    """Geolocaliza una IP usando ip-api.com (100 запросes/minuto gratis)."""
    if not ip or ip in ["127.0.0.1", "::1", "0.0.0.0", "unknown"]:
        return None
    
    # IPs privadas no geolocalizan
    if ip.startswith(("192.168.", "10.", "172.16.", "172.17.", "172.18.", "172.19.", 
                   "172.2.", "172.30.", "172.31.", "fe80:", "::")):
        return {"status": "success", "country": "Private IP", "countryCode": "XX", "lat": 0, "lon": 0, "isp": "Local Network"}
    
    try:
        import httpx
        async with httpx.AsyncClient(timeout=5.0) as c:
            r = await c.get(f"http://ip-api.com/json/{ip}")
            return r.json()
    except Exception:
        return None


# End of file
