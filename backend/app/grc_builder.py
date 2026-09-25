"""Informe GRC (gobierno, riesgo y cumplimiento) a partir de datos reales.

Reutiliza el generador de informes (report_builder) y añade:
- Cobertura MITRE ATT&CK del ruleset cargado en Wazuh (reglas con técnica asociada)
  frente a las técnicas observadas en el periodo (vistas Observadas / Cobertura /
  Inteligencia, como en dark_spear).
- Escenarios de riesgo en una matriz 5×5 (probabilidad × impacto) con la
  justificación de cada valor.
- Madurez por función de NIST CSF 2.0 (gráfico de araña).
- Plan de tratamiento del riesgo (acción, responsable, plazo por prioridad).

Todas las fórmulas y umbrales se devuelven en `method` para que el informe los muestre.
"""
from __future__ import annotations

import json
import logging
import time
from pathlib import Path
from datetime import datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app import report_builder as rb
from app.wazuh_client import WazuhClient

logger = logging.getLogger("valhalla.grc")

# ─── Mapa multinorma (Rosetta) ──────────────────────────────────────────────
# Equivalencias revisadas entre los controles que Valhalla evalúa y los requisitos
# de ENS, ISO 27001, NIS2 e ISO 42001 (catálogo Rosetta del autor). Solo se incluyen
# los controles de Rosetta de los que Valhalla aporta evidencia real (p. ej. no MFA).
_CROSSWALK = json.loads((Path(__file__).parent / "data" / "rosetta_crosswalk.json").read_text(encoding="utf-8"))


def _multinorma(controls: list[dict]) -> dict[str, Any]:
    per_fw: dict[str, dict[str, set]] = {fw: {"covered": set(), "partial": set()} for fw in _CROSSWALK["frameworks"]}
    for c in controls:
        c["crosswalk"] = _CROSSWALK["controls"].get(c["iso"], [])
        bucket = {"covered": "covered", "partial": "partial"}.get(c["status"])
        if not bucket:
            continue
        for rc in c["crosswalk"]:
            for fw, reqs in rc["maps"].items():
                per_fw[fw][bucket].update(r["id"] for r in reqs)
    out = {}
    for fw, meta in _CROSSWALK["frameworks"].items():
        partial = per_fw[fw]["partial"] - per_fw[fw]["covered"]
        out[fw] = {"name": meta["name"], "total": meta["total"],
                   "covered": len(per_fw[fw]["covered"]), "partial": len(partial)}
    return {"source": _CROSSWALK["source"], "frameworks": out}


# ─── Cobertura ATT&CK del ruleset (cacheada: el ruleset cambia poco) ─────────
_COVERAGE_TTL = 3600
_coverage_cache: dict[str, Any] = {"at": 0.0, "data": None}

# Orden de la matriz Enterprise ATT&CK
_TACTIC_ORDER = ["TA0043", "TA0042", "TA0001", "TA0002", "TA0003", "TA0004", "TA0005",
                 "TA0006", "TA0007", "TA0008", "TA0009", "TA0011", "TA0010", "TA0040"]


async def _paged(w: WazuhClient, path: str, params: dict[str, Any], page: int = 500) -> list[dict]:
    out: list[dict] = []
    offset = 0
    while True:
        r = await w.request("GET", path, params={**params, "limit": page, "offset": offset})
        r.raise_for_status()
        data = r.json().get("data", {})
        items = data.get("affected_items", [])
        out.extend(items)
        offset += len(items)
        if not items or offset >= data.get("total_affected_items", 0):
            return out


