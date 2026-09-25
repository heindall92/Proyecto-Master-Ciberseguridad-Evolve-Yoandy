"""IP real del cliente, tipo de red y dispositivo de cada sesión.

El panel pasa por un proxy (Vite en desarrollo, nginx en producción), así que el backend
ve la IP del proxy. La cabecera X-Forwarded-For solo se acepta si la petición llega de
uno de esos proxies (resueltos por nombre de contenedor): los demás contenedores del
laboratorio, incluido el atacante, comparten red y podrían falsificarla.
"""
from __future__ import annotations

import ipaddress
import os
import re
import socket
import time

_PROXY_HOSTS = [h.strip() for h in os.getenv("TRUSTED_PROXY_HOSTS", "dashboard,nginx").split(",") if h.strip()]
_cache: dict[str, object] = {"at": 0.0, "ips": set()}

TAILSCALE = ipaddress.ip_network("100.64.0.0/10")  # CGNAT que usa Tailscale


def _trusted() -> set[str]:
    now = time.monotonic()
    if now - float(_cache["at"]) > 300:
        ips: set[str] = {"127.0.0.1"}
        for h in _PROXY_HOSTS:
            try:
                ips.update(ai[4][0] for ai in socket.getaddrinfo(h, None))
            except OSError:
                pass
        _cache.update(at=now, ips=ips)
    return _cache["ips"]  # type: ignore[return-value]


def real_ip(peer: str | None, headers) -> str:
    """IP del cliente. Con un proxy de confianza, la última entrada de X-Forwarded-For
    (la que añade el propio proxy; las anteriores las puede inventar el cliente)."""
    peer = peer or ""
    if peer in _trusted():
        xff = headers.get("x-forwarded-for", "")
        if xff:
            last = xff.split(",")[-1].strip()
            try:
                ipaddress.ip_address(last)
                return last
            except ValueError:
                pass
        xri = headers.get("x-real-ip", "").strip()
        if xri:
            return xri
    return peer


def network_of(ip: str) -> str:
    try:
        a = ipaddress.ip_address(ip)
    except ValueError:
        return "desconocida"
    if a in TAILSCALE:
        return "VPN (Tailscale)"
    if a.is_loopback:
        return "local"
    if a.is_private:
        return "red local"
    return "internet"


def device_of(ua: str) -> dict[str, str]:
    ua = ua or ""
    mobile = bool(re.search(r"Mobile|Android|iPhone|iPad", ua))
    os_name = ("Android" if "Android" in ua else "iOS" if re.search(r"iPhone|iPad", ua) else "Windows" if "Windows" in ua
               else "macOS" if "Mac OS X" in ua else "Linux" if "Linux" in ua else "—")
    browser = ("Edge" if "Edg/" in ua else "Firefox" if "Firefox/" in ua else "Chrome" if "Chrome/" in ua
               else "Safari" if "Safari/" in ua else "—")
    return {"type": "móvil" if mobile else "escritorio", "os": os_name, "browser": browser}
