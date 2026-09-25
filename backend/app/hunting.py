"""hunting.py — Threat Hunting: consultas guardadas sobre OpenSearch (Fase 4).

Búsqueda PROACTIVA (no reactiva): el analista L3 lanza cazas predefinidas sobre
los datos de Wazuh/Cowrie en vez de esperar alertas.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from app import opensearch_client as osc


def _since(hours: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()


# id -> metadatos + constructor de body + ruta de agregación a los buckets
HUNT_QUERIES: dict[str, dict[str, Any]] = {
    "top_attacker_ips": {
        "name": "IPs atacantes más activas",
        "description": "Top de IPs origen por volumen de eventos.",
        "field": "data.src_ip",
    },
    "repeated_offenders": {
        "name": "Reincidentes (beaconing/persistencia)",
        "description": "IPs con muchas sesiones repetidas — posible bot o C2.",
        "field": "data.src_ip",
        "min_doc_count": 10,
    },
    "top_commands": {
        "name": "Comandos más ejecutados en el honeypot",
        "description": "Comandos que los atacantes intentan ejecutar (recon/malware).",
        "field": "data.input",
    },
    "top_credentials": {
        "name": "Usuarios más probados (credential stuffing)",
        "description": "Nombres de usuario más usados en intentos de login.",
        "field": "data.username",
    },
    "valid_credentials": {
        "name": "Credenciales que funcionaron",
        "description": "Usuarios con login aceptado: las contraseñas que el atacante ya conoce (T1078).",
        "field": "data.username",
        "eventid": "cowrie.login.success",
    },
    "ssh_clients": {
        "name": "Clientes SSH de los atacantes",
        "description": "Versión del cliente: identifica herramientas automáticas (libssh, paramiko, Go…).",
        "field": "data.version",
    },
    "malware_downloads": {
        "name": "Descargas de malware (wget/curl/tftp)",
        "description": "Comandos de transferencia de herramientas (T1105).",
        "match": "wget|curl|tftp|scp|fetch",
    },
}


def list_queries() -> list[dict[str, str]]:
    return [{"id": k, "name": v["name"], "description": v["description"]} for k, v in HUNT_QUERIES.items()]


async def run_query(query_id: str, hours: int = 168, limit: int = 20) -> dict[str, Any]:
    spec = HUNT_QUERIES.get(query_id)
    if not spec:
        return {"error": "consulta no encontrada", "query_id": query_id}

    base_must = [{"range": {"@timestamp": {"gte": _since(hours)}}}, osc._cowrie_query_clause()]
    if spec.get("eventid"):
        base_must.append({"term": {"data.eventid": spec["eventid"]}})
    # Excluye las alertas del bucle antiguo de la IA (llevan el grupo cowrie pero no son ataques)
    not_ai = [{"term": {"rule.groups": "ai_analysis"}}]

    # Caza por coincidencia de comando (malware): devuelve documentos recientes
    if "match" in spec:
        body = {
            "size": limit,
            "query": {"bool": {"must": base_must, "must_not": not_ai,
                               "filter": [{"regexp": {"data.input": f".*({spec['match']}).*"}}]}},
            "sort": [{"@timestamp": {"order": "desc"}}],
            "_source": ["@timestamp", "data.src_ip", "data.input", "rule.description"],
        }
        resp = await osc._search(body)
        hits = resp.get("hits", {}).get("hits", [])
        results = [
            {
                "timestamp": h.get("_source", {}).get("@timestamp", ""),
                "src_ip": (h.get("_source", {}).get("data", {}) or {}).get("src_ip", ""),
                "command": (h.get("_source", {}).get("data", {}) or {}).get("input", ""),
            }
            for h in hits
        ]
        return {"query_id": query_id, "name": spec["name"], "type": "documents", "count": len(results), "results": results}

    # Caza por agregación de términos (top-N)
    field = spec["field"]
    # Sin cubo "unknown" (eventos sin el campo): dominaba todas las listas y no aporta
    terms_agg: dict[str, Any] = {"field": field, "size": limit}
    if field in ("data.username", "data.password"):
        # Cabeceras de protocolo (p. ej. SIP de nmap) que Cowrie registra como usuario: no son credenciales
        from app.report_builder import _PROTO_NOISE
        terms_agg["exclude"] = _PROTO_NOISE
    if "min_doc_count" in spec:
        terms_agg["min_doc_count"] = spec["min_doc_count"]
    body = {"size": 0, "query": {"bool": {"must": base_must, "must_not": not_ai}}, "aggs": {"hunt": {"terms": terms_agg}}}
    resp = await osc._search(body)
    buckets = resp.get("aggregations", {}).get("hunt", {}).get("buckets", [])
    results = [{"value": b["key"], "count": b["doc_count"]} for b in buckets]
    return {"query_id": query_id, "name": spec["name"], "type": "aggregation", "count": len(results), "results": results}
