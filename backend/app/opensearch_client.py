"""
opensearch_client.py — Direct OpenSearch queries against Wazuh Indexer.
Provides all analytics: top attackers, MITRE coverage, alert levels,
event types, Cowrie timeline, and alert volume over time.
"""
from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

from app.settings import settings
from app.http_tls import httpx_verify

logger = logging.getLogger("valhalla.opensearch")

INDEX = "wazuh-alerts-*"
COWRIE_INDEX = "wazuh-alerts-*"

_COWRIE_IP_IN_DESC = re.compile(r"from (\d{1,3}(?:\.\d{1,3}){3})")


def _cowrie_query_clause() -> dict[str, Any]:
    """Filtro fiable para alertas Cowrie en Wazuh Indexer."""
    return {
        "bool": {
            "should": [
                {"term": {"rule.groups": "cowrie"}},
                {"wildcard": {"rule.description": "Cowrie:*"}},
                {"term": {"data.log_type": "cowrie"}},
            ],
            "minimum_should_match": 1,
        }
    }


def _cowrie_src_ip(data: dict[str, Any], rule_desc: str = "") -> str:
    ip = (data.get("src_ip") or data.get("srcip") or "").strip()
    if ip:
        return ip
    if rule_desc:
        m = _COWRIE_IP_IN_DESC.search(rule_desc)
        if m:
            return m.group(1)
    return "unknown"


def _cowrie_session_id(data: dict[str, Any]) -> str:
    return str(data.get("session") or data.get("session_id") or "unknown")


def _cowrie_command_text(data: dict[str, Any], rule_desc: str = "") -> str:
    cmd = (data.get("input") or data.get("command") or "").strip()
    if cmd:
        return cmd
    if data.get("username"):
        pwd = data.get("password", "***")
        return f"login attempt: {data.get('username')}/{pwd}"
    if rule_desc:
        return rule_desc
    return "session event"


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        base_url=settings.opensearch_url,
        auth=(settings.opensearch_user, settings.opensearch_pass),
        verify=httpx_verify(),
        timeout=15.0,
    )


def _alerts_since(since: str) -> dict[str, Any]:
    """Alertas desde `since`, excluyendo los comentarios de la integración de IA
    (regla 100200, grupo ai_analysis): acompañan a una alerta, no son alertas nuevas."""
    return {
        "bool": {
            "filter": [{"range": {"@timestamp": {"gte": since}}}],
            "must_not": [{"term": {"rule.groups": "ai_analysis"}}],
        }
    }


_NO_IP = {"", "n/a", "unknown", "desconocida", "-", "none"}


async def _search(body: dict[str, Any]) -> dict[str, Any]:
    try:
        async with _client() as c:
            r = await c.post(f"/{INDEX}/_search", json=body)
            r.raise_for_status()
            data = r.json()
            # Un fallo parcial (p. ej. regex inválida en un índice) devuelve 200 con menos datos: avisarlo
            failed = data.get("_shards", {}).get("failed", 0)
            if failed:
                reasons = [f.get("reason", {}).get("reason") for f in data["_shards"].get("failures", [])][:2]
                logger.warning("OpenSearch: %s shards fallaron (%s)", failed, reasons)
            return data
    except Exception as e:
        logger.warning("OpenSearch query failed: %s", e)
        return {}


# ── Retención de alertas (ISM) ───────────────────────────────────────────────

RETENTION_POLICY_ID = "valhalla-alerts-retention"


async def apply_retention_policy(days: int) -> dict[str, Any]:
    """Crea/actualiza la política ISM que borra los índices wazuh-alerts-* con más de
    `days` días y la aplica a los índices existentes. Limita la conservación de datos
    (incluidas IP de terceros) al plazo configurado en Ajustes."""
    policy = {
        "policy": {
            "description": f"Valhalla SOC: conservar alertas {days} días",
            "default_state": "hot",
            "states": [
                {"name": "hot", "actions": [],
                 "transitions": [{"state_name": "delete", "conditions": {"min_index_age": f"{days}d"}}]},
                {"name": "delete", "actions": [{"delete": {}}], "transitions": []},
            ],
            "ism_template": [{"index_patterns": ["wazuh-alerts-*"], "priority": 100}],
        }
    }
    async with _client() as c:
        url = f"/_plugins/_ism/policies/{RETENTION_POLICY_ID}"
        current = await c.get(url)
        if current.status_code == 200:
            meta = current.json()
            r = await c.put(url, params={"if_seq_no": meta["_seq_no"], "if_primary_term": meta["_primary_term"]}, json=policy)
        else:
            r = await c.put(url, json=policy)
        r.raise_for_status()
        # Índices ya existentes: asignar la política (los que ya la tienen se ignoran)
        add = await c.post(f"/_plugins/_ism/add/{INDEX}", json={"policy_id": RETENTION_POLICY_ID})
        applied = add.json() if add.status_code == 200 else {}
        # Si ya tenían la política, actualizar a la nueva versión
        await c.post(f"/_plugins/_ism/change_policy/{INDEX}", json={"policy_id": RETENTION_POLICY_ID})
    return {"days": days, "updated_indices": applied.get("updated_indices", 0)}


