"""Enriquecimiento de CVE para priorizar parches (inspirado en cvemapping).

Para cada CVE del catálogo KEV de CISA (ya explotadas) añade:
- CVSS real desde la API pública del NVD (antes la severidad era una regla fija:
  "ransomware = crítica, si no alta").
- Exploits públicos: nº de repositorios PoC en GitHub y resultados de Exploit-DB
  (servicio searchsploit del laboratorio).
- Prioridad 0-100 con fórmula documentada.

Las APIs públicas tienen límites (NVD: 5 peticiones/30 s sin clave; GitHub: 10/min
sin token), así que se serializan con un intervalo mínimo y se cachean 24 h.
"""
from __future__ import annotations

import asyncio
import logging
import os
import re
import time
from typing import Any

import httpx

from app import exploit_search

logger = logging.getLogger("valhalla.cve_enrich")

CVE_RE = re.compile(r"^CVE-\d{4}-\d{4,7}$")
NVD_URL = "https://services.nvd.nist.gov/rest/json/cves/2.0"
GITHUB_URL = "https://api.github.com/search/repositories"
_TTL = 24 * 3600
_UA = {"User-Agent": "Valhalla-SOC"}

_cache: dict[str, tuple[float, dict[str, Any]]] = {}
_nvd_lock, _gh_lock = asyncio.Lock(), asyncio.Lock()
_last = {"nvd": 0.0, "gh": 0.0}


async def _throttle(kind: str, lock: asyncio.Lock, min_interval: float):
    async with lock:
        wait = _last[kind] + min_interval - time.monotonic()
        if wait > 0:
            await asyncio.sleep(wait)
        _last[kind] = time.monotonic()


async def _nvd(cve: str) -> dict[str, Any] | None:
    key = os.getenv("NVD_API_KEY", "")
    await _throttle("nvd", _nvd_lock, 0.7 if key else 6.2)
    try:
        async with httpx.AsyncClient(timeout=20, headers={**_UA, **({"apiKey": key} if key else {})}) as c:
            r = await c.get(NVD_URL, params={"cveId": cve})
            r.raise_for_status()
            vulns = r.json().get("vulnerabilities", [])
    except Exception as e:  # noqa: BLE001
        logger.warning("NVD %s: %s", cve, e)
        return None
    if not vulns:
        return None
    metrics = vulns[0].get("cve", {}).get("metrics", {})
    for k in ("cvssMetricV40", "cvssMetricV31", "cvssMetricV30"):
        if metrics.get(k):
            d = metrics[k][0].get("cvssData", {})
            return {"score": d.get("baseScore"), "severity": (d.get("baseSeverity") or "").lower(),
                    "vector": d.get("vectorString", ""), "version": d.get("version", "")}
    return None


async def _github(cve: str) -> dict[str, Any] | None:
    token = os.getenv("GITHUB_TOKEN", "")
    await _throttle("gh", _gh_lock, 2.2 if token else 6.5)
    headers = {**_UA, "Accept": "application/vnd.github+json", **({"Authorization": f"Bearer {token}"} if token else {})}
    try:
        async with httpx.AsyncClient(timeout=20, headers=headers) as c:
            r = await c.get(GITHUB_URL, params={"q": f"{cve} in:name,description", "sort": "stars", "per_page": 3})
            r.raise_for_status()
            j = r.json()
    except Exception as e:  # noqa: BLE001
        logger.warning("GitHub %s: %s", cve, e)
        return None
    return {
        "count": j.get("total_count", 0),
        "top": [{"repo": i["full_name"], "stars": i.get("stargazers_count", 0), "url": i["html_url"],
                 "updated": (i.get("pushed_at") or "")[:10]} for i in j.get("items", [])[:3]],
    }


def _priority(kev: dict[str, Any], cvss: dict | None, gh: dict | None, edb: dict | None) -> dict[str, Any]:
    """KEV (explotada) 40 + CVSS×4 (0-40) + exploit público 15 + ransomware 5."""
    score, reasons = 40, ["Explotada activamente (CISA KEV)"]
    if cvss and cvss.get("score") is not None:
        score += round(float(cvss["score"]) * 4)
        reasons.append(f"CVSS {cvss['score']} ({cvss['severity']})")
    public = (gh or {}).get("count", 0) + (edb or {}).get("count", 0)
    if public:
        score += 15
        reasons.append(f"{public} exploit(s)/PoC públicos")
    if kev.get("ransomware"):
        score += 5
        reasons.append("Usada en campañas de ransomware")
    score = min(100, score)
    label = "Parchear ya" if score >= 85 else "Alta" if score >= 70 else "Media"
    return {"score": score, "label": label, "reasons": reasons}


async def enrich(cve: str, kev: dict[str, Any] | None = None) -> dict[str, Any]:
    cve = (cve or "").strip().upper()
    if not CVE_RE.match(cve):
        return {"cve": cve, "error": "formato CVE inválido"}
    hit = _cache.get(cve)
    if hit and time.time() - hit[0] < _TTL:
        return hit[1]
    cvss, gh, edb = await asyncio.gather(_nvd(cve), _github(cve), exploit_search.search_exploits(cve))
    edb_out = None if edb.get("error") else {"count": edb.get("count", 0),
                                              "items": [{"title": x.get("title", ""), "path": x.get("path", "")} for x in edb.get("exploits", [])[:3]]}
    out = {"cve": cve, "cvss": cvss, "github": gh, "exploitdb": edb_out,
           "priority": _priority(kev or {}, cvss, gh, edb_out),
           "sources": {"nvd": cvss is not None, "github": gh is not None, "exploitdb": edb_out is not None}}
    # Solo se cachea si respondió al menos una fuente (si no, se reintenta en la siguiente petición)
    if cvss or gh or edb_out:
        _cache[cve] = (time.time(), out)
    return out
