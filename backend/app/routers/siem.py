"""Endpoints del SIEM: agentes, alertas, honeypot, monitores, métricas, caza y webhook de Wazuh."""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import os
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import grc_builder, hunting
from app import opensearch_client as osc
from app.auth import get_current_user
from app.db import get_db
from app.http_tls import httpx_verify
from app.limits import limiter
from app.logger import logger
from app.models import IOC, AuditLog, Monitor, Ticket, User
from app.ollama_client import analyze_alert
from app.rag import build_knowledge
from app.realtime import manager
from app.schemas import MonitorOut, MonitorUpdate, TriageRequest
from app.security import InputValidator
from app.services.firewall import _apply_ip_block
from app.services.incidents import SEVERITY_RANK, _monitor_matches, _sync_wazuh_alerts_to_tickets
from app.services.runtime_settings import AI_LEVEL_THRESHOLDS, _get_setting
from app.services.tasks import _spawn
from app.settings import settings
from app.threat_map import get_threat_map_data
from app.wazuh_client import wazuh

router = APIRouter()


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


# AGENTS & WAZUH
@router.get("/api/agents")
async def list_agents(_=Depends(get_current_user)):
    try:
        return await wazuh.get_agents()
    except Exception as e:
        logger.warning(f"Wazuh API /agents no disponible: {e}")
        raise HTTPException(502, "No se pudo consultar la API de Wazuh (agentes)")


_AGENT_ID = Path(..., pattern=r"^\d{3,5}$")  # evita inyectar rutas en la URL de la API de Wazuh


@router.get("/api/agents/vulnerability-summary")
async def agents_vuln_summary(_=Depends(get_current_user)):
    """Vulnerabilidades por agente y severidad (índice wazuh-states-vulnerabilities-*)."""
    return await osc.get_vulnerability_summary()


@router.get("/api/agents/{agent_id}/inventory")
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


@router.get("/api/agents/{agent_id}/packages")
async def agent_packages(agent_id: str = _AGENT_ID, _=Depends(get_current_user)):
    return await wazuh.get_syscollector(agent_id, "packages", 500)


@router.get("/api/agents/{agent_id}/vulnerabilities")
async def agent_vulnerabilities(agent_id: str = _AGENT_ID, _=Depends(get_current_user)):
    """Antes llamaba a /vulnerability/{id}, retirado en Wazuh 4.8 (siempre vacío)."""
    return await osc.get_agent_vulnerabilities(agent_id)


@router.get("/api/wazuh/recent-alerts")
async def recent_alerts(limit: int = 50, hours: int = 24, _=Depends(get_current_user)):
    return await osc.get_recent_alerts(limit, hours)


@router.get("/api/wazuh/top-attackers")
async def top_attackers(limit: int = 10, hours: int = 24, _=Depends(get_current_user)):
    return await osc.get_top_attackers(limit, hours)


@router.get("/api/wazuh/alert-volume")
async def alert_volume(hours: int = 24, interval: str = "1h", _=Depends(get_current_user)):
    return await osc.get_alert_volume(hours, interval)


@router.get("/api/wazuh/mitre")
async def mitre_coverage(hours: int = 168, _=Depends(get_current_user)):
    return await osc.get_mitre_coverage(hours)


@router.get("/api/honeypot/overview")
async def honeypot_overview(hours: int = Query(24, ge=1, le=720), _=Depends(get_current_user)):
    """Resumen real del honeypot Cowrie (sin las alertas del bucle antiguo de la IA)."""
    from app import honeypot
    return await honeypot.overview(hours)


@router.get("/api/honeypot/sessions")
async def honeypot_sessions(hours: int = Query(24, ge=1, le=720), limit: int = Query(40, ge=1, le=100), _=Depends(get_current_user)):
    from app import honeypot
    return await honeypot.sessions(hours, limit)


@router.get("/api/honeypot/sessions/{session_id}")
async def honeypot_session_events(session_id: str = Path(..., pattern=r"^[a-f0-9]{8,32}$"), _=Depends(get_current_user)):
    from app import honeypot
    return await honeypot.session_events(session_id)


@router.get("/api/wazuh/cowrie-stats")
async def cowrie_stats(hours: int = 24, _=Depends(get_current_user)):
    return await osc.get_cowrie_stats(hours)


@router.get("/api/wazuh/cowrie-sessions")
async def cowrie_sessions(limit: int = 100, hours: int = 24, _=Depends(get_current_user)):
    return await osc.get_cowrie_sessions(limit, hours)


