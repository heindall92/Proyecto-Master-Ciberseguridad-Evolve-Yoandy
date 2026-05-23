"""abuseipdb_client.py — Integración AbuseIPDB v2 (Fase 2: enriquecimiento IOC multi-fuente).

Complementa a VirusTotal con reputación de IP basada en reportes de la comunidad:
abuseConfidenceScore (0-100), país, ISP, nº de reportes, tipo de uso, etc.
"""
from __future__ import annotations

import logging
from typing import Any

import httpx

logger = logging.getLogger("valhalla.abuseipdb")
ABUSEIPDB_BASE = "https://api.abuseipdb.com/api/v2"


def _headers(api_key: str) -> dict:
    return {"Key": api_key, "Accept": "application/json"}


async def check_ip(ip: str, api_key: str, max_age_days: int = 90) -> dict[str, Any]:
    """Consulta la reputación de una IP en AbuseIPDB."""
    try:
        async with httpx.AsyncClient(timeout=15.0) as c:
            r = await c.get(
                f"{ABUSEIPDB_BASE}/check",
                headers=_headers(api_key),
                params={"ipAddress": ip, "maxAgeInDays": str(max_age_days), "verbose": ""},
            )
            if r.status_code in (401, 403):
                return {"found": False, "ip": ip, "error": f"{r.status_code} Unauthorized"}
            r.raise_for_status()
            d = r.json().get("data", {})
            return {
                "found": True,
                "ioc_type": "ip",
                "ip": d.get("ipAddress", ip),
                "abuse_confidence_score": d.get("abuseConfidenceScore", 0),
                "country": d.get("countryCode", ""),
                "country_name": d.get("countryName", ""),
                "isp": d.get("isp", ""),
                "domain": d.get("domain", ""),
                "usage_type": d.get("usageType", ""),
                "total_reports": d.get("totalReports", 0),
                "num_distinct_users": d.get("numDistinctUsers", 0),
                "last_reported_at": d.get("lastReportedAt") or "",
                "is_whitelisted": bool(d.get("isWhitelisted")),
                "is_tor": bool(d.get("isTor")),
            }
    except Exception as e:
        logger.warning("AbuseIPDB IP check failed for %s: %s", ip, e)
        return {"found": False, "ip": ip, "error": str(e)}
