from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import IntegrityError
from sqlalchemy import desc, select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db, engine
from app.models import AIAnalysis, Alert, Event, User, Base
from app.ollama_client import analyze_alert
from app.auth import create_access_token, verify_password, get_password_hash, get_current_user, require_role
from app.schemas import (
    AlertIn, AlertOut, AnalysisOut, EventIn, EventOut, Page,
    UserIn, UserOut, UserCreate, UserUpdate, Token, LoginRequest, PasswordReset,
    AgentEnrollIn, AgentEnrollOut, AgentOut
)
from app.wazuh_client import wazuh
from app.settings import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("valhalla.api")

app = FastAPI(title="Valhalla SOC API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    # Ensure tables exist
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    # Create default admin if not exists
    async with SessionLocal() as db:
        q = select(User).where(User.username == "admin")
        res = await db.execute(q)
        if not res.scalar_one_or_none():
            admin = User(
                username="admin",
                password_hash=get_password_hash("Valhalla2026!"),
                role="admin"
            )
            db.add(admin)
            await db.commit()
            logger.info("Admin user created (default credentials: Valhalla2026!)")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}

def _event_out(ev: Event) -> EventOut:
    return EventOut(
        id=ev.id,
        timestamp=ev.timestamp,
        source_ip=str(ev.source_ip) if ev.source_ip is not None else None,
        attack_type=ev.attack_type,
        payload=ev.payload,
        raw_log=ev.raw_log,
    )


@app.post("/events", response_model=EventOut)
async def create_event(payload: EventIn, db: AsyncSession = Depends(get_db)) -> Any:
    ts = payload.timestamp or datetime.now(tz=timezone.utc)
    ev = Event(
        timestamp=ts,
        source_ip=payload.source_ip,
        attack_type=payload.attack_type,
        payload=payload.payload,
        raw_log=payload.raw_log,
    )
    db.add(ev)
    await db.commit()
    await db.refresh(ev)
    return _event_out(ev)


@app.get("/events", response_model=list[EventOut])
async def list_events(page: Page = Depends(), db: AsyncSession = Depends(get_db)) -> Any:
    q = select(Event).order_by(desc(Event.timestamp)).limit(page.limit).offset(page.offset)
    rows = (await db.execute(q)).scalars().all()
    return [_event_out(r) for r in rows]


@app.post("/alerts", response_model=AlertOut)
async def create_alert(payload: AlertIn, db: AsyncSession = Depends(get_db)) -> Any:
    ts = payload.timestamp or datetime.now(tz=timezone.utc)
    al = Alert(
        event_id=payload.event_id,
        severity=str(payload.severity).lower(),
        rule_id=payload.rule_id,
        description=payload.description,
        timestamp=ts,
        raw_alert=payload.raw_alert,
    )
    db.add(al)
    await db.commit()
    await db.refresh(al)
    return al


@app.get("/alerts", response_model=list[AlertOut])
async def list_alerts(page: Page = Depends(), db: AsyncSession = Depends(get_db)) -> Any:
    q = select(Alert).order_by(desc(Alert.timestamp)).limit(page.limit).offset(page.offset)
    rows = (await db.execute(q)).scalars().all()
    return rows


@app.post("/api/analyze/{alert_id}", response_model=AnalysisOut)
async def analyze(alert_id: int, force: bool = False, db: AsyncSession = Depends(get_db)) -> Any:
    alert = (await db.execute(select(Alert).where(Alert.id == alert_id))).scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    existing = (await db.execute(select(AIAnalysis).where(AIAnalysis.alert_id == alert_id))).scalar_one_or_none()
    if existing and not force:
        # If we previously stored a fallback, try again now that Ollama/model may be ready.
        # Fallback is identified by missing raw_response and/or a generic attack_type.
        if existing.raw_response is None or existing.attack_type.strip().lower() == "unknown":
            await db.delete(existing)
            await db.commit()
        else:
            return AnalysisOut(
                alert_id=existing.alert_id,
                attack_type=existing.attack_type,
                severity=existing.severity,  # type: ignore[arg-type]
                summary=existing.summary,
                recommended_action=existing.recommended_action,
                created_at=existing.created_at,
            )
    if existing and force:
        await db.delete(existing)
        await db.commit()

    context: dict[str, Any] = {
        "alert": {
            "id": alert.id,
            "severity": alert.severity,
            "rule_id": alert.rule_id,
            "description": alert.description,
            "timestamp": alert.timestamp.isoformat(),
            "raw_alert": alert.raw_alert,
        }
    }
    if alert.event_id:
        ev = (await db.execute(select(Event).where(Event.id == alert.event_id))).scalar_one_or_none()
        if ev:
            context["event"] = {
                "id": ev.id,
                "timestamp": ev.timestamp.isoformat(),
                "source_ip": str(ev.source_ip) if ev.source_ip is not None else None,
                "attack_type": ev.attack_type,
                "payload": ev.payload,
                "raw_log": ev.raw_log,
            }

    result = await analyze_alert(alert_id=alert_id, context=context)
    data = result.data

    analysis = AIAnalysis(
        alert_id=alert_id,
        attack_type=data["attack_type"],
        severity=data["severity"],
        summary=data["summary"],
        recommended_action=data["recommended_action"],
        raw_response=data.get("raw_response"),
    )
    db.add(analysis)
    try:
        await db.commit()
        await db.refresh(analysis)
    except IntegrityError:
        # concurrent analyze requests can race on the unique(alert_id) constraint.
        # if another request already inserted the row, return the existing analysis.
        await db.rollback()
        existing_after_race = (
            await db.execute(select(AIAnalysis).where(AIAnalysis.alert_id == alert_id))
        ).scalar_one_or_none()
        if not existing_after_race:
            raise
        analysis = existing_after_race

    return AnalysisOut(
        alert_id=analysis.alert_id,
        attack_type=analysis.attack_type,
        severity=analysis.severity,  # type: ignore[arg-type]
        summary=analysis.summary,
        recommended_action=analysis.recommended_action,
        created_at=analysis.created_at,
    )


