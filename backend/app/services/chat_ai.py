"""Asistente del chat (@ia): respuestas directas con datos del SOC, contexto y resumen del día."""
from __future__ import annotations

import re as _re
import secrets
import time
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import desc, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import cve_feed, grc_builder
from app import opensearch_client as osc
from app import report_builder as rb
from app.db import SessionLocal
from app.logger import logger
from app.models import IOC, Alert, AuditLog, ChatMessage, Event, Monitor, Runbook, Ticket, User
from app.ollama_client import chat_assistant
from app.realtime import manager
from app.routers.siem import soc_metrics, wazuh_services
from app.schemas import ChatMessageOut
from app.security import InputValidator
from app.services.incidents import _tickets_assignee_filter
from app.services.reports import _store_report
from app.threat_map import get_threat_map_data
from app.wazuh_client import wazuh

_CHAT_RATE: dict[int, list[float]] = {}


_CHAT_RATE_LIMIT = (20, 10.0)  # 20 mensajes cada 10 s por usuario


def _chat_rate_ok(user_id: int) -> bool:
    now = time.monotonic()
    n, window = _CHAT_RATE_LIMIT
    hits = [t for t in _CHAT_RATE.get(user_id, []) if now - t < window]
    hits.append(now)
    _CHAT_RATE[user_id] = hits
    return len(hits) <= n


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