# ── Top 20 Attackers ────────────────────────────────────────────────────────

async def get_top_attackers(limit: int = 20, hours: int = 24) -> list[dict]:
    since = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    sub_aggs = {
        "last_seen": {"max": {"field": "@timestamp"}},
        "attack_type": {"terms": {"field": "rule.description", "size": 1}},
    }
    # Wazuh guarda la IP origen en data.srcip y Cowrie en data.src_ip: se agregan ambos.
    body = {
        "size": 0,
        "query": _alerts_since(since),
        "aggs": {
            "by_srcip": {"terms": {"field": "data.srcip", "size": limit}, "aggs": sub_aggs},
            "by_src_ip": {"terms": {"field": "data.src_ip", "size": limit}, "aggs": sub_aggs},
        },
    }
    resp = await _search(body)
    aggs = resp.get("aggregations", {})
    merged: dict[str, dict] = {}
    for name in ("by_srcip", "by_src_ip"):
        for b in aggs.get(name, {}).get("buckets", []):
            if str(b["key"]).strip().lower() in _NO_IP:
                continue
            top_desc = b.get("attack_type", {}).get("buckets", [])
            last = b.get("last_seen", {}).get("value_as_string", "")
            entry = merged.setdefault(b["key"], {"ip": b["key"], "count": 0, "last_seen": "", "attack_type": "Generic Attack"})
            entry["count"] += b["doc_count"]
            if last > entry["last_seen"]:
                entry["last_seen"] = last
                if top_desc:
                    entry["attack_type"] = top_desc[0]["key"]
    return sorted(merged.values(), key=lambda e: e["count"], reverse=True)[:limit]


# ── Alert Levels Distribution ────────────────────────────────────────────────

