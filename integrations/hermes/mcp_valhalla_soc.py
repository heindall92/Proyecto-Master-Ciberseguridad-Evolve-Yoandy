#!/usr/bin/env python3
"""
Servidor MCP stdio para Hermes Agent → Valhalla SOC API.

Uso (desde Hermes config.yaml):
  mcp_servers:
    valhalla_soc:
      command: python
      args: ["E:/ruta/Valhalla-SOC/integrations/hermes/mcp_valhalla_soc.py"]
      env:
        VALHALLA_API_URL: "http://localhost:8000"
        VALHALLA_USERNAME: "admin"
        VALHALLA_PASSWORD: "tu-password"

Variables de entorno:
  VALHALLA_API_URL      Base del backend (default http://localhost:8000)
  VALHALLA_USERNAME     Usuario SOC (login cookie)
  VALHALLA_PASSWORD     Contraseña
"""
from __future__ import annotations

import json
import os
import sys
from typing import Any

import httpx

try:
    from mcp.server.fastmcp import FastMCP
except ImportError:
    print(
        "Instale dependencias: pip install -r integrations/hermes/requirements-mcp.txt",
        file=sys.stderr,
    )
    raise

mcp = FastMCP("valhalla-soc")

_session: httpx.AsyncClient | None = None
_logged_in = False


def _base_url() -> str:
    return os.getenv("VALHALLA_API_URL", "http://localhost:8000").rstrip("/")


async def _client() -> httpx.AsyncClient:
    global _session, _logged_in
    if _session is None or _session.is_closed:
        _session = httpx.AsyncClient(
            base_url=_base_url(),
            timeout=httpx.Timeout(30.0),
            follow_redirects=True,
        )
        _logged_in = False

    if not _logged_in:
        user = os.getenv("VALHALLA_USERNAME", "admin")
        password = os.getenv("VALHALLA_PASSWORD", "")
        if not password:
            raise RuntimeError(
                "Defina VALHALLA_PASSWORD para que Hermes pueda autenticarse en Valhalla SOC"
            )
        r = await _session.post(
            "/api/auth/login",
            json={"username": user, "password": password},
        )
        r.raise_for_status()
        _logged_in = True
    return _session


async def _get(path: str, params: dict[str, Any] | None = None) -> Any:
    c = await _client()
    r = await c.get(path, params=params or {})
    r.raise_for_status()
    return r.json()


def _json(data: Any) -> str:
    return json.dumps(data, ensure_ascii=False, indent=2, default=str)


@mcp.tool()
async def valhalla_health() -> str:
    """Comprueba que el backend Valhalla SOC responde."""
    c = await _client()
    r = await c.get("/health")
    r.raise_for_status()
    return _json(r.json())


@mcp.tool()
async def valhalla_dashboard(hours: int = 24) -> str:
    """Resumen del dashboard: alertas, tickets abiertos, métricas Wazuh."""
    return _json(await _get("/api/dashboard", {"hours": hours}))


@mcp.tool()
async def valhalla_recent_alerts(limit: int = 20, hours: int = 24) -> str:
    """Alertas recientes de Wazuh/OpenSearch (severidad, regla, IP, agente)."""
    return _json(await _get("/api/wazuh/recent-alerts", {"limit": limit, "hours": hours}))


@mcp.tool()
async def valhalla_top_attackers(limit: int = 10, hours: int = 24) -> str:
    """Top IPs atacantes por volumen de alertas."""
    return _json(await _get("/api/wazuh/top-attackers", {"limit": limit, "hours": hours}))


@mcp.tool()
async def valhalla_cowrie_stats(hours: int = 24) -> str:
    """Estadísticas del honeypot Cowrie (eventos, IPs únicas, tipos)."""
    return _json(await _get("/api/wazuh/cowrie-stats", {"hours": hours}))


@mcp.tool()
async def valhalla_cowrie_sessions(limit: int = 30, hours: int = 24) -> str:
    """Sesiones/comandos recientes capturados en Cowrie (TTY feed)."""
    return _json(await _get("/api/wazuh/cowrie-sessions", {"limit": limit, "hours": hours}))


@mcp.tool()
async def valhalla_wazuh_services() -> str:
    """Estado del stack: manager, indexer, Cowrie, simulador atacante."""
    return _json(await _get("/api/wazuh/services"))


@mcp.tool()
async def valhalla_list_tickets(active_only: bool = True, limit: int = 25) -> str:
    """Lista tickets de incidentes (activos por defecto)."""
    params: dict[str, Any] = {"limit": limit, "offset": 0}
    if active_only:
        params["active_only"] = "true"
    return _json(await _get("/api/tickets", params))


@mcp.tool()
async def valhalla_open_tickets_count() -> str:
    """Número de tickets abiertos/en curso."""
    return _json(await _get("/api/tickets/count/open"))


@mcp.tool()
async def valhalla_mitre_coverage(hours: int = 168) -> str:
    """Cobertura MITRE ATT&CK según alertas indexadas."""
    return _json(await _get("/api/wazuh/mitre", {"hours": hours}))


@mcp.tool()
async def valhalla_threat_map(hours: int = 24) -> str:
    """Mapa de amenazas geolocalizado (ataques / honeypot)."""
    return _json(await _get("/api/threat-map", {"hours": hours}))


if __name__ == "__main__":
    mcp.run()
