"""Endpoints de incidentes, evidencias, runbooks y playbooks."""
from __future__ import annotations

import hashlib
import hmac
import os
import secrets
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import desc, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app import abuseipdb_client as abuse
from app import virustotal_client as vt
from app.auth import get_current_user
from app.db import get_db
from app.limits import limiter
from app.logger import logger
from app.models import IOC, Evidence, Runbook, Ticket, TicketEvent, User
from app.runbooks_seed import seed_runbooks_if_empty
from app.schemas import (
    AlertToTicketIn,
    EvidenceOut,
    PlaybookActionIn,
    RunbookIn,
    RunbookOut,
    TicketAssign,
    TicketCommentIn,
    TicketCreate,
    TicketEventOut,
    TicketOut,
    TicketResolve,
    TicketUpdate,
)
from app.security import InputValidator
from app.services.files import ALLOWED_EVIDENCE_EXT, _safe_evidence_filename, _sha256_file
from app.services.firewall import _apply_ip_block, _push_blocked_cdb
from app.services.incidents import (
    ACTIVE_TICKET_STATUSES,
    CLASSIFICATION_LABEL_ES,
    STATUS_LABEL_ES,
    _can_delete_tickets,
    _ingest_alert,
    _log_event,
    _require_ticket_access,
    _tickets_assignee_filter,
    _track_resolution,
)
from app.services.intel_keys import _resolve_abuseipdb_api_key, _resolve_vt_api_key
from app.services.runtime_settings import _get_setting
from app.settings import settings

router = APIRouter()


# TICKETS (rutas fijas antes de /{ticket_id} para no capturar "count" como id)
@router.get("/api/tickets/count/open")
async def count_open_tickets(db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    q = select(func.count(Ticket.id)).where(Ticket.status.in_(ACTIVE_TICKET_STATUSES))
    q = _tickets_assignee_filter(q, current)
    n = (await db.execute(q)).scalar() or 0
    return {"open": int(n)}


@router.get("/api/tickets", response_model=list[TicketOut])
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


@router.get("/api/tickets/{ticket_id}", response_model=TicketOut)
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


@router.post("/api/tickets", response_model=TicketOut)
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


@router.put("/api/tickets/{ticket_id}", response_model=TicketOut)
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


@router.post("/api/tickets/{ticket_id}/assign", response_model=TicketOut)
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


@router.post("/api/tickets/{ticket_id}/resolve", response_model=TicketOut)
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


@router.delete("/api/tickets/{ticket_id}")
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


@router.post("/api/tickets/{ticket_id}/evidence", response_model=EvidenceOut)
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


@router.get("/api/evidence/{evidence_id}/download")
async def download_evidence(evidence_id: int, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    ev = await _get_evidence_checked(evidence_id, db, current)
    headers = {"X-Evidence-SHA256": ev.sha256 or "", "Cache-Control": "no-store"}
    return FileResponse(ev.file_path, filename=ev.filename, media_type="application/octet-stream", headers=headers)


@router.get("/api/evidence/{evidence_id}/verify")
async def verify_evidence(evidence_id: int, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    """Recalcula el SHA-256 y lo compara con el registrado al subir (integridad de la cadena de custodia)."""
    ev = await _get_evidence_checked(evidence_id, db, current)
    current_hash = _sha256_file(ev.file_path)
    ok = bool(ev.sha256) and hmac.compare_digest(current_hash, ev.sha256)
    _log_event(db, ev.ticket_id, current, "evidence_verified",
               f"Integridad de {ev.filename} {'verificada' if ok else 'NO coincide'} (SHA-256 {current_hash[:16]}…)")
    await db.commit()
    return {"ok": ok, "stored": ev.sha256, "current": current_hash}


@router.get("/api/tickets/{ticket_id}/timeline", response_model=list[TicketEventOut])
async def ticket_timeline(ticket_id: int, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    t = await db.get(Ticket, ticket_id)
    if not t:
        raise HTTPException(404, "Ticket not found")
    _require_ticket_access(current, t)
    rows = (await db.execute(select(TicketEvent).where(TicketEvent.ticket_id == ticket_id).order_by(TicketEvent.id))).scalars().all()
    return rows


@router.post("/api/tickets/{ticket_id}/comments", response_model=TicketEventOut)
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


@router.post("/api/tickets/from-alert")
async def ticket_from_alert(req: AlertToTicketIn, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    """Escala una alerta a incidente; si ya hay uno activo correlacionado, la vincula a él."""
    ticket, outcome = await _ingest_alert(db, req.model_dump(), current)
    await db.commit()
    return {"outcome": outcome, "ticket_id": ticket.id, "title": ticket.title}


@router.get("/api/incidents", response_model=list[TicketOut])
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


@router.get("/api/runbooks", response_model=list[RunbookOut])
async def list_runbooks(db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    return (await db.execute(select(Runbook).where(Runbook.is_active == True).order_by(Runbook.category))).scalars().all()


@router.post("/api/runbooks", response_model=RunbookOut)
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


@router.put("/api/runbooks/{runbook_id}", response_model=RunbookOut)
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


@router.delete("/api/runbooks/{runbook_id}")
async def delete_runbook_ep(runbook_id: int, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    if current.role != "admin":
        raise HTTPException(403)
    rb = (await db.execute(select(Runbook).where(Runbook.id == runbook_id))).scalar_one_or_none()
    if not rb:
        raise HTTPException(404, "Runbook no encontrado")
    rb.is_active = False
    await db.commit()
    return {"ok": True}


@router.post("/api/runbooks/seed")
async def seed_runbooks_ep(db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    if current.role != "admin":
        raise HTTPException(403)
    n = await seed_runbooks_if_empty(db)
    await db.commit()
    return {"seeded": n, "message": f"{n} runbooks creados" if n else "Ya existían runbooks"}


# ─────────────────────────────────────────────
# SOAR — PLAYBOOKS EJECUTABLES (Fase 3)
# Los pasos de un runbook dejan de ser texto: el operador aprueba (1 clic) y el
# backend ejecuta la acción REAL, con auditoría. Solo acciones seguras/reversibles.
# ─────────────────────────────────────────────
@router.post("/api/playbooks/execute")
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