async def attack_coverage() -> dict[str, Any] | None:
    """Matriz ATT&CK con las reglas que cubren cada técnica. None si la API de Wazuh no responde."""
    now = time.monotonic()
    if _coverage_cache["data"] and now - _coverage_cache["at"] < _COVERAGE_TTL:
        return _coverage_cache["data"]
    try:
        w = WazuhClient()
        tactics = await _paged(w, "/mitre/tactics", {"select": "id,name,external_id"})
        techniques = await _paged(w, "/mitre/techniques", {"select": "id,name,external_id,tactics"})
        rules = await _paged(w, "/rules", {"select": "id,level,mitre"})
    except Exception as e:  # noqa: BLE001
        logger.warning("GRC: no se pudo leer la cobertura ATT&CK de Wazuh: %s", e)
        return None

    rules_by_tech: dict[str, list[int]] = {}
    for r in rules:
        for t in r.get("mitre") or []:
            rules_by_tech.setdefault(t, []).append(r["id"])

    tactic_by_stix = {t["id"]: t for t in tactics}
    columns: dict[str, dict[str, Any]] = {
        t["external_id"]: {"id": t["external_id"], "name": t["name"], "techniques": []} for t in tactics
    }
    for tech in techniques:
        ext = tech.get("external_id") or ""
        if "." in ext:  # las subtécnicas se agregan a su técnica padre
            continue
        subs = [k for k in rules_by_tech if k.startswith(ext + ".")]
        rule_ids = sorted(set(rules_by_tech.get(ext, []) + [rid for k in subs for rid in rules_by_tech[k]]))
        n = len(rule_ids)
        entry = {"id": ext, "name": tech.get("name", ""), "rules": n, "rule_ids": rule_ids[:12],
                 "coverage": "high" if n >= 3 else "partial" if n >= 1 else "none"}
        for stix in tech.get("tactics") or []:
            tac = tactic_by_stix.get(stix)
            if tac and tac["external_id"] in columns:
                columns[tac["external_id"]]["techniques"].append(entry)

    ordered = [columns[k] for k in _TACTIC_ORDER if k in columns] + [v for k, v in columns.items() if k not in _TACTIC_ORDER]
    for col in ordered:
        col["techniques"].sort(key=lambda t: (-t["rules"], t["id"]))
    unique = {t["id"]: t for col in ordered for t in col["techniques"]}
    covered = sum(1 for t in unique.values() if t["coverage"] != "none")
    data = {
        "tactics": ordered,
        "techniques_total": len(unique),
        "techniques_covered": covered,
        "techniques_high": sum(1 for t in unique.values() if t["coverage"] == "high"),
        "coverage_pct": round(covered * 100 / len(unique), 1) if unique else 0,
        "rules_total": len(rules),
        "rules_with_mitre": sum(1 for r in rules if r.get("mitre")),
    }
    _coverage_cache.update(at=now, data=data)
    return data


# ─── Riesgo ──────────────────────────────────────────────────────────────────
def _prob(n: int) -> int:
    """Probabilidad 1-5 según ocurrencias en el periodo: 0 → 1, 1-2 → 2, 3-9 → 3, 10-49 → 4, ≥50 → 5."""
    return 1 if n <= 0 else 2 if n <= 2 else 3 if n <= 9 else 4 if n <= 49 else 5


def _level(score: int) -> str:
    return "crítico" if score >= 15 else "alto" if score >= 10 else "medio" if score >= 5 else "bajo"


PRIORITY_DEADLINE_DAYS = {"critical": 7, "high": 30, "medium": 90, "low": 180}