# ── Auth Routes ──────────────────────────────────────────────────────────────

@app.post("/api/auth/login", response_model=Token)
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    q = select(User).where(User.username == req.username)
    user = (await db.execute(q)).scalar_one_or_none()
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos")
    
    token = create_access_token(data={"sub": user.username})
    return Token(access_token=token)

@app.get("/api/auth/me", response_model=UserOut)
async def me(current_user: User = Depends(get_current_user)):
    return current_user


# ── User Management ──────────────────────────────────────────────────────────

@app.get("/api/users", response_model=list[UserOut])
async def list_users(db: AsyncSession = Depends(get_db), _=Depends(require_role("admin"))):
    q = select(User).order_by(User.username)
    return (await db.execute(q)).scalars().all()

@app.post("/api/users", response_model=UserOut)
async def create_user(u: UserCreate, db: AsyncSession = Depends(get_db), _=Depends(require_role("admin"))):
    new_user = User(
        username=u.username.lower(),
        email=u.email.lower() if u.email else None,
        password_hash=get_password_hash(u.password),
        role=u.role.lower()
    )
    db.add(new_user)
    try:
        await db.commit()
        await db.refresh(new_user)
        return new_user
    except IntegrityError:
        raise HTTPException(status_code=400, detail="El usuario ya existe")

@app.put("/api/users/{user_id}", response_model=UserOut)
async def update_user(user_id: int, u: UserUpdate, db: AsyncSession = Depends(get_db), _=Depends(require_role("admin"))):
    from app.schemas import UserUpdate
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    
    if u.username is not None:
        user.username = u.username.lower()
    if u.email is not None:
        user.email = u.email.lower()
    if u.role is not None:
        user.role = u.role.lower()
    if u.password:
        user.password_hash = get_password_hash(u.password)
        
    try:
        await db.commit()
        await db.refresh(user)
        return user
    except IntegrityError:
        raise HTTPException(status_code=400, detail="El nombre de usuario ya está en uso")

@app.delete("/api/users/{user_id}")
async def delete_user(user_id: int, db: AsyncSession = Depends(get_db), current: User = Depends(require_role("admin"))):
    if user_id == current.id:
        raise HTTPException(status_code=400, detail="No puedes borrarte a ti mismo")
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    await db.delete(user)
    await db.commit()
    return {"ok": True}

@app.post("/api/users/{user_id}/reset-password")
async def reset_password(user_id: int, req: PasswordReset, db: AsyncSession = Depends(get_db), _=Depends(require_role("admin"))):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    user.password_hash = get_password_hash(req.new_password)
    await db.commit()
    return {"ok": True}


# ── Agent Management (Wazuh Proxy) ───────────────────────────────────────────

@app.get("/api/agents", response_model=list[AgentOut])
async def list_agents(_=Depends(get_current_user)):
    # Note: agents need to be mapped from Wazuh response to AgentOut
    r = await wazuh.request("GET", "/agents?select=id,name,ip,os,status&limit=100")
    if r.status_code != 200:
        raise HTTPException(status_code=500, detail="Wazuh API Error")
    
    data = r.json().get("data", {}).get("affected_items", [])
    out = []
    for a in data:
        out.append(AgentOut(
            id=a["id"],
            name=a["name"],
            ip=a.get("ip"),
            os=a.get("os", {}).get("name", "N/A"),
            status=a["status"],
            type="SIEM Agent", # Placeholder
            agent="Wazuh",
            group="default" # Default
        ))
    return out

@app.post("/api/agents/enroll", response_model=AgentEnrollOut)
async def enroll_agent(req: AgentEnrollIn, _=Depends(get_current_user)):
    # 1. Create agent in Wazuh
    r = await wazuh.request("POST", "/agents", json={"name": req.name})
    if r.status_code != 200:
        return AgentEnrollOut(ok=False, error=str(r.json().get("title", "Error")))
    
    agent_id = r.json().get("data", {}).get("id")
    # 2. Get key
    rk = await wazuh.request("GET", f"/agents/{agent_id}/key")
    key = rk.json().get("data", {}).get("key")
    
    return AgentEnrollOut(ok=True, id=agent_id, key=key)


# ── Dashboard Summary ────────────────────────────────────────────────────────

@app.get("/api/dashboard")
async def get_dashboard(db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    # Basic aggregate for the tactical UI
    alerts_total = (await db.execute(select(func.count(Alert.id)))).scalar() or 0
    events_total = (await db.execute(select(func.count(Event.id)))).scalar() or 0
    
    return {
        "metrics": {
            "alerts": alerts_total,
            "events": events_total,
        },
        "status": "operational"
    }

from app.db import SessionLocal