async def get_alert_levels(hours: int = 24) -> list[dict]:
    since = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    body = {
        "size": 0,
        "query": _alerts_since(since),
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
        "query": _alerts_since(since),
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
                    _cowrie_query_clause(),
                ]
            }
        },
        "aggs": {
            "timeline": {
                "date_histogram": {
                    "field": "@timestamp",
                    "calendar_interval": interval,
                    "min_doc_count": 0,
                    "extended_bounds": {"min": since, "max": "now"}
                },
                "aggs": {
                    "event_type": {"terms": {"field": "rule.description", "size": 1}}
                }
            },
            "total_events": {"value_count": {"field": "@timestamp"}},
            "unique_ips": {"cardinality": {"field": "data.src_ip"}},
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


async def get_cowrie_stats(hours: int = 24) -> dict:
    since = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    body = {
        "size": 0,
        "query": {
            "bool": {
                "must": [
                    {"range": {"@timestamp": {"gte": since}}},
                    _cowrie_query_clause(),
                ]
            }
        },
        "aggs": {
            "total": {"value_count": {"field": "@timestamp"}},
            "unique_ips": {"cardinality": {"field": "data.src_ip"}},
            "unique_ips_legacy": {"cardinality": {"field": "data.srcip"}},
            "event_types": {"terms": {"field": "rule.description", "size": 10}}
        }
    }
    resp = await _search(body)
    aggs = resp.get("aggregations", {})
    types = [
        {"type": b["key"], "count": b["doc_count"]}
        for b in aggs.get("event_types", {}).get("buckets", [])
    ]
    uniq = max(
        aggs.get("unique_ips", {}).get("value", 0) or 0,
        aggs.get("unique_ips_legacy", {}).get("value", 0) or 0,
    )
    return {
        "total": aggs.get("total", {}).get("value", 0),
        "unique_ips": uniq,
        "event_types": types,
    }


# ── Alert Volume Over Time ───────────────────────────────────────────────────

async def get_alert_volume(hours: int = 24, interval: str = "1h") -> list[dict]:
    since = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    body = {
        "size": 0,
        "query": _alerts_since(since),
        "aggs": {
            "volume": {
                "date_histogram": {
                    "field": "@timestamp",
                    "calendar_interval": interval,
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

async def get_dashboard_stats(hours: int = 24) -> dict:
    since = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    body = {
        "size": 0,
        "query": _alerts_since(since),
        "aggs": {
            "total": {"value_count": {"field": "@timestamp"}},
            "critical": {"filter": {"range": {"rule.level": {"gte": 12}}}},
            "high": {"filter": {"range": {"rule.level": {"gte": 9, "lt": 12}}}},
            "unique_agents": {"cardinality": {"field": "agent.id"}},
            "unique_ips": {"cardinality": {"field": "data.srcip"}},
        }
    }
    resp = await _search(body)
    aggs = resp.get("aggregations", {})
    return {
        "total_alerts_24h": aggs.get("total", {}).get("value", 0),
        "critical_alerts": aggs.get("critical", {}).get("doc_count", 0),
        "high_alerts": aggs.get("high", {}).get("doc_count", 0),
        "unique_agents": aggs.get("unique_agents", {}).get("value", 0),
        "unique_attackers": aggs.get("unique_ips", {}).get("value", 0),
    }


# ── Recent Alerts ─────────────────────────────────────────────────────────────

async def get_recent_alerts(limit: int = 100, hours: int = 24) -> list[dict]:
    since = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    body = {
        "size": limit,
        "sort": [{"@timestamp": {"order": "desc"}}],
        "query": _alerts_since(since),
        "_source": [
            "@timestamp", "rule.id", "rule.description", "rule.level",
            "rule.groups", "rule.mitre.technique", "rule.mitre.tactic", "rule.mitre.id",
            "agent.name", "agent.id", "data", "full_log", "location", "decoder.name"
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
        src_ip = _cowrie_src_ip(data, rule.get("description", ""))
        result.append({
            "id": h.get("_id", ""),
            "timestamp": src.get("@timestamp", ""),
            "rule_id": str(rule.get("id", "")),
            "rule_level": level,
            "description": rule.get("description", ""),
            "groups": rule.get("groups", []),
            "mitre_technique": rule.get("mitre", {}).get("technique", []),
            "mitre_tactic": rule.get("mitre", {}).get("tactic", []),
            "mitre_id": rule.get("mitre", {}).get("id", []),
            "full_log": (src.get("full_log") or "")[:4000],
            "location": src.get("location", ""),
            "decoder": (src.get("decoder") or {}).get("name", ""),
            # Campos decodificados (evento original) para el visor forense del SIEM
            "data": data,
            "agent_name": agent.get("name", "unknown"),
            "agent_id": agent.get("id", ""),
            # Wazuh usa data.srcip; Cowrie data.src_ip
            "source_ip": "" if src_ip == "unknown" else src_ip,
            "severity": severity,
        })
    return result

async def get_cowrie_sessions(limit: int = 100, hours: int = 24) -> list[dict]:
    """Extrae comandos y sesiones Cowrie (comandos, logins, conexiones)."""
    since = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    body = {
        "size": limit,
        "sort": [{"@timestamp": {"order": "desc"}}],
        "query": {
            "bool": {
                "must": [
                    {"range": {"@timestamp": {"gte": since}}},
                    _cowrie_query_clause(),
                ]
            }
        },
        "_source": [
            "@timestamp", "data.src_ip", "data.srcip", "data.session", "data.input",
            "data.username", "data.password", "data.eventid", "rule.description",
            "data.geoip.country_code2",
        ]
    }
    resp = await _search(body)
    hits = resp.get("hits", {}).get("hits", [])
    result = []
    for h in hits:
        src = h.get("_source", {})
        data = src.get("data", {})
        rule_desc = src.get("rule", {}).get("description", "")
        result.append({
            "timestamp": src.get("@timestamp", ""),
            "ip": _cowrie_src_ip(data, rule_desc),
            "geo": data.get("geoip", {}).get("country_code2", "XX"),
            "session": _cowrie_session_id(data),
            "command": _cowrie_command_text(data, rule_desc),
            "eventid": data.get("eventid", ""),
        })
    return result


async def get_lsa_security_alerts(hours: int = 24, limit: int = 50) -> list[dict]:
    """Alertas Wazuh relacionadas con LSA, credenciales o dumping."""
    since = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    body = {
        "size": limit,
        "sort": [{"@timestamp": {"order": "desc"}}],
        "query": {
            "bool": {
                "must": [{"range": {"@timestamp": {"gte": since}}}],
                "should": [
                    {"wildcard": {"rule.description": "*lsass*"}},
                    {"wildcard": {"rule.description": "*mimikatz*"}},
                    {"wildcard": {"rule.description": "*credential*"}},
                    {"wildcard": {"rule.description": "*Sysmon*"}},
                    {"match": {"rule.groups": "windows"}},
                ],
                "minimum_should_match": 1,
            }
        },
        "_source": ["@timestamp", "rule.description", "rule.level", "agent.name", "data.srcip"],
    }
    resp = await _search(body)
    hits = resp.get("hits", {}).get("hits", [])
    out = []
    for i, h in enumerate(hits):
        src = h.get("_source", {})
        rule = src.get("rule", {})
        level = int(rule.get("level", 0))
        sev = "critical" if level >= 12 else "high" if level >= 9 else "medium"
        desc = (rule.get("description") or "").lower()
        alert_type = "lsass_access"
        if "mimikatz" in desc:
            alert_type = "mimikatz"
        elif "credential" in desc:
            alert_type = "credential_dump"
        elif "sysmon" in desc:
            alert_type = "sysmon_id10"
        out.append({
            "id": i + 1,
            "timestamp": src.get("@timestamp", ""),
            "type": alert_type,
            "source_ip": src.get("data", {}).get("srcip", ""),
            "hostname": src.get("agent", {}).get("name", "unknown"),
            "severity": sev,
            "blocked": False,
            "target_process": "lsass.exe" if "lsass" in desc else "N/A",
            "source_process": rule.get("description", ""),
        })
    return out

async def get_mitre_stats(hours: int = 24) -> list[dict]:
    """Agrega alertas por tactica MITRE."""
    since = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    body = {
        "size": 0,
        "query": _alerts_since(since),
        "aggs": {
            "tactics": {
                "terms": {"field": "rule.mitre.tactic.keyword", "size": 10}
            }
        }
    }
    resp = await _search(body)
    buckets = resp.get("aggregations", {}).get("tactics", {}).get("buckets", [])
    return [{"tactic": b["key"], "count": b["doc_count"]} for b in buckets]

async def get_honeypot_stats(hours: int = 24) -> dict:
    """Extrae metricas clave de Cowrie (senuelo)."""
    since = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    body = {
        "size": 0,
        "query": {
            "bool": {
                "must": [
                    {"range": {"@timestamp": {"gte": since}}},
                    _cowrie_query_clause(),
                ]
            }
        },
        "aggs": {
            "unique_ips": {"cardinality": {"field": "data.src_ip"}},
            "top_passwords": {
                "terms": {"field": "data.password.keyword", "size": 5}
            }
        }
    }
    resp = await _search(body)
    aggs = resp.get("aggregations", {})
    return {
        "unique_attackers": aggs.get("unique_ips", {}).get("value", 0),
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
                    {"bool": {"should": [
                        # Ambos campos están mapeados como keyword (sin subcampo .keyword)
                        {"term": {"data.src_ip": ip}},
                        {"term": {"data.srcip": ip}},
                    ], "minimum_should_match": 1}}
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


# ── Vulnerabilidades (Wazuh 4.8+: índice de estados) ─────────────────────────
VULN_INDEX = "wazuh-states-vulnerabilities-*"


async def _vuln_search(body: dict[str, Any]) -> dict[str, Any]:
    try:
        async with _client() as c:
            r = await c.post(f"/{VULN_INDEX}/_search", json=body)
            if r.status_code == 404:
                return {}
            r.raise_for_status()
            return r.json()
    except Exception as e:
        logger.warning("Vulnerability index query failed: %s", e)
        return {}


async def get_agent_vulnerabilities(agent_id: str, limit: int = 200) -> list[dict[str, Any]]:
    resp = await _vuln_search({
        "size": limit,
        "query": {"term": {"agent.id": agent_id}},
        "sort": [{"vulnerability.score.base": {"order": "desc", "unmapped_type": "float"}}],
    })
    out = []
    for h in resp.get("hits", {}).get("hits", []):
        s = h.get("_source", {})
        v, p = s.get("vulnerability", {}), s.get("package", {})
        out.append({
            "cve": v.get("id", ""), "severity": (v.get("severity") or "").lower(),
            "score": (v.get("score") or {}).get("base"), "description": (v.get("description") or "")[:400],
            "reference": (v.get("reference") or "").split(",")[0].strip(), "detected_at": v.get("detected_at", ""),
            "published_at": v.get("published_at", ""), "package": p.get("name", ""), "version": p.get("version", ""),
            "under_evaluation": bool(v.get("under_evaluation")),
        })
    return out


async def get_vulnerability_summary() -> dict[str, dict[str, int]]:
    """Recuento por agente y severidad (para la tabla de activos)."""
    resp = await _vuln_search({"size": 0, "aggs": {"agents": {"terms": {"field": "agent.id", "size": 500},
                               "aggs": {"sev": {"terms": {"field": "vulnerability.severity", "size": 10}}}}}})
    out: dict[str, dict[str, int]] = {}
    for b in resp.get("aggregations", {}).get("agents", {}).get("buckets", []):
        out[b["key"]] = {s["key"].lower(): s["doc_count"] for s in b.get("sev", {}).get("buckets", [])}
        out[b["key"]]["total"] = b["doc_count"]
    return out
