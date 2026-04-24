"""virustotal_client.py — VirusTotal v3 API integration."""
from __future__ import annotations
import logging
from typing import Any
import httpx
from app.settings import settings

logger = logging.getLogger("valhalla.virustotal")
VT_BASE = "https://www.virustotal.com/api/v3"


def _headers() -> dict:
    return {"x-apikey": settings.virustotal_api_key}


def _ts(unix: int | None) -> str:
    if not unix:
        return ""
    from datetime import datetime, timezone
    return datetime.fromtimestamp(unix, tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")


def _vendor_list(results: dict) -> list:
    out = []
    for vendor, res in results.items():
        out.append({
            "vendor": vendor,
            "category": res.get("category", ""),
            "result": res.get("result") or "",
            "method": res.get("method", ""),
        })
    return sorted(out, key=lambda x: (x["category"] not in ("malicious", "suspicious"), x["vendor"]))


async def check_ip(ip: str) -> dict[str, Any]:
    try:
        async with httpx.AsyncClient(timeout=15.0) as c:
            r = await c.get(f"{VT_BASE}/ip_addresses/{ip}", headers=_headers())
            if r.status_code == 404:
                return {"found": False, "ip": ip}
            r.raise_for_status()
            data = r.json().get("data", {})
            d = data.get("attributes", {})
            stats = d.get("last_analysis_stats", {})
            return {
                "found": True,
                "ioc_type": "ip",
                "ip": ip,
                # Network / Geo
                "country": d.get("country", ""),
                "continent": d.get("continent", ""),
                "asn": d.get("asn", ""),
                "as_owner": d.get("as_owner", ""),
                "network": d.get("network", ""),
                "regional_internet_registry": d.get("regional_internet_registry", ""),
                # Scores
                "reputation": d.get("reputation", 0),
                "tags": d.get("tags", []),
                # Analysis stats
                "malicious": stats.get("malicious", 0),
                "suspicious": stats.get("suspicious", 0),
                "harmless": stats.get("harmless", 0),
                "undetected": stats.get("undetected", 0),
                "timeout": stats.get("timeout", 0),
                "total": sum(stats.values()),
                # Dates
                "last_analysis_date": _ts(d.get("last_analysis_date")),
                "last_modification_date": _ts(d.get("last_modification_date")),
                # Vendor breakdown (full list)
                "vendor_results": _vendor_list(d.get("last_analysis_results", {})),
                # WHOIS
                "whois": d.get("whois", ""),
                "whois_date": _ts(d.get("whois_date")),
                # Submission dates
                "first_submission_date": _ts(d.get("first_submission_date")),
                "last_submission_date": _ts(d.get("last_submission_date")),
                # Categories by vendor (only malicious/suspicious with a label)
                "categories": {
                    vendor: res.get("result") or res.get("category", "")
                    for vendor, res in d.get("last_analysis_results", {}).items()
                    if res.get("category") in ("malicious", "suspicious") and (res.get("result") or res.get("category"))
                },
            }
    except Exception as e:
        logger.warning("VT IP check failed for %s: %s", ip, e)
        return {"found": False, "ip": ip, "error": str(e)}


async def check_hash(file_hash: str) -> dict[str, Any]:
    try:
        async with httpx.AsyncClient(timeout=15.0) as c:
            r = await c.get(f"{VT_BASE}/files/{file_hash}", headers=_headers())
            if r.status_code == 404:
                return {"found": False, "hash": file_hash}
            r.raise_for_status()
            d = r.json().get("data", {}).get("attributes", {})
            stats = d.get("last_analysis_stats", {})
            return {
                "found": True,
                "ioc_type": "hash",
                "hash": file_hash,
                "name": d.get("meaningful_name", d.get("name", "")),
                "type": d.get("type_description", ""),
                "size": d.get("size", 0),
                "malicious": stats.get("malicious", 0),
                "suspicious": stats.get("suspicious", 0),
                "harmless": stats.get("harmless", 0),
                "undetected": stats.get("undetected", 0),
                "total": sum(stats.values()),
                "tags": d.get("tags", []),
                "sha256": d.get("sha256", file_hash),
                "md5": d.get("md5", ""),
                "sha1": d.get("sha1", ""),
                "vendor_results": _vendor_list(d.get("last_analysis_results", {})),
                "first_submission_date": _ts(d.get("first_submission_date")),
                "last_submission_date": _ts(d.get("last_submission_date")),
                "last_analysis_date": _ts(d.get("last_analysis_date")),
                "reputation": d.get("reputation", 0),
            }
    except Exception as e:
        logger.warning("VT hash check failed for %s: %s", file_hash, e)
        return {"found": False, "hash": file_hash, "error": str(e)}


async def check_domain(domain: str) -> dict[str, Any]:
    try:
        async with httpx.AsyncClient(timeout=15.0) as c:
            r = await c.get(f"{VT_BASE}/domains/{domain}", headers=_headers())
            if r.status_code == 404:
                return {"found": False, "domain": domain}
            r.raise_for_status()
            d = r.json().get("data", {}).get("attributes", {})
            stats = d.get("last_analysis_stats", {})
            return {
                "found": True,
                "ioc_type": "domain",
                "domain": domain,
                "registrar": d.get("registrar", ""),
                "creation_date": _ts(d.get("creation_date")),
                "last_update_date": _ts(d.get("last_update_date")),
                "malicious": stats.get("malicious", 0),
                "suspicious": stats.get("suspicious", 0),
                "harmless": stats.get("harmless", 0),
                "undetected": stats.get("undetected", 0),
                "total": sum(stats.values()),
                "reputation": d.get("reputation", 0),
                "tags": d.get("tags", []),
                "categories": d.get("categories", {}),
                "vendor_results": _vendor_list(d.get("last_analysis_results", {})),
                "last_analysis_date": _ts(d.get("last_analysis_date")),
                "whois": d.get("whois", ""),
            }
    except Exception as e:
        logger.warning("VT domain check failed for %s: %s", domain, e)
        return {"found": False, "domain": domain, "error": str(e)}
