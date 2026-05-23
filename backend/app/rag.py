"""rag.py — Recuperación de conocimiento para el triage IA (Fase 3, motor RAG ligero).

Sin dependencias de vector DB: recupera runbooks relevantes por solapamiento de
palabras clave y aporta contexto MITRE ATT&CK, para que la IA fundamente sus
recomendaciones en procedimientos REALES del SOC (no en conocimiento genérico).
"""
from __future__ import annotations

import re
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Runbook

# Mapa MITRE ATT&CK de las técnicas usadas por las reglas de Valhalla.
MITRE_TECHNIQUES: dict[str, dict[str, str]] = {
    "T1110": {"name": "Brute Force", "tactic": "Credential Access"},
    "T1110.001": {"name": "Password Guessing", "tactic": "Credential Access"},
    "T1078": {"name": "Valid Accounts", "tactic": "Defense Evasion / Persistence"},
    "T1059": {"name": "Command and Scripting Interpreter", "tactic": "Execution"},
    "T1059.004": {"name": "Unix Shell", "tactic": "Execution"},
    "T1082": {"name": "System Information Discovery", "tactic": "Discovery"},
    "T1105": {"name": "Ingress Tool Transfer", "tactic": "Command and Control"},
    "T1071": {"name": "Application Layer Protocol", "tactic": "Command and Control"},
    "T1562": {"name": "Impair Defenses", "tactic": "Defense Evasion"},
    "T1562.001": {"name": "Disable or Modify Tools", "tactic": "Defense Evasion"},
    "T1053": {"name": "Scheduled Task/Job", "tactic": "Persistence"},
    "T1070": {"name": "Indicator Removal", "tactic": "Defense Evasion"},
    "T1548": {"name": "Abuse Elevation Control Mechanism", "tactic": "Privilege Escalation"},
    "T1572": {"name": "Protocol Tunneling", "tactic": "Command and Control"},
    "T1496": {"name": "Resource Hijacking", "tactic": "Impact"},
    "T1485": {"name": "Data Destruction", "tactic": "Impact"},
    "T1595": {"name": "Active Scanning", "tactic": "Reconnaissance"},
    "T1063": {"name": "Security Software Discovery", "tactic": "Discovery"},
}

_STOP = {
    "the", "and", "for", "from", "with", "que", "los", "las", "del", "por", "una", "con",
    "de", "la", "el", "en", "un", "se", "su", "es", "a", "y", "o", "to", "of", "in", "on",
}


def _tokens(text: str) -> set[str]:
    return {w for w in re.split(r"[^a-záéíóúñ0-9]+", (text or "").lower()) if len(w) > 2 and w not in _STOP}


def mitre_context(ttps: list[str]) -> list[dict[str, str]]:
    out = []
    for t in ttps or []:
        info = MITRE_TECHNIQUES.get(t) or MITRE_TECHNIQUES.get(t.split(".")[0])
        if info:
            out.append({"id": t, **info})
    return out


async def retrieve_runbooks(db: AsyncSession, query_text: str, ttps: list[str], top_k: int = 2) -> list[dict[str, Any]]:
    """Top-K runbooks activos por solapamiento de palabras clave con la alerta + MITRE."""
    rows = (await db.execute(select(Runbook).where(Runbook.is_active == True))).scalars().all()
    if not rows:
        return []
    q = _tokens(query_text)
    for info in mitre_context(ttps):
        q |= _tokens(info["name"]) | _tokens(info["tactic"])
    def _join(steps: Any) -> str:
        return " ".join(str(s) for s in (steps or []))

    scored = []
    for rb in rows:
        doc = " ".join(filter(None, [
            rb.name, rb.category, rb.description,
            _join(rb.containment_steps),
            _join(rb.eradication_steps),
        ]))
        score = len(q & _tokens(doc))
        if score > 0:
            scored.append((score, rb))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [
        {
            "id": rb.id,
            "name": rb.name,
            "category": rb.category,
            "containment_steps": (rb.containment_steps or [])[:5],
        }
        for _, rb in scored[:top_k]
    ]


async def build_knowledge(db: AsyncSession, query_text: str, ttps: list[str]) -> dict[str, Any]:
    """Bloque de conocimiento (runbooks + MITRE) para inyectar en el prompt del triage."""
    return {
        "mitre": mitre_context(ttps),
        "runbooks": await retrieve_runbooks(db, query_text, ttps),
    }
