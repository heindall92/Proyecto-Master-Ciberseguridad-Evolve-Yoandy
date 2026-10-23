"""Endpoints de informes: SOC, ejecutivo y GRC, con verificación de integridad."""
from __future__ import annotations

import hmac
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Path
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import grc_builder
from app import report_builder as rb
from app.auth import get_current_user
from app.db import get_db
from app.models import Report, User
from app.ollama_client import generate_executive_summary
from app.schemas import ReportGenerateIn
from app.services.chat_ai import _AI_UNAVAILABLE
from app.services.reports import _REPORT_ID_RE, _report_summary, _require_report_role, _store_report

router = APIRouter()


# REPORTS
@router.get("/api/reports/grc")
async def grc_report(
    start: datetime | None = None,
    end: datetime | None = None,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
):
    """Informe GRC: matriz de riesgo, madurez NIST CSF, cobertura ATT&CK, cumplimiento y plan de tratamiento."""
    if current.role not in ("admin", "analyst", "analista"):
        raise HTTPException(403, "Solo admin o analista puede ver el informe GRC")
    end = end or datetime.now(timezone.utc)
    start = start or (end - timedelta(days=30))
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    if end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)
    if end <= start:
        raise HTTPException(422, "El fin del periodo debe ser posterior al inicio")
    return await grc_builder.build_grc(db, start, end, author=current.username)


@router.get("/api/reports/executive")
async def executive_report(
    start: datetime | None = None,
    end: datetime | None = None,
    ai: bool = False,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
):
    """Datos del PDF ejecutivo/técnico (plantilla de Julieta) para el periodo indicado.

    Usa el mismo generador que el Centro de informes (report_builder), así que todas
    las cifras son reales. Antes: siempre 24 h, activos 'SRV-SAP-PROD' escritos a mano,
    MTTR fijo de 15 min, ISO 27001 fijo al 75 % y recomendaciones fijas.
    """
    if current.role not in ("admin", "analyst", "analista"):
        raise HTTPException(403, "Solo admin o analista puede ver el informe ejecutivo")
    end = end or datetime.now(timezone.utc)
    start = start or (end - timedelta(days=30))
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    if end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)
    if end <= start:
        raise HTTPException(422, "El fin del periodo debe ser posterior al inicio")

    d = await rb.build_report(db, start, end, author=current.username, tlp="AMBER", kind="executive")
    a, h, inc = d["alerts"], d["honeypot"], d["incidents"]
    sev = a.get("by_severity", {})

    # La IA local (~3 tokens/s en la VM) es opcional: por defecto resumen cuantitativo instantáneo
    summary = _AI_UNAVAILABLE if not ai else await generate_executive_summary({
        "periodo": f"{start:%Y-%m-%d} a {end:%Y-%m-%d}", "alertas": a.get("total"), "por_severidad": sev,
        "incidentes": inc["total"], "mttr_min": inc["mttr_minutes"], "riesgo": d["risk"],
        "fuerza_bruta": h.get("bruteforce_detections"), "intrusiones": h.get("intrusions_after_bruteforce"),
    })
    if summary.startswith(_AI_UNAVAILABLE):
        summary = (f"Periodo {start:%d/%m/%Y}-{end:%d/%m/%Y}: {a.get('total', 0)} alertas "
                   f"({sev.get('critical', 0)} críticas, {sev.get('high', 0)} altas), {inc['total']} incidentes. "
                   f"Riesgo {d['risk']['level']} ({d['risk']['score']}/100).")

    # ISO 27001: porcentaje de controles cubiertos (parcial = medio punto)
    ctrls = d["controls"]
    iso_overall = round(sum(1 if c["status"] == "covered" else 0.5 if c["status"] == "partial" else 0 for c in ctrls) * 100 / len(ctrls)) if ctrls else 0
    level_for = lambda n: "Critical" if n >= 50 else "High" if n >= 10 else "Medium"  # noqa: E731
    return {
        "source": "api",
        "generatedAt": d["meta"]["generated_at"],
        "executiveSummary": summary,
        "riskScore": d["risk"]["score"],
        "metrics": {"by_severity": sev, "total_alerts": a.get("total", 0)},
        "topThreats": [
            {"attackType": t["tactic"], "count": t["count"], "severity": "high" if t["count"] > 10 else "medium"}
            for t in a.get("mitre_tactics", [])
        ],
        "iso27001": {
            "overall": iso_overall,
            "controls": [
                {"control": f"{c['iso']} {c['control']}", "status": {"missing": "gap"}.get(c["status"], c["status"]), "note": c["evidence"]}
                for c in ctrls
            ],
        },
        "recommendations": [f"[{r['priority'].upper()}] {r['text']}" for r in d["recommendations"]],
        "geo_intel": [
            {"country": c["country"], "code": "", "pct": round(c["count"] * 100 / max(1, sum(x["count"] for x in a.get("countries", [])))), "desc": ""}
            for c in a.get("countries", [])[:5]
        ],
        "report_metadata": {
            "report_id": f"VHL-{end:%Y%m%d}-EXEC",
            "generation_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "analyst_name": current.username.upper(),
            "company_name": "VALHALLA SOC",
            "period": f"{start:%d/%m/%Y} - {end:%d/%m/%Y}",
        },
        "executive_summary": {
            "status": "Alerta" if d["risk"]["score"] >= 50 else "Operativo",
            "health_score": 100 - d["risk"]["score"],
            "key_finding": summary,
        },
        "wazuh_metrics": {
            "total_alerts": a.get("total", 0),
            "critical_alerts": sev.get("critical", 0),
            "top_affected_assets": [{"name": g["name"], "ip": g["ip"], "alerts": g["count"]} for g in a.get("top_agents", [])],
        },
        "mitre_coverage": [
            {"tactic": t["tactic"], "count": t["count"], "level": level_for(t["count"]), "icon": ""}
            for t in a.get("mitre_tactics", [])
        ],
        "honeypot_intel": {
            "unique_attackers": len(a.get("top_attackers", [])),
            "top_passwords_captured": [p["value"] for p in h.get("top_passwords", [])[:5]],
            "malware_samples_collected": len(h.get("downloads", [])),
        },
        "incident_management": {
            "total_tickets": inc["total"],
            "closed_tickets": inc["resolved"],
            "avg_resolution_time_min": inc["mttr_minutes"] or 0,
        },
        "remediation_steps": [{"task": r["text"]} for r in d["recommendations"][:6]],
        # Detalle completo del generador para la vista en pantalla (mismas cifras que el Informe SOC)
        "detail": {
            "risk": d["risk"],
            "alerts": {k: a.get(k) for k in ("available", "total", "by_severity", "per_day", "agents_reporting",
                                             "top_agents", "top_rules", "top_attackers", "countries", "mitre_tactics")},
            "honeypot": {k: h.get(k) for k in ("available", "events", "sessions", "login_failed", "login_success",
                                               "bruteforce_detections", "intrusions_after_bruteforce",
                                               "top_usernames", "top_passwords", "top_commands")},
            "incidents": {k: v for k, v in inc.items() if k != "items"},
            "blocked_ips_total": d["response"].get("blocked_ips_total", 0),
            "controls": ctrls,
            "recommendations": d["recommendations"],
            "limitations": d["limitations"],
            "ai_summary": ai and not summary.startswith("Periodo "),
        },
    }