def _scenarios(d: dict[str, Any], observed_gap: list[dict]) -> list[dict[str, Any]]:
    a, h, inc, ctrls = d["alerts"], d["honeypot"], d["incidents"], d["controls"]
    sev = a.get("by_severity", {})
    out: list[dict[str, Any]] = []

    def add(title, prob, impact, why, treatment, owner):
        score = prob * impact
        out.append({"title": title, "probability": prob, "impact": impact, "score": score, "level": _level(score),
                    "justification": why, "treatment": treatment, "owner": owner})

    if h.get("available"):
        bf, intr = h.get("bruteforce_detections", 0), h.get("intrusions_after_bruteforce", 0)
        add("Acceso no autorizado por fuerza bruta (SSH/Telnet)", _prob(bf + intr), 5 if intr else 4,
            f"{bf} detecciones de fuerza bruta y {intr} accesos tras ella en el periodo (T1110).",
            "Mitigar", "Administrador de sistemas")
    if sev.get("critical", 0) or sev.get("high", 0):
        n = sev.get("critical", 0) + sev.get("high", 0)
        add("Actividad maliciosa de severidad alta/crítica", _prob(n), 4,
            f"{sev.get('critical', 0)} alertas críticas y {sev.get('high', 0)} altas en el periodo.",
            "Mitigar", "Analista SOC")
    active = inc.get("total", 0) - inc.get("resolved", 0)
    if active:
        add("Incidentes abiertos sin cerrar", _prob(active), 3 if not inc.get("unassigned_active") else 4,
            f"{active} incidentes abiertos, {inc.get('unassigned_active', 0)} sin responsable asignado.",
            "Mitigar", "Responsable del SOC")
    if observed_gap:
        add("Técnicas observadas sin regla de detección propia", _prob(len(observed_gap)), 3,
            f"{len(observed_gap)} técnicas ATT&CK vistas en alertas sin reglas específicas en el ruleset.",
            "Mitigar", "Ingeniería de detección")
    for c in ctrls:
        if c["status"] == "covered":
            continue
        add(f"{'Control parcial' if c['status'] == 'partial' else 'Carencia en el control'} {c['iso']}: {c['control']}", 3 if c["status"] == "partial" else 4, 3,
            c["evidence"], "Mitigar" if c["status"] == "missing" else "Aceptar temporalmente / mitigar", "Responsable de seguridad (CISO)")
    out.sort(key=lambda s: -s["score"])
    for i, s in enumerate(out, 1):
        s["id"] = f"R{i}"
    return out


def _nist_csf(d: dict[str, Any], coverage: dict | None) -> list[dict[str, Any]]:
    """Madurez 0-100 por función NIST CSF 2.0 a partir de controles (cubierto=100, parcial=50, carencia=0) y métricas."""
    status = {c["iso"]: {"covered": 100, "partial": 50}.get(c["status"], 0) for c in d["controls"]}
    inc, a = d["incidents"], d["alerts"]

    def avg(*vals):
        vals = [v for v in vals if v is not None]
        return round(sum(vals) / len(vals)) if vals else 0

    agents_pct = min(100, a.get("agents_reporting", 0) * 50) if a.get("available") else 0
    return [
        {"function": "Gobernar", "code": "GV", "score": avg(status.get("A.8.15"), status.get("A.5.15 / A.8.5")),
         "basis": "Retención de registros (A.8.15) y control de acceso/roles (A.5.15, A.8.5)."},
        {"function": "Identificar", "code": "ID", "score": avg(agents_pct, status.get("A.5.7")),
         "basis": "Activos monitorizados con agente y fuentes de inteligencia de amenazas (A.5.7)."},
        {"function": "Proteger", "code": "PR", "score": avg(status.get("A.8.20"), status.get("A.5.15 / A.8.5")),
         "basis": "Contención en red (A.8.20) y autenticación/RBAC (A.5.15, A.8.5)."},
        {"function": "Detectar", "code": "DE", "score": avg(status.get("A.8.16"), coverage["coverage_pct"] if coverage else None),
         "basis": "Monitorización (A.8.16) y cobertura ATT&CK del ruleset."},
        {"function": "Responder", "code": "RS",
         "score": avg(status.get("A.5.25 / A.5.26"), inc.get("sla_met_pct"),
                      round(inc["resolved"] * 100 / inc["total"]) if inc.get("total") else None),
         "basis": "Gestión de incidentes (A.5.25/26), % dentro de SLA y % de incidentes resueltos."},
        {"function": "Recuperar", "code": "RC", "score": avg(status.get("A.5.27"), status.get("A.5.28")),
         "basis": "Lecciones aprendidas/clasificación (A.5.27) y evidencias con cadena de custodia (A.5.28)."},
    ]


