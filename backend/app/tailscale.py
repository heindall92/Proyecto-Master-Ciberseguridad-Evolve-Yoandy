"""Tailscale: identidad de quien se conecta por la VPN e invitaciones de acceso.

- whois(ip): cuenta y dispositivo de Tailscale dueños de una IP 100.x (vía el contenedor
  ts-whois, el único con acceso al socket de tailscaled). Sirve para mostrar quién está
  detrás de cada sesión y detectar si alguien entra con la cuenta de otro.
- create_share_invite(): enlace para compartir SOLO esta máquina con otra persona
  (POST /api/v2/device/{nodeId}/device-invites). Requiere TAILSCALE_API_KEY.

Todo es opcional: sin Tailscale, las funciones devuelven None y Valhalla sigue igual.
"""
from __future__ import annotations

import os
import time
from typing import Any

import httpx

from app.client_info import network_of
from app.logger import logger

WHOIS_URL = os.getenv("TS_WHOIS_URL", "http://ts-whois:8088").rstrip("/")
API = "https://api.tailscale.com/api/v2"
_cache: dict[str, tuple[float, Any]] = {}


def api_key() -> str:
    return os.getenv("TAILSCALE_API_KEY", "").strip()


async def _get(path: str, ttl: int) -> Any:
    hit = _cache.get(path)
    if hit and time.monotonic() - hit[0] < ttl:
        return hit[1]
    data = None
    try:
        async with httpx.AsyncClient(timeout=2) as c:
            r = await c.get(WHOIS_URL + path)
            if r.status_code == 200:
                data = r.json()
    except httpx.HTTPError:
        pass  # sin el contenedor ts-whois (perfil «tailscale» no activo)
    _cache[path] = (time.monotonic(), data)
    return data


async def whois(ip: str | None) -> dict[str, Any] | None:
    """{login, name, device, os} de una IP de Tailscale; None si no es VPN o no se sabe."""
    if not ip or not network_of(ip).startswith("VPN"):
        return None
    d = await _get(f"/whois?ip={ip}", 300)
    return {k: d.get(k) for k in ("login", "name", "device", "os")} if d else None


async def self_info() -> dict[str, Any] | None:
    return await _get("/self", 300)


async def public_url() -> str | None:
    """Dirección de Valhalla dentro de la VPN (la que se manda al invitado)."""
    env = os.getenv("VALHALLA_PUBLIC_URL", "").strip().rstrip("/")
    if env:
        return env
    me = await self_info()
    ip4 = next((ip for ip in (me or {}).get("ips", []) if "." in ip), None)
    return f"http://{ip4}:{os.getenv('DASHBOARD_PORT', '3000')}" if ip4 else None


async def create_share_invite() -> tuple[str | None, str | None, str | None]:
    """(invite_id, invite_url, error). Un solo uso, sin permiso de nodo de salida."""
    key = api_key()
    if not key:
        return None, None, "Sin enlace automático: falta TAILSCALE_API_KEY en el .env."
    me = await self_info()
    node = (me or {}).get("node_id")
    if not node:
        return None, None, "No se pudo leer el nodo de Tailscale (¿está activo el perfil «tailscale»?)."
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.post(f"{API}/device/{node}/device-invites", headers={"Authorization": f"Bearer {key}"},
                             json=[{"multiUse": False, "allowExitNode": False}])
        if r.status_code != 200:
            logger.warning("Tailscale device-invites HTTP %s", r.status_code)
            msg = {401: "la clave de API no es válida o ha caducado", 403: "la clave de API no tiene permiso para compartir"}.get(r.status_code, f"HTTP {r.status_code}")
            return None, None, f"Tailscale rechazó la invitación: {msg}."
        inv = (r.json() or [{}])[0]
        return str(inv.get("id") or ""), inv.get("inviteUrl"), None
    except httpx.HTTPError as e:
        return None, None, f"No se pudo contactar con Tailscale ({type(e).__name__})."


async def invite_status(invite_id: str) -> dict[str, Any] | None:
    """¿Se aceptó la invitación de Tailscale y con qué cuenta?"""
    key = api_key()
    if not key or not invite_id:
        return None
    try:
        async with httpx.AsyncClient(timeout=8) as c:
            r = await c.get(f"{API}/device-invites/{invite_id}", headers={"Authorization": f"Bearer {key}"})
        if r.status_code != 200:
            return None
        d = r.json()
        return {"accepted": bool(d.get("accepted")), "login": (d.get("acceptedBy") or {}).get("loginName")}
    except httpx.HTTPError:
        return None


async def revoke_invite(invite_id: str) -> None:
    key = api_key()
    if not key or not invite_id:
        return
    try:
        async with httpx.AsyncClient(timeout=8) as c:
            await c.delete(f"{API}/device-invites/{invite_id}", headers={"Authorization": f"Bearer {key}"})
    except httpx.HTTPError:
        pass
