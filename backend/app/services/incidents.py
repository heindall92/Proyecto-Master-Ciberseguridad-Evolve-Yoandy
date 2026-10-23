"""De alerta a incidente: monitores, correlación, historial y permisos sobre tickets."""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException
from sqlalchemy import desc, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import opensearch_client as osc
from app.db import SessionLocal
from app.logger import logger
from app.models import Monitor, Ticket, TicketAlert, TicketEvent, User
from app.settings import settings


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