async def build_grc(db: AsyncSession, start: datetime, end: datetime, *, author: str) -> dict[str, Any]:
    d = await rb.build_report(db, start, end, author=author, tlp="AMBER", kind="grc")
    coverage = await attack_coverage()
    limitations = list(d["limitations"])

    observed = {t["id"]: t for t in d["alerts"].get("mitre_techniques", [])}
    observed_gap: list[dict] = []
    if coverage:
        known = {t["id"]: t for col in coverage["tactics"] for t in col["techniques"]}
        for tid, t in observed.items():
            parent = known.get(tid.split(".")[0])
            if parent is None or parent["coverage"] == "none":
                observed_gap.append({"id": tid, "name": t.get("name", ""), "count": t.get("count", 0)})
        limitations.append("La cobertura ATT&CK se calcula sobre las reglas cargadas en Wazuh: que exista una regla no "
                           "garantiza que llegue la fuente de logs que la dispara.")
    else:
        limitations.append("La API de Wazuh no respondió: no se muestra la cobertura ATT&CK del ruleset.")

    scenarios = _scenarios(d, observed_gap)
    ctrls = d["controls"]
    multinorma = _multinorma(ctrls)
    compliance = round(sum({"covered": 1, "partial": 0.5}.get(c["status"], 0) for c in ctrls) * 100 / len(ctrls)) if ctrls else 0

    plan = []
    for r in d["recommendations"]:
        plan.append({"action": r["text"], "reason": r["reason"], "priority": r["priority"],
                     "deadline_days": PRIORITY_DEADLINE_DAYS.get(r["priority"], 90),
                     "owner": "Administrador de sistemas" if "SSH" in r["text"] or "fail2ban" in r["text"]
                     else "Responsable de seguridad (CISO)" if "control" in r["text"].lower() else "Responsable del SOC",
                     "status": "Abierta"})

    return {
        "meta": {**d["meta"], "kind": "grc"},
        "risk": d["risk"],
        "kpis": {
            "residual_risk": d["risk"],
            "compliance_pct": compliance,
            "attack_coverage_pct": coverage["coverage_pct"] if coverage else None,
            "open_actions": len(plan),
            "scenarios_high": sum(1 for s in scenarios if s["level"] in ("alto", "crítico")),
        },
        "scenarios": scenarios,
        "nist_csf": _nist_csf(d, coverage),
        "attack": {
            "coverage": coverage,
            "observed": [{"id": k, "name": v.get("name", ""), "count": v.get("count", 0), "tactics": v.get("tactics", [])}
                         for k, v in observed.items()],
            "observed_gap": observed_gap,
        },
        "controls": ctrls,
        "multinorma": multinorma,
        "plan": plan,
        "limitations": limitations,
        "method": {
            "probability": "1-5 por ocurrencias en el periodo: 0→1, 1-2→2, 3-9→3, 10-49→4, ≥50→5.",
            "impact": "1-5 según el activo o proceso afectado (acceso a sistema 4, acceso confirmado 5, operación del SOC 3).",
            "level": "Probabilidad × impacto: ≥15 crítico, ≥10 alto, ≥5 medio, <5 bajo.",
            "coverage": "Técnica cubierta si al menos una regla del ruleset la etiqueta (alta con ≥3 reglas); las subtécnicas cuentan para su técnica.",
            "nist": "Controles: cubierto 100, parcial 50, carencia 0; se promedian con la métrica indicada en cada función.",
            "deadlines": "Plazo por prioridad: crítica 7 días, alta 30, media 90, baja 180.",
            "multinorma": "Requisitos a los que Valhalla aporta evidencia a través de sus controles (mapa Rosetta). "
                          "Aportar evidencia no equivale a cumplir la norma completa: un SIEM cubre sobre todo detección y respuesta.",
        },
    }
