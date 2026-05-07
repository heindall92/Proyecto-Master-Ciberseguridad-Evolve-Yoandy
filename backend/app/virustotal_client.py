"""virustotal_client.py — VirusTotal v3 API integration."""
from __future__ import annotations
import logging
from typing import Any
import httpx
from app.settings import settings

logger = logging.getLogger("valhalla.virustotal")
VT_BASE = "https://www.virustotal.com/api/v3"


def _headers(api_key: str) -> dict:
    return {"x-apikey": api_key}


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


async def check_ip(ip: str, api_key: str) -> dict[str, Any]:
    try:
        async with httpx.AsyncClient(timeout=15.0) as c:
            r = await c.get(f"{VT_BASE}/ip_addresses/{ip}", headers=_headers(api_key))
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
                # Extra: Comments and Resolutions
                "comments": await _get_comments("ip_addresses", ip, api_key),
                "resolutions": await _get_resolutions("ip_addresses", ip, api_key),
            }
    except Exception as e:
        logger.warning("VT IP check failed for %s: %s", ip, e)
        return {"found": False, "ip": ip, "error": str(e)}


async def check_hash(file_hash: str, api_key: str) -> dict[str, Any]:
    try:
        async with httpx.AsyncClient(timeout=15.0) as c:
            r = await c.get(f"{VT_BASE}/files/{file_hash}", headers=_headers(api_key))
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
                "comments": await _get_comments("files", file_hash, api_key),
            }
    except Exception as e:
        logger.warning("VT hash check failed for %s: %s", file_hash, e)
        return {"found": False, "hash": file_hash, "error": str(e)}


async def check_domain(domain: str, api_key: str) -> dict[str, Any]:
    try:
        async with httpx.AsyncClient(timeout=15.0) as c:
            r = await c.get(f"{VT_BASE}/domains/{domain}", headers=_headers(api_key))
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
                "comments": await _get_comments("domains", domain, api_key),
                "resolutions": await _get_resolutions("domains", domain, api_key),
            }
    except Exception as e:
        logger.warning("VT domain check failed for %s: %s", domain, e)
        return {"found": False, "domain": domain, "error": str(e)}

async def _get_comments(endpoint_type: str, ioc: str, api_key: str) -> list:
    try:
        async with httpx.AsyncClient(timeout=10.0) as c:
            r = await c.get(f"{VT_BASE}/{endpoint_type}/{ioc}/comments?limit=10", headers=_headers(api_key))
            if r.status_code != 200: return []
            comments = r.json().get("data", [])
            return [
                {
                    "text": c.get("attributes", {}).get("text", ""),
                    "date": _ts(c.get("attributes", {}).get("date", 0)),
                    "votes": c.get("attributes", {}).get("votes", {}),
                    "user": c.get("relationships", {}).get("author", {}).get("data", {}).get("id", "Unknown")
                } for c in comments
            ]
    except: return []

async def _get_resolutions(endpoint_type: str, ioc: str, api_key: str) -> list:
    try:
        async with httpx.AsyncClient(timeout=10.0) as c:
            r = await c.get(f"{VT_BASE}/{endpoint_type}/{ioc}/resolutions?limit=10", headers=_headers(api_key))
            if r.status_code != 200: return []
            res = r.json().get("data", [])
            return [
                {
                    "host": r.get("attributes", {}).get("host_name", ""),
                    "ip": r.get("attributes", {}).get("ip_address", ""),
                    "date": _ts(r.get("attributes", {}).get("date", 0))
                } for r in res
            ]
    except: return []