@router.get("/api/reports")
async def list_reports(db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    _require_report_role(current)
    rows = (await db.execute(select(Report).order_by(desc(Report.created_at)).limit(100))).scalars().all()
    return [_report_summary(r) for r in rows]


@router.post("/api/reports/generate")
async def generate_report(req: ReportGenerateIn, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    _require_report_role(current)
    start = req.start if req.start.tzinfo else req.start.replace(tzinfo=timezone.utc)
    end = req.end if req.end.tzinfo else req.end.replace(tzinfo=timezone.utc)
    if end <= start:
        raise HTTPException(422, "El fin del periodo debe ser posterior al inicio")
    if end - start > timedelta(days=366):
        raise HTTPException(422, "El periodo no puede superar un año")

    data = await rb.build_report(db, start, end, author=current.username, tlp=req.tlp, kind=req.kind)

    data["ai_summary"] = None
    if req.include_ai_summary:
        context = {
            "periodo": f"{start:%Y-%m-%d} a {end:%Y-%m-%d}",
            "alertas": data["alerts"].get("total"), "por_severidad": data["alerts"].get("by_severity"),
            "incidentes": data["incidents"]["total"], "mttr_min": data["incidents"]["mttr_minutes"],
            "fuerza_bruta": data["honeypot"].get("bruteforce_detections"),
            "intrusiones": data["honeypot"].get("intrusions_after_bruteforce"),
            "tecnicas_mitre": [t["id"] for t in data["alerts"].get("mitre_techniques", [])][:8],
            "riesgo": data["risk"],
        }
        summary = await generate_executive_summary(context)
        if summary and not summary.startswith(_AI_UNAVAILABLE):
            data["ai_summary"] = summary
        else:
            data["limitations"].append("La IA local no estaba disponible: el resumen ejecutivo es solo cuantitativo.")

    row = await _store_report(db, data, start, end, current, req.tlp, req.kind)
    return {**_report_summary(row), "data": data}


@router.get("/api/reports/{report_id}")
async def get_report(report_id: str = Path(..., pattern=_REPORT_ID_RE), db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    _require_report_role(current)
    r = (await db.execute(select(Report).where(Report.report_id == report_id))).scalar_one_or_none()
    if not r:
        raise HTTPException(404, "Informe no encontrado")
    return {**_report_summary(r), "data": r.data}


@router.get("/api/reports/{report_id}/verify")
async def verify_report(report_id: str = Path(..., pattern=_REPORT_ID_RE), db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    """Recalcula la huella del contenido guardado y la compara con la registrada al generarlo."""
    _require_report_role(current)
    r = (await db.execute(select(Report).where(Report.report_id == report_id))).scalar_one_or_none()
    if not r:
        raise HTTPException(404, "Informe no encontrado")
    current_hash = rb.fingerprint(r.data)
    return {"ok": hmac.compare_digest(current_hash, r.sha256), "stored": r.sha256, "current": current_hash}
