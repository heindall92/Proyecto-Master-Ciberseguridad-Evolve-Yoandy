from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import IntegrityError
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models import AIAnalysis, Alert, Event
from app.ollama_client import analyze_alert
from app.schemas import AlertIn, AlertOut, AnalysisOut, EventIn, EventOut, Page
from app.settings import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("valhalla.api")

app = FastAPI(title="Valhalla SOC API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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

