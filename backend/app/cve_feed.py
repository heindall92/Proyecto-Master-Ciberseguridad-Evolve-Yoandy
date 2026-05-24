"""cve_feed.py — Feed de vulnerabilidades para el módulo CVE Intel (Fase 5).

Fuente primaria: CISA KEV (Known Exploited Vulnerabilities) — vulnerabilidades
EXPLOTADAS ACTIVAMENTE. Gratis, sin API key e independiente del reloj del sistema
(NVD por fecha falla si el reloj está adelantado). Es además lo más relevante para
un SOC. Caché en memoria para no golpear la fuente en cada carga.
"""
from __future__ import annotations

import logging
import time
from typing import Any

import httpx

logger = logging.getLogger("valhalla.cve")

CISA_KEV = "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json"
_CACHE: dict[str, Any] = {"ts": 0.0, "data": []}
_TTL = 3600  # 1 h


def _norm(v: dict[str, Any]) -> dict[str, Any]:
    ransomware = (v.get("knownRansomwareCampaignUse") or "").lower() == "known"
    product = " ".join(filter(None, [v.get("vendorProject"), v.get("product")])).strip()
    return {
        "id": v.get("cveID", "CVE-?"),
        "summary": (v.get("shortDescription") or v.get("vulnerabilityName") or "").strip()[:600],
        "product": product,
        "name": v.get("vulnerabilityName", ""),
        "published": v.get("dateAdded", ""),
        "due_date": v.get("dueDate", ""),
        "required_action": (v.get("requiredAction") or "").strip()[:300],
        "ransomware": ransomware,
        "severity": "critical" if ransomware else "high",  # KEV = explotada => alta por definición
        "source": "CISA KEV",
    }


async def get_latest_cves(limit: int = 15) -> list[dict[str, Any]]:
    now = time.time()
    if _CACHE["data"] and (now - _CACHE["ts"]) < _TTL:
        return _CACHE["data"][:limit]
    try:
        async with httpx.AsyncClient(timeout=25.0, headers={"User-Agent": "Valhalla-SOC"}) as c:
            r = await c.get(CISA_KEV)
            r.raise_for_status()
            vulns = r.json().get("vulnerabilities", [])
            items = [_norm(v) for v in vulns]
            items.sort(key=lambda x: x.get("published", ""), reverse=True)  # más recientes primero
            if items:
                _CACHE["data"] = items
                _CACHE["ts"] = now
            return items[:limit]
    except Exception as e:
        logger.warning("CISA KEV feed falló: %s", e)
        return _CACHE["data"][:limit] if _CACHE["data"] else []