@router.get("/api/wazuh/cowrie-timeline")
async def cowrie_timeline(hours: int = 24, interval: str = "1h", _=Depends(get_current_user)):
    return await osc.get_cowrie_timeline(hours, interval)


async def _container_running(host: str, timeout: float = 2.0) -> bool:
    """¿Está el contenedor en marcha? El DNS interno de Docker solo resuelve contenedores activos.

    Antes se abría una conexión TCP al puerto SSH de Cowrie: el honeypot la registraba como
    una sesión de ataque desde el backend (~2.400 falsas al día por pestaña abierta, que
    aparecían como el atacante nº 1). Resolver el nombre no toca el servicio.
    """
    import socket
    try:
        async with asyncio.timeout(timeout):
            await asyncio.get_running_loop().getaddrinfo(host, None, type=socket.SOCK_STREAM)
            return True
    except Exception:
        return False


@router.get("/api/wazuh/services")
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
    cowrie_events = 0
    try:
        stats = await osc.get_cowrie_stats(24)
        cowrie_events = int(stats.get("total") or 0)
    except Exception:
        pass

    cowrie_port_up = await _container_running(cowrie_host)
    if cowrie_port_up:
        cowrie_status = "active" if cowrie_events > 0 else "warning"
    elif cowrie_events > 0:
        cowrie_status = "active"
    else:
        cowrie_status = "disconnected"

    attacker_host = os.getenv("ATTACKER_HOST", "attacker")
    attacker_up = await _container_running(attacker_host, timeout=1.5)

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


@router.get("/api/threat-map")
async def threat_map(hours: int = 24, _=Depends(get_current_user)):
    return await get_threat_map_data(hours)


# ─────────────────────────────────────────────
# TRIAGE IA ESTRUCTURADO (Fase 3 — SOAR + IA táctica)
# Ollama devuelve scoring accionable: risk_score, mitre_ttp, recommended_action, fp_likelihood
# ─────────────────────────────────────────────
@router.post("/api/triage/analyze")
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


@router.get("/api/wazuh/sync-alerts")
async def sync_alerts_manual(hours: int = 1, _=Depends(get_current_user)):
    return await _sync_wazuh_alerts_to_tickets(hours=hours)


@router.get("/api/dashboard")
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
@router.get("/api/monitors", response_model=list[MonitorOut])
async def list_monitors(db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    if current.role != "admin":
        raise HTTPException(403, "Solo admin puede ver monitores")
    return (await db.execute(select(Monitor).order_by(Monitor.name))).scalars().all()


@router.get("/api/monitors/activity")
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


@router.put("/api/monitors/{monitor_id}", response_model=MonitorOut)
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


# FORENSICS
@router.get("/api/forensics/attack-path/{ip}")
async def attack_path(ip: str, hours: int = 48, _=Depends(get_current_user)):
    """Timeline detallada de un atacante."""
    return await osc.get_attack_path(ip, hours)


# WEBHOOKS
@router.post("/api/webhook/wazuh")
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
        _spawn(run_ai())

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


# ─────────────────────────────────────────────
# FASE 4 — MADUREZ Y MÉTRICAS
# ─────────────────────────────────────────────
@router.get("/api/metrics/soc")
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
        # Fechas sin zona (p. ej. SQLite en las pruebas) se interpretan como UTC
        created = created.replace(tzinfo=timezone.utc) if created and created.tzinfo is None else created
        resolved = resolved.replace(tzinfo=timezone.utc) if resolved and resolved.tzinfo is None else resolved
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


@router.get("/api/mitre/navigator-layer")
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


@router.get("/api/hunting/queries")
async def hunting_queries(current: User = Depends(get_current_user)):
    return hunting.list_queries()


@router.get("/api/hunting/run/{query_id}")
async def hunting_run(query_id: str = Path(..., pattern=r"^[a-z_]{3,40}$"), hours: int = Query(168, ge=1, le=720), current: User = Depends(get_current_user)):
    if current.role.lower() not in ("admin", "analyst", "analista"):
        raise HTTPException(403, "Solo admin o analista puede ejecutar threat hunting")
    if query_id not in hunting.HUNT_QUERIES:  # antes respondía 200 con un objeto de error
        raise HTTPException(404, "Consulta de hunting no encontrada")
    return await hunting.run_query(query_id, hours=hours)
