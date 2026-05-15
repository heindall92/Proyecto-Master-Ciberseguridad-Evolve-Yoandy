"""
opensearch_client.py — Direct OpenSearch queries against Wazuh Indexer.
Provides all analytics: top attackers, MITRE coverage, alert levels,
event types, Cowrie timeline, and alert volume over time.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

from app.settings import settings

logger = logging.getLogger("valhalla.opensearch")

INDEX = "wazuh-alerts-*"
COWRIE_INDEX = "wazuh-alerts-*"


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        base_url=settings.opensearch_url,
        auth=(settings.opensearch_user, settings.opensearch_pass),
        verify=False,
        timeout=15.0,
    )


async def _search(body: dict[str, Any]) -> dict[str, Any]:
    try:
        async with _client() as c:
            r = await c.post(f"/{INDEX}/_search", json=body)
            r.raise_for_status()
            return r.json()
    except Exception as e:
        logger.warning("OpenSearch query failed: %s", e)
        return {}


# ── Top 20 Attackers ────────────────────────────────────────────────────────

async def get_top_attackers(limit: int = 20, hours: int = 24) -> list[dict]:
    since = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    body = {
        "size": 0,
        "query": {"range": {"@timestamp": {"gte": since}}},
        "aggs": {
            "top_ips": {
                "terms": {"field": "data.srcip", "size": limit, "missing": "unknown"},
                "aggs": {
                    "last_seen": {"max": {"field": "@timestamp"}},
                    "attack_type": {"terms": {"field": "rule.description", "size": 1}}
                }
            }
        }
    }
    resp = await _search(body)
    buckets = resp.get("aggregations", {}).get("top_ips", {}).get("buckets", [])
    result = []
    for b in buckets:
        top_desc = b.get("attack_type", {}).get("buckets", [])
        result.append({
            "ip": b["key"],
            "count": b["doc_count"],
            "last_seen": b.get("last_seen", {}).get("value_as_string", ""),
            "attack_type": top_desc[0]["key"] if top_desc else "Generic Attack",
        })
    return result


# ── Alert Levels Distribution ────────────────────────────────────────────────

async def get_alert_levels(hours: int = 24) -> list[dict]:
    since = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    body = {
        "size": 0,
        "query": {"range": {"@timestamp": {"gte": since}}},
        "aggs": {
            "levels": {
                "terms": {"field": "rule.level", "size": 20, "order": {"_key": "asc"}}
            }
        }
    }
    resp = await _search(body)
    buckets = resp.get("aggregations", {}).get("levels", {}).get("buckets", [])
    return [{"level": b["key"], "count": b["doc_count"]} for b in buckets]


# ── Event Types / Categories ─────────────────────────────────────────────────

async def get_event_types(hours: int = 24) -> list[dict]:
    since = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    body = {
        "size": 0,
        "query": {"range": {"@timestamp": {"gte": since}}},
        "aggs": {
            "groups": {
                "terms": {"field": "rule.groups", "size": 30},
                "aggs": {
                    "max_level": {"max": {"field": "rule.level"}}
                }
            }
        }
    }
    resp = await _search(body)
    buckets = resp.get("aggregations", {}).get("groups", {}).get("buckets", [])
    return [
        {
            "category": b["key"],
            "count": b["doc_count"],
            "max_level": int(b.get("max_level", {}).get("value") or 0),
        }
        for b in buckets
    ]


# ── MITRE ATT&CK Coverage ───────────────────────────────────────────────────

async def get_mitre_coverage(hours: int = 168) -> list[dict]:
    """Return MITRE techniques with counts (default last 7 days)."""
    since = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    body = {
        "size": 0,
        "query": {
            "bool": {
                "must": [
                    {"range": {"@timestamp": {"gte": since}}},
                    {"exists": {"field": "rule.mitre.technique"}}
                ]
            }
        },
        "aggs": {
            "techniques": {
                "terms": {"field": "rule.mitre.technique", "size": 50},
                "aggs": {
                    "tactic": {"terms": {"field": "rule.mitre.tactic", "size": 1}},
                    "technique_id": {"terms": {"field": "rule.mitre.id", "size": 1}},
                    "max_level": {"max": {"field": "rule.level"}},
                    "last_seen": {"max": {"field": "@timestamp"}}
                }
            }
        }
    }
    resp = await _search(body)
    buckets = resp.get("aggregations", {}).get("techniques", {}).get("buckets", [])
    result = []
    for b in buckets:
        tactic_buckets = b.get("tactic", {}).get("buckets", [])
        id_buckets = b.get("technique_id", {}).get("buckets", [])
        result.append({
            "technique": b["key"],
            "technique_id": id_buckets[0]["key"] if id_buckets else "",
            "tactic": tactic_buckets[0]["key"] if tactic_buckets else "unknown",
            "count": b["doc_count"],
            "max_level": int(b.get("max_level", {}).get("value") or 0),
            "last_seen": b.get("last_seen", {}).get("value_as_string", ""),
        })
    return result


# ── Cowrie Events Timeline ───────────────────────────────────────────────────

async def get_cowrie_timeline(hours: int = 24, interval: str = "1h") -> list[dict]:
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
                        {"match": {"data.program": "cowrie"}},
                    ]}}
                ]
            }
        },
        "aggs": {
            "timeline": {
                "date_histogram": {
                    "field": "@timestamp",
                    "fixed_interval": interval,
                    "min_doc_count": 0,
                    "extended_bounds": {"min": since, "max": "now"}
                },
                "aggs": {
                    "event_type": {"terms": {"field": "rule.description", "size": 1}}
                }
            },
            "total_events": {"value_count": {"field": "@timestamp"}},
            "unique_ips": {"cardinality": {"field": "data.srcip"}},
            "event_types": {"terms": {"field": "rule.description", "size": 10}}
        }
    }
    resp = await _search(body)
    if not resp:
        return []

    buckets = resp.get("aggregations", {}).get("timeline", {}).get("buckets", [])
    return [
        {
            "time": b["key_as_string"],
            "count": b["doc_count"],
        }
        for b in buckets
    ]


async def get_cowrie_stats(hours: int = 168) -> dict:
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
                    ]}}
                ],
                "must_not": [
                    {"match": {"data.log_type": "ollama"}},
                    {"match": {"data.integration": "ollama_ai"}}
                ]
            }
        },
        "aggs": {
            "total": {"value_count": {"field": "@timestamp"}},
            "unique_ips": {"cardinality": {"field": "data.srcip"}},
            "event_types": {"terms": {"field": "rule.description", "size": 10}}
        }
    }
    resp = await _search(body)
    aggs = resp.get("aggregations", {})
    types = [
        {"type": b["key"], "count": b["doc_count"]}
        for b in aggs.get("event_types", {}).get("buckets", [])
    ]
    return {
        "total": aggs.get("total", {}).get("value", 0),
        "unique_ips": aggs.get("unique_ips", {}).get("value", 0),
        "event_types": types,
    }


# ── Alert Volume Over Time ───────────────────────────────────────────────────

async def get_alert_volume(hours: int = 24, interval: str = "1h") -> list[dict]:
    since = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    body = {
        "size": 0,
        "query": {"range": {"@timestamp": {"gte": since}}},
        "aggs": {
            "volume": {
                "date_histogram": {
                    "field": "@timestamp",
                    "fixed_interval": interval,
                    "min_doc_count": 0,
                    "extended_bounds": {"min": since, "max": "now"}
                }
            }
        }
    }
    resp = await _search(body)
    buckets = resp.get("aggregations", {}).get("volume", {}).get("buckets", [])
    return [{"time": b["key_as_string"], "count": b["doc_count"]} for b in buckets]


# ── Dashboard Stats ──────────────────────────────────────────────────────────

async def get_dashboard_stats(hours: int = 168) -> dict:
    since = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    body = {
        "size": 0,
        "query": {
            "bool": {
                "must": [{"range": {"@timestamp": {"gte": since}}}],
                "must_not": [
                    {"match": {"data.log_type": "ollama"}},
                    {"match": {"data.integration": "ollama_ai"}}
                ]
            }
        },
        "aggs": {
            "total": {"value_count": {"field": "@timestamp"}},
            "critical": {"filter": {"range": {"rule.level": {"gte": 12}}}},
            "high": {"filter": {"range": {"rule.level": {"gte": 9, "lt": 12}}}},
            "unique_agents": {"cardinality": {"field": "agent.id"}},
            "unique_ips": {"cardinality": {"field": "data.srcip"}}
        }
    }
    resp = await _search(body)
    if not resp:
        return {}
    aggs = resp.get("aggregations", {})
    return {
        "total_alerts_24h": aggs.get("total", {}).get("value", 0),
        "critical_alerts": aggs.get("critical", {}).get("doc_count", 0),
        "high_alerts": aggs.get("high", {}).get("doc_count", 0),
        "unique_agents": aggs.get("unique_agents", {}).get("value", 0),
        "unique_attackers": aggs.get("unique_ips", {}).get("value", 0),
    }


# ── Recent Alerts ─────────────────────────────────────────────────────────────

async def get_recent_alerts(limit: int = 200, hours: int = 168) -> list[dict]:
    since = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    body = {
        "size": limit,
        "sort": [{"@timestamp": {"order": "desc"}}],
        "query": {
            "bool": {
                "must": [{"range": {"@timestamp": {"gte": since}}}],
                "must_not": [
                    {"match": {"data.log_type": "ollama"}},
                    {"match": {"data.integration": "ollama_ai"}}
                ]
            }
        },
        "_source": [
            "@timestamp", "rule.id", "rule.description", "rule.level",
            "rule.groups", "rule.mitre.technique", "rule.mitre.tactic",
            "agent.name", "agent.id", "data.srcip", "full_log"
        ]
    }
    resp = await _search(body)
    hits = resp.get("hits", {}).get("hits", [])
    result = []
    for h in hits:
        src = h.get("_source", {})
        rule = src.get("rule", {})
        agent = src.get("agent", {})
        data = src.get("data", {})
        level = int(rule.get("level", 0))
        if level >= 12:
            severity = "critical"
        elif level >= 9:
            severity = "high"
        elif level >= 6:
            severity = "medium"
        else:
            severity = "low"
        result.append({
            "timestamp": src.get("@timestamp", ""),
            "rule_id": str(rule.get("id", "")),
            "rule_level": level,
            "description": rule.get("description", ""),
            "groups": rule.get("groups", []),
            "mitre_technique": rule.get("mitre", {}).get("technique", []),
            "mitre_tactic": rule.get("mitre", {}).get("tactic", []),
            "agent_name": agent.get("name", "unknown"),
            "agent_id": agent.get("id", ""),
            "source_ip": data.get("srcip", ""),
            "severity": severity,
        })
    return result


async def get_cowrie_sessions(limit: int = 100, hours: int = 168) -> list[dict]:
    """Extrae comandos reales y sesiones de Cowrie."""
    since = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    body = {
        "size": limit,
        "sort": [{"@timestamp": {"order": "desc"}}],
        "query": {
            "bool": {
                "must": [
                    {"range": {"@timestamp": {"gte": since}}},
                    {"match": {"rule.groups": "cowrie"}},
                    {"exists": {"field": "data.input"}}
                ],
                "must_not": [
                    {"match": {"data.log_type": "ollama"}},
                    {"match": {"data.integration": "ollama_ai"}}
                ]
            }
        },
        "_source": ["@timestamp", "data.srcip", "data.session", "data.input", "data.geoip.country_code2"]
    }
    resp = await _search(body)
    hits = resp.get("hits", {}).get("hits", [])
    result = []
    for h in hits:
        src = h.get("_source", {})
        data = src.get("data", {})
        result.append({
            "timestamp": src.get("@timestamp", ""),
            "ip": data.get("srcip", "unknown"),
            "geo": data.get("geoip", {}).get("country_code2", "XX"),
            "session": data.get("session", "unknown"),
            "command": data.get("input", "")
        })
    return result

async def get_mitre_stats(hours: int = 24) -> list[dict]:
    """Agrega alertas por tecnica MITRE para el dashboard."""
    since = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    body = {
        "size": 0,
        "query": {"range": {"@timestamp": {"gte": since}}},
        "aggs": {
            "techniques": {
                "terms": {"field": "rule.mitre.technique", "size": 20},
                "aggs": {
                    "tech_id": {"terms": {"field": "rule.mitre.id", "size": 1}}
                }
            }
        }
    }
    resp = await _search(body)
    buckets = resp.get("aggregations", {}).get("techniques", {}).get("buckets", [])
    result = []
    for b in buckets:
        id_buckets = b.get("tech_id", {}).get("buckets", [])
        tech_id = id_buckets[0]["key"] if id_buckets else "T0000"
        result.append({
            "technique": b["key"],
            "technique_id": tech_id,
            "count": b["doc_count"]
        })
    return result

async def get_honeypot_stats(hours: int = 168) -> dict:
    """Extrae metricas clave de Cowrie (senuelo) para CowrieView."""
    since = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    body = {
        "size": 0,
        "query": {
            "bool": {
                "must": [
                    {"range": {"@timestamp": {"gte": since}}},
                    {
                        "bool": {
                            "should": [
                                {"match": {"rule.groups": "cowrie"}},
                                {"match": {"rule.groups": "honeypot"}},
                                {"match": {"decoder.name": "cowrie"}}
                            ],
                            "minimum_should_match": 1
                        }
                    }
                ],
                "must_not": [
                    {"match": {"data.log_type": "ollama"}},
                    {"match": {"data.integration": "ollama_ai"}}
                ]
            }
        },
        "aggs": {
            "unique_ips": {"cardinality": {"field": "data.srcip"}},
            "top_passwords": {
                "terms": {"field": "data.password", "size": 10}
            }
        }
    }
    resp = await _search(body)
    if not resp:
        return {"total": 0, "unique_ips": 0, "event_types": []}
        
    aggs = resp.get("aggregations", {})
    return {
        "total": resp.get("hits", {}).get("total", {}).get("value", 0),
        "unique_ips": aggs.get("unique_ips", {}).get("value", 0),
        "event_types": [
            {"type": b["key"], "count": b["doc_count"]} 
            for b in aggs.get("top_passwords", {}).get("buckets", [])
        ],
        "top_passwords": [b["key"] for b in aggs.get("top_passwords", {}).get("buckets", [])]
    }

async def get_attack_path(ip: str, hours: int = 24) -> list[dict]:
    """Reconstruye la linea de tiempo de un atacante (Wazuh + Cowrie)."""
    since = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    body = {
        "size": 200,
        "sort": [{"@timestamp": {"order": "asc"}}],
        "query": {
            "bool": {
                "must": [
                    {"range": {"@timestamp": {"gte": since}}},
                    {"match": {"data.srcip": ip}}
                ]
            }
        },
        "_source": ["@timestamp", "rule.description", "data.input", "data.session", "rule.groups"]
    }
    resp = await _search(body)
    hits = resp.get("hits", {}).get("hits", [])
    path = []
    for h in hits:
        src = h.get("_source", {})
        path.append({
            "timestamp": src.get("@timestamp"),
            "event": src.get("rule", {}).get("description") or "Cowrie Action",
            "input": src.get("data", {}).get("input"),
            "session": src.get("data", {}).get("session"),
            "type": "alert" if "cowrie" not in src.get("rule", {}).get("groups", []) else "honeypot"
        })
    return path

async def get_threat_map(hours: int = 24) -> dict:
    """Extrae datos de geolocalizacion de atacantes para el mapa."""
    since = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    COUNTRY_COORDS = {
        "CN": [35.8617, 104.1954], "RU": [61.5240, 105.3188], "US": [37.0902, -95.7129],
        "IR": [32.4279, 53.6880], "KP": [40.3399, 127.5101], "ES": [40.4637, -3.7492],
        "NL": [52.1326, 5.2913], "DE": [51.1657, 10.4515], "UA": [48.3794, 31.1656],
        "BR": [-14.2350, -51.9253], "JP": [36.2048, 138.2529], "AU": [-25.2744, 133.7751],
        "GB": [55.3781, -3.4360], "MX": [23.6345, -102.5528], "CA": [56.1304, -106.3468]
    }
    body = {
        "size": 0,
        "query": {
            "bool": {
                "must": [
                    {"range": {"@timestamp": {"gte": since}}},
                    {"exists": {"field": "data.srcip"}}
                ]
            }
        },
        "aggs": {
            "top_ips": {
                "terms": {"field": "data.srcip", "size": 100},
                "aggs": {
                    "last_info": {
                        "top_hits": {
                            "size": 1,
                            "sort": [{"@timestamp": "desc"}],
                            "_source": ["data.srcip", "data.geoip", "rule.groups"]
                        }
                    }
                }
            },
            "countries": {
                "terms": {"field": "data.geoip.country_code2", "size": 20}
            }
        }
    }
    resp = await _search(body)
    if not resp:
        return {"attacks": [], "countries": [], "total_attacks": 0}

    buckets = resp.get("aggregations", {}).get("top_ips", {}).get("buckets", [])
    attacks = []
    for b in buckets:
        hits = b.get("last_info", {}).get("hits", {}).get("hits", [])
        if not hits: continue
        source = hits[0]["_source"]
        data = source.get("data", {})
        geo = data.get("geoip", {})
        
        try:
            lat = float(geo.get("latitude", 0))
            lon = float(geo.get("longitude", 0))
        except:
            lat, lon = 0, 0

        if lat == 0 and lon == 0:
            c_code = geo.get("country_code2", "XX")
            if c_code in COUNTRY_COORDS:
                lat, lon = COUNTRY_COORDS[c_code]

        attacks.append({
            "ip": b["key"],
            "country": geo.get("country_name", "Unknown"),
            "country_code": geo.get("country_code2", "XX"),
            "city": geo.get("city_name", "Unknown"),
            "isp": geo.get("isp", "Unknown Provider"),
            "as": geo.get("as_owner", ""),
            "lat": lat,
            "lon": lon,
            "count": b["doc_count"],
            "is_honeypot": "cowrie" in source.get("rule", {}).get("groups", [])
        })

    country_buckets = resp.get("aggregations", {}).get("countries", {}).get("buckets", [])
    countries = [{"country": b["key"], "count": b["doc_count"]} for b in country_buckets]
    total_attacks = sum(c["count"] for c in countries)

    return {
        "attacks": attacks,
        "countries": countries,
        "total_attacks": total_attacks
    }
