"""Honeypot Cowrie: resumen, línea de tiempo, sesiones agrupadas y eventos de una sesión.

Sustituye a las estadísticas antiguas, que mezclaban ~14.500 alertas del bucle de la IA
("Ollama AI Insight…", grupo ai_analysis) con los eventos reales de Cowrie y agrupaban
por descripción completa (con la IP dentro).
"""
from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import Any

from app import opensearch_client as osc
from app import report_builder as rb

COWRIE = [{"term": {"rule.groups": "cowrie"}}]
SESSION_RE = re.compile(r"^[a-f0-9]{8,32}$")


def _window(hours: int) -> tuple[datetime, datetime]:
    end = datetime.now(timezone.utc)
    return end - timedelta(hours=hours), end


def _b(aggs: dict, name: str) -> list[dict]:
    return aggs.get(name, {}).get("buckets", [])


async def overview(hours: int) -> dict[str, Any]:
    start, end = _window(hours)
    summary = await rb._honeypot_section(start, end)
    interval = "1h" if hours <= 48 else "6h"
    resp = await osc._search({
        "size": 0,
        "query": rb._period_query(start, end, COWRIE),
        "aggs": {
            "timeline": {"date_histogram": {"field": "@timestamp", "fixed_interval": interval, "min_doc_count": 0,
                                            "extended_bounds": {"min": start.isoformat(), "max": end.isoformat()}},
                         "aggs": {"failed": {"filter": {"term": {"data.eventid": "cowrie.login.failed"}}},
                                  "success": {"filter": {"term": {"data.eventid": "cowrie.login.success"}}}}},
            "attackers": {"terms": {"field": "data.src_ip", "size": 10},
                          "aggs": {"last": {"max": {"field": "@timestamp"}},
                                   "success": {"filter": {"term": {"data.eventid": "cowrie.login.success"}}},
                                   "sessions": {"cardinality": {"field": "data.session"}}}},
            "clients": {"terms": {"field": "data.version", "size": 5}},
        },
    })
    aggs = resp.get("aggregations", {})
    return {
        "hours": hours, "interval": interval, "summary": summary,
        "timeline": [{"t": b["key_as_string"], "events": b["doc_count"], "failed": b["failed"]["doc_count"],
                      "success": b["success"]["doc_count"]} for b in _b(aggs, "timeline")],
        "attackers": [{"ip": b["key"], "events": b["doc_count"], "sessions": b["sessions"]["value"],
                       "success": b["success"]["doc_count"], "last": b["last"].get("value_as_string")} for b in _b(aggs, "attackers")],
        "clients": [{"value": b["key"], "count": b["doc_count"]} for b in _b(aggs, "clients")],
    }


async def sessions(hours: int, limit: int = 40) -> list[dict[str, Any]]:
    start, end = _window(hours)
    resp = await osc._search({
        "size": 0,
        "query": rb._period_query(start, end, COWRIE),
        "aggs": {"s": {"terms": {"field": "data.session", "size": limit, "order": {"last": "desc"}},
                       "aggs": {"first": {"min": {"field": "@timestamp"}}, "last": {"max": {"field": "@timestamp"}},
                                "ip": {"terms": {"field": "data.src_ip", "size": 1}},
                                "failed": {"filter": {"term": {"data.eventid": "cowrie.login.failed"}}},
                                "success": {"filter": {"term": {"data.eventid": "cowrie.login.success"}}},
                                "cmds": {"filter": {"term": {"data.eventid": "cowrie.command.input"}}},
                                "user": {"terms": {"field": "data.username", "size": 3}}}}},
    })
    out = []
    for b in _b(resp.get("aggregations", {}), "s"):
        first, last = b["first"].get("value"), b["last"].get("value")
        out.append({
            "session": b["key"], "events": b["doc_count"],
            "ip": (_b(b, "ip") or [{"key": ""}])[0]["key"],
            "start": b["first"].get("value_as_string"), "end": b["last"].get("value_as_string"),
            "duration_s": round((last - first) / 1000, 1) if first and last else 0,
            "failed": b["failed"]["doc_count"], "success": b["success"]["doc_count"], "commands": b["cmds"]["doc_count"],
            "users": [u["key"] for u in _b(b, "user")],
        })
    return out


async def session_events(session: str) -> list[dict[str, Any]]:
    if not SESSION_RE.match(session or ""):
        return []
    resp = await osc._search({
        "size": 200, "sort": [{"@timestamp": {"order": "asc"}}],
        "query": {"bool": {"filter": [{"term": {"data.session": session}}, *COWRIE],
                           "must_not": [{"term": {"rule.groups": "ai_analysis"}}]}},
        "_source": ["@timestamp", "data.eventid", "data.input", "data.username", "data.password", "data.src_ip",
                    "data.version", "data.url", "data.duration", "rule.id", "rule.level", "rule.description"],
    })
    out = []
    for h in resp.get("hits", {}).get("hits", []):
        s = h.get("_source", {}); d = s.get("data", {}); r = s.get("rule", {})
        ev = d.get("eventid", "")
        detail = (d.get("input") if ev == "cowrie.command.input"
                  else f"{d.get('username', '')} / {d.get('password', '')}" if ev.startswith("cowrie.login")
                  else d.get("version") or d.get("url") or (f"{d.get('duration')} s" if d.get("duration") else "") or r.get("description", ""))
        out.append({"t": s.get("@timestamp"), "event": ev, "detail": detail, "rule": r.get("id"), "level": r.get("level")})
    return out
