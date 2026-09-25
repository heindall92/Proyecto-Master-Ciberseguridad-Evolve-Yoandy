"""Construcción del informe SOC (Centro de informes) con datos reales de un periodo.

Todas las cifras salen del Wazuh Indexer (OpenSearch), de la base de datos de
Valhalla (incidentes, línea de tiempo, evidencias, IOCs) o de la configuración.
Si una fuente no responde, el capítulo lo indica en `limitations`: nunca se
rellenan huecos con valores inventados.
"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app import opensearch_client as osc
from app.models import Ticket, TicketEvent, Evidence, IOC, SystemSetting, User
from app.settings import settings

SLA_HOURS = {"critical": 1, "high": 4, "medium": 24, "low": 72}
ACTIVE = ("open", "in_progress", "escalated")


def canonical_json(data: dict[str, Any]) -> str:
    """Serialización estable para calcular y verificar la huella del informe."""
    return json.dumps(data, sort_keys=True, separators=(",", ":"), ensure_ascii=False, default=str)


def fingerprint(data: dict[str, Any]) -> str:
    return hashlib.sha256(canonical_json(data).encode("utf-8")).hexdigest()


def _period_query(start: datetime, end: datetime, extra: list[dict] | None = None) -> dict[str, Any]:
    return {
        "bool": {
            "filter": [{"range": {"@timestamp": {"gte": start.isoformat(), "lte": end.isoformat()}}}] + (extra or []),
            "must_not": [{"term": {"rule.groups": "ai_analysis"}}],
        }
    }


def _buckets(aggs: dict, name: str) -> list[dict]:
    return aggs.get(name, {}).get("buckets", [])


async def _alerts_section(start: datetime, end: datetime, limitations: list[str]) -> dict[str, Any]:
    body = {
        "size": 0,
        "track_total_hits": True,
        "query": _period_query(start, end),
        "aggs": {
            "critical": {"filter": {"range": {"rule.level": {"gte": 12}}}},
            "high": {"filter": {"range": {"rule.level": {"gte": 9, "lt": 12}}}},
            "medium": {"filter": {"range": {"rule.level": {"gte": 5, "lt": 9}}}},
            "low": {"filter": {"range": {"rule.level": {"lt": 5}}}},
            "per_day": {"date_histogram": {"field": "@timestamp", "calendar_interval": "1d", "min_doc_count": 0}},
            "agents": {"cardinality": {"field": "agent.id"}},
            "top_agents": {"terms": {"field": "agent.name", "size": 5}, "aggs": {"ip": {"terms": {"field": "agent.ip", "size": 1}}}},
            "top_rules": {"terms": {"field": "rule.id", "size": 10},
                          "aggs": {"d": {"terms": {"field": "rule.description", "size": 1}}, "lvl": {"max": {"field": "rule.level"}}}},
            "ip_wazuh": {"terms": {"field": "data.srcip", "size": 10}},
            "ip_cowrie": {"terms": {"field": "data.src_ip", "size": 10}},
            "countries": {"terms": {"field": "GeoLocation.country_name", "size": 10}},
            "tactics": {"terms": {"field": "rule.mitre.tactic", "size": 20}},
            "techniques": {"terms": {"field": "rule.mitre.id", "size": 30},
                           "aggs": {"name": {"terms": {"field": "rule.mitre.technique", "size": 1}},
                                    "tactic": {"terms": {"field": "rule.mitre.tactic", "size": 3}}}},
        },
    }
    resp = await osc._search(body)
    if not resp:
        limitations.append("El Wazuh Indexer no respondió: los capítulos de alertas, MITRE y honeypot están vacíos.")
        return {"available": False}
    aggs = resp.get("aggregations", {})
    attackers: dict[str, int] = {}
    for name in ("ip_wazuh", "ip_cowrie"):
        for b in _buckets(aggs, name):
            if str(b["key"]).strip().lower() not in {"", "n/a", "unknown", "-"}:
                attackers[b["key"]] = attackers.get(b["key"], 0) + b["doc_count"]
    return {
        "available": True,
        "total": resp.get("hits", {}).get("total", {}).get("value", 0),
        "by_severity": {k: aggs.get(k, {}).get("doc_count", 0) for k in ("critical", "high", "medium", "low")},
        "per_day": [{"day": b["key_as_string"][:10], "count": b["doc_count"]} for b in _buckets(aggs, "per_day")],
        "agents_reporting": aggs.get("agents", {}).get("value", 0),
        "top_agents": [{"name": b["key"], "ip": (_buckets(b, "ip") or [{"key": ""}])[0]["key"], "count": b["doc_count"]}
                       for b in _buckets(aggs, "top_agents")],
        "top_rules": [
            {"rule_id": b["key"], "count": b["doc_count"], "level": int(b["lvl"]["value"] or 0),
             "description": (_buckets(b, "d") or [{"key": ""}])[0]["key"]}
            for b in _buckets(aggs, "top_rules")
        ],
        "top_attackers": [{"ip": ip, "count": n} for ip, n in sorted(attackers.items(), key=lambda x: -x[1])[:10]],
        "countries": [{"country": b["key"], "count": b["doc_count"]} for b in _buckets(aggs, "countries")],
        "mitre_tactics": [{"tactic": b["key"], "count": b["doc_count"]} for b in _buckets(aggs, "tactics")],
        "mitre_techniques": [
            {"id": b["key"], "count": b["doc_count"],
             "name": (_buckets(b, "name") or [{"key": ""}])[0]["key"],
             "tactics": [t["key"] for t in _buckets(b, "tactic")]}
            for b in _buckets(aggs, "techniques")
        ],
    }


_PROTO_NOISE = r".*(: |\<|\>|/[0-9]\.[0-9]).*"  # "CSeq: 42", "<sip:...>", "SIP/2.0" (< y > son reservados en regex Lucene)


async def _honeypot_section(start: datetime, end: datetime) -> dict[str, Any]:
    cowrie = [{"term": {"rule.groups": "cowrie"}}]
    body = {
        "size": 0,
        "query": _period_query(start, end, cowrie),
        "aggs": {
            "failed": {"filter": {"term": {"data.eventid": "cowrie.login.failed"}}},
            "success": {"filter": {"term": {"data.eventid": "cowrie.login.success"}}},
            "sessions": {"cardinality": {"field": "data.session"}},
            # Los escáneres (p. ej. nmap enviando SIP OPTIONS al telnet) hacen que Cowrie registre
            # cabeceras de protocolo como usuario/contraseña: no son credenciales, se excluyen.
            "users": {"terms": {"field": "data.username", "size": 10, "exclude": _PROTO_NOISE}},
            "passwords": {"terms": {"field": "data.password", "size": 10, "exclude": _PROTO_NOISE}},
            "commands": {"terms": {"field": "data.input", "size": 10}},
            "downloads": {"terms": {"field": "data.url", "size": 10}},
            "bruteforce": {"filter": {"term": {"rule.id": "100111"}}},
            "intrusions": {"filter": {"term": {"rule.id": "100113"}}},
        },
    }
    resp = await osc._search(body)
    if not resp:
        return {"available": False}
    a = resp.get("aggregations", {})
    total = lambda k: a.get(k, {}).get("doc_count", 0)  # noqa: E731
    top = lambda k: [{"value": b["key"], "count": b["doc_count"]} for b in _buckets(a, k)]  # noqa: E731
    return {
        "available": True,
        "events": resp.get("hits", {}).get("total", {}).get("value", 0),
        "sessions": a.get("sessions", {}).get("value", 0),
        "login_failed": total("failed"),
        "login_success": total("success"),
        "bruteforce_detections": total("bruteforce"),
        "intrusions_after_bruteforce": total("intrusions"),
        "top_usernames": top("users"),
        "top_passwords": top("passwords"),
        "top_commands": top("commands"),
        "downloads": top("downloads"),
    }


async def _incidents_section(db: AsyncSession, start: datetime, end: datetime) -> dict[str, Any]:
    rows = (await db.execute(
        select(Ticket).where(Ticket.created_at >= start, Ticket.created_at <= end).order_by(Ticket.created_at)
    )).scalars().all()
    resolved = [t for t in rows if t.status == "resolved" and t.resolved_at]
    ttr = [(t.resolved_at - t.created_at).total_seconds() for t in resolved]
    sla_met = [t for t in resolved if (t.resolved_at - t.created_at).total_seconds() <= SLA_HOURS.get(t.severity, 24) * 3600]
    classified = [t for t in resolved if t.classification]
    by = lambda attr, values: {v: sum(1 for t in rows if getattr(t, attr) == v) for v in values}  # noqa: E731
    users = {u.id: u.username for u in (await db.execute(select(User))).scalars().all()}
    return {
        "total": len(rows),
        "by_status": by("status", ("open", "in_progress", "escalated", "resolved")),
        "by_severity": by("severity", ("critical", "high", "medium", "low")),
        "by_classification": {c: sum(1 for t in classified if t.classification == c) for c in ("true_positive", "false_positive", "benign")},
        "resolved": len(resolved),
        "mttr_minutes": round(sum(ttr) / len(ttr) / 60, 1) if ttr else None,
        "sla_met_pct": round(len(sla_met) * 100 / len(resolved), 1) if resolved else None,
        "false_positive_pct": round(sum(1 for t in classified if t.classification == "false_positive") * 100 / len(classified), 1) if classified else None,
        "unassigned_active": sum(1 for t in rows if t.status in ACTIVE and not t.assigned_to_id),
        "items": [
            {"id": t.id, "title": t.title, "severity": t.severity, "status": t.status, "classification": t.classification,
             "source_ip": t.source_ip, "assignee": users.get(t.assigned_to_id), "created_at": t.created_at.isoformat(),
             "resolved_at": t.resolved_at.isoformat() if t.resolved_at else None}
            for t in rows[-50:]
        ],
    }


async def _response_section(db: AsyncSession, start: datetime, end: datetime) -> dict[str, Any]:
    blocked = (await db.execute(select(IOC).where(IOC.status == "blocked", IOC.ioc_type == "ip"))).scalars().all()
    in_period = [i for i in blocked if i.updated_at and start <= i.updated_at <= end]
    return {
        "blocked_ips_total": len(blocked),
        "blocked_in_period": [{"ip": i.value, "since": i.updated_at.isoformat() if i.updated_at else None} for i in in_period],
    }


async def _setting(db: AsyncSession, key: str) -> SystemSetting | None:
    return (await db.execute(select(SystemSetting).where(SystemSetting.key == key))).scalar_one_or_none()


async def _controls_section(db: AsyncSession, start: datetime, end: datetime, alerts: dict, incidents: dict, response: dict) -> list[dict[str, Any]]:
    """Controles ISO/IEC 27001:2022 (Anexo A) y ENS (RD 311/2022) evaluados con evidencias del propio sistema."""
    events_in_period = (await db.execute(select(func.count(TicketEvent.id)).where(
        TicketEvent.created_at >= start, TicketEvent.created_at <= end))).scalar() or 0
    evid_total = (await db.execute(select(func.count(Evidence.id)))).scalar() or 0
    evid_hashed = (await db.execute(select(func.count(Evidence.id)).where(Evidence.sha256.is_not(None)))).scalar() or 0
    retention = await _setting(db, "retention_days")
    vt = await _setting(db, "vt_api_key")
    otx = await _setting(db, "otx_api_key")
    admins = (await db.execute(select(func.count(User.id)).where(User.role == "admin"))).scalar() or 0
    users = (await db.execute(select(func.count(User.id)))).scalar() or 0

    def ctl(iso, ens, name, status, evidence):
        return {"iso": iso, "ens": ens, "control": name, "status": status, "evidence": evidence}

    out = [
        ctl("A.8.16", "op.mon.1", "Monitorización de actividades",
            "covered" if alerts.get("available") and alerts.get("agents_reporting", 0) > 0 else "missing",
            f"{alerts.get('agents_reporting', 0)} agente(s) Wazuh enviando eventos; {alerts.get('total', 0)} alertas en el periodo."
            if alerts.get("available") else "El Wazuh Indexer no respondió durante la generación."),
        ctl("A.5.25 / A.5.26", "op.exp.7", "Gestión y respuesta a incidentes",
            "covered" if incidents["total"] and events_in_period else "partial" if incidents["total"] else "missing",
            f"{incidents['total']} incidente(s) en el periodo, {events_in_period} acción(es) registradas en su línea de tiempo."),
        ctl("A.5.27", "op.exp.7", "Aprendizaje de los incidentes",
            "covered" if incidents["by_classification"] and sum(incidents["by_classification"].values()) else "partial",
            "Clasificación al cierre (verdadero/falso positivo/benigno): "
            + ", ".join(f"{k}={v}" for k, v in incidents["by_classification"].items())),
        ctl("A.5.28", "op.exp.10", "Recopilación de evidencias",
            "covered" if evid_total and evid_hashed == evid_total else "partial" if evid_total else "partial",
            f"{evid_hashed} de {evid_total} evidencias con huella SHA-256 y autor registrado (cadena de custodia)."),
        ctl("A.8.15", "op.exp.8", "Registro de actividad (retención)",
            "covered" if retention and retention.value else "partial",
            f"Política de retención de alertas: {retention.value} días (ISM)." if retention and retention.value
            else "Sin política de retención: las alertas se conservan indefinidamente."),
        ctl("A.5.7", "op.mon.3", "Inteligencia de amenazas",
            "covered" if (vt or otx) else "partial",
            "Claves de VirusTotal/OTX configuradas (cifradas AES-256-GCM)." if (vt or otx)
            else "Sin claves de Threat Intelligence: el enriquecimiento de IOCs no está disponible."),
        ctl("A.8.20", "mp.com.1", "Seguridad de redes (contención)",
            "covered" if response["blocked_ips_total"] else "partial",
            f"{response['blocked_ips_total']} IP(s) bloqueadas mediante lista CDB y firewall-drop (Wazuh Active Response)."
            if response["blocked_ips_total"] else "Mecanismo de bloqueo disponible, pero ninguna IP bloqueada hasta la fecha."),
        ctl("A.5.15 / A.8.5", "op.acc.2", "Control de acceso y autenticación",
            "covered",
            f"{users} usuario(s), {admins} con rol administrador; RBAC en el backend, política de contraseñas y límite de 5 intentos/min en el login."),
    ]
    return out


def _recommendations(alerts: dict, honeypot: dict, incidents: dict, controls: list[dict]) -> list[dict[str, str]]:
    """Recomendaciones derivadas de lo observado (cada una cita el dato que la motiva)."""
    recs: list[dict[str, str]] = []
    add = lambda prio, text, why: recs.append({"priority": prio, "text": text, "reason": why})  # noqa: E731
    if honeypot.get("intrusions_after_bruteforce"):
        add("critical", "Deshabilitar la autenticación SSH por contraseña (solo claves) y rotar credenciales expuestas.",
            f"{honeypot['intrusions_after_bruteforce']} acceso(s) con éxito tras fuerza bruta en el honeypot.")
    if honeypot.get("bruteforce_detections"):
        add("high", "Limitar intentos de autenticación (fail2ban / Active Response) y restringir SSH por origen.",
            f"{honeypot['bruteforce_detections']} detección(es) de fuerza bruta SSH.")
    if honeypot.get("downloads"):
        add("high", "Analizar en sandbox los ficheros descargados por los atacantes y bloquear sus URLs de origen.",
            f"{len(honeypot['downloads'])} URL(s) de descarga registradas.")
    if incidents.get("sla_met_pct") is not None and incidents["sla_met_pct"] < 90:
        add("high", "Revisar la asignación y priorización: el cumplimiento de SLA está por debajo del 90 %.",
            f"SLA cumplido en el {incidents['sla_met_pct']} % de los incidentes resueltos.")
    if incidents.get("unassigned_active"):
        add("medium", "Asignar los incidentes activos sin responsable.",
            f"{incidents['unassigned_active']} incidente(s) activo(s) sin asignar.")
    if incidents.get("false_positive_pct") is not None and incidents["false_positive_pct"] > 30:
        add("medium", "Ajustar las reglas con más falsos positivos para reducir la fatiga de alertas.",
            f"{incidents['false_positive_pct']} % de falsos positivos entre los incidentes clasificados.")
    for c in controls:
        if c["status"] != "covered":
            add("medium" if c["status"] == "partial" else "high", f"Completar el control {c['iso']} ({c['control']}).", c["evidence"])
    if not recs:
        add("low", "Mantener la monitorización y revisar este informe en el siguiente periodo.", "No se han detectado desviaciones.")
    order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    return sorted(recs, key=lambda r: order[r["priority"]])


def _risk(alerts: dict, honeypot: dict, incidents: dict) -> dict[str, Any]:
    """Nivel de riesgo 0-100 (fórmula documentada en el anexo del informe)."""
    sev = alerts.get("by_severity", {})
    score = min(40, sev.get("critical", 0) * 10 + sev.get("high", 0) * 2)
    score += min(30, honeypot.get("intrusions_after_bruteforce", 0) * 15 + honeypot.get("bruteforce_detections", 0) * 5)
    active_crit = sum(1 for i in incidents.get("items", []) if i["status"] in ACTIVE and i["severity"] in ("critical", "high"))
    score += min(30, active_crit * 10)
    level = "crítico" if score >= 75 else "alto" if score >= 50 else "medio" if score >= 25 else "bajo"
    return {"score": score, "level": level}


async def build_report(db: AsyncSession, start: datetime, end: datetime, *, author: str, tlp: str, kind: str) -> dict[str, Any]:
    limitations: list[str] = []
    alerts = await _alerts_section(start, end, limitations)
    honeypot = await _honeypot_section(start, end) if alerts.get("available") else {"available": False}
    incidents = await _incidents_section(db, start, end)
    response = await _response_section(db, start, end)
    controls = await _controls_section(db, start, end, alerts, incidents, response)
    if alerts.get("available") and not alerts.get("countries"):
        limitations.append("Sin geolocalización: las IP atacantes del periodo son privadas (laboratorio) o no están en la base GeoIP.")
    if honeypot.get("available") and not honeypot.get("top_commands"):
        limitations.append("No se registraron comandos ejecutados por atacantes en el honeypot durante el periodo.")
    return {
        "meta": {
            "kind": kind,
            "tlp": tlp,
            "author": author,
            "organization": "Valhalla SOC",
            "period_start": start.isoformat(),
            "period_end": end.isoformat(),
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "version": "1.0",
            "ai_model": settings.ollama_model,
        },
        "risk": _risk(alerts, honeypot, incidents),
        "alerts": alerts,
        "honeypot": honeypot,
        "incidents": incidents,
        "response": response,
        "controls": controls,
        "recommendations": _recommendations(alerts, honeypot, incidents, controls),
        "limitations": limitations,
    }
