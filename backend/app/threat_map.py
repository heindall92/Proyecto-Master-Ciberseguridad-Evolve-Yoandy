"""Geolocalización de IPs atacantes (Cowrie/Wazuh) para Threat Map."""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

import httpx

from app import opensearch_client as osc

logger = logging.getLogger("valhalla.threat_map")

_geo_cache: dict[str, dict] = {}


async def _geolocate_ip(ip: str) -> dict | None:
    if not ip or ip in ("unknown", "127.0.0.1", "::1"):
        return None
    if ip in _geo_cache:
        return _geo_cache[ip]
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            r = await client.get(
                f"http://ip-api.com/json/{ip}",
                params={"fields": "status,country,countryCode,city,isp,lat,lon,query"},
            )
            data = r.json()
            if data.get("status") != "success":
                return None
            geo = {
                "ip": data.get("query", ip),
                "country": data.get("country", "Unknown"),
                "country_code": data.get("countryCode", "XX"),
                "city": data.get("city", ""),
                "isp": data.get("isp", ""),
                "lat": float(data.get("lat", 0)),
                "lon": float(data.get("lon", 0)),
            }
            _geo_cache[ip] = geo
            return geo
    except Exception as e:
        logger.warning("Geo lookup failed for %s: %s", ip, e)
        return None


async def get_threat_map_data(hours: int = 24) -> dict:
    """IPs atacantes desde OpenSearch (Cowrie) + geolocalización."""
    since = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    body = {
        "size": 0,
        "query": {
            "bool": {
                "must": [
                    {"range": {"@timestamp": {"gte": since}}},
                    {"bool": {"should": [
                        {"match": {"rule.groups": "cowrie"}},
                        {"match": {"decoder.name": "cowrie"}},
                    ]}},
                ],
                "must_not": [{"term": {"data.srcip.keyword": ""}}],
            }
        },
        "aggs": {
            "attackers": {
                "terms": {"field": "data.srcip.keyword", "size": 40},
            }
        },
    }
    resp = await osc._search(body)
    buckets = resp.get("aggregations", {}).get("attackers", {}).get("buckets", [])
    attacks: list[dict] = []
    country_counts: dict[str, int] = {}
    total = 0

    for b in buckets:
        ip = b.get("key")
        count = int(b.get("doc_count", 0))
        if not ip or ip == "unknown":
            continue
        total += count
        geo = await _geolocate_ip(ip)
        if not geo:
            geo = {
                "ip": ip,
                "country": "Unknown",
                "country_code": "XX",
                "city": "",
                "isp": "",
                "lat": 0.0,
                "lon": 0.0,
            }
        attacks.append({**geo, "count": count, "is_honeypot": False})
        c = geo["country"]
        country_counts[c] = country_counts.get(c, 0) + count

    countries = [
        {"country": k, "count": v}
        for k, v in sorted(country_counts.items(), key=lambda x: -x[1])
    ]
    return {
        "attacks": attacks,
        "countries": countries,
        "total_attacks": total,
    }
