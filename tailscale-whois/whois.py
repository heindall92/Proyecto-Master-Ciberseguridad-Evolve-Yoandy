"""Puente mínimo entre Valhalla y la API local de Tailscale (tailscaled.sock).

Dar el socket al backend le daría control total del nodo (cambiar rutas, cerrar sesión
de la VPN...). Este contenedor es lo único que lo toca y solo expone dos lecturas:

  GET /whois?ip=100.x.y.z  -> cuenta de Tailscale y dispositivo dueños de esa IP
  GET /self                -> identificador, nombre e IPs del propio nodo

Solo acepta IPs de Tailscale y solo es accesible desde la red interna ts-internal.
Sin dependencias: biblioteca estándar.
"""
from __future__ import annotations

import http.client
import ipaddress
import json
import socket
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SOCK = "/var/run/tailscale/tailscaled.sock"
TS_NETS = (ipaddress.ip_network("100.64.0.0/10"), ipaddress.ip_network("fd7a:115c:a1e0::/48"))


class _UnixConn(http.client.HTTPConnection):
    def __init__(self) -> None:
        super().__init__("local-tailscaled.sock", timeout=3)

    def connect(self) -> None:
        s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        s.settimeout(3)
        s.connect(SOCK)
        self.sock = s


def _local(path: str):
    c = _UnixConn()
    try:
        c.request("GET", path, headers={"Host": "local-tailscaled.sock"})
        r = c.getresponse()
        body = r.read()
    finally:
        c.close()
    return json.loads(body) if r.status == 200 else None


class Handler(BaseHTTPRequestHandler):
    server_version = "ts-whois"

    def _json(self, code: int, data) -> None:
        raw = json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self) -> None:  # noqa: N802
        u = urllib.parse.urlparse(self.path)
        try:
            if u.path == "/whois":
                ip = urllib.parse.parse_qs(u.query).get("ip", [""])[0]
                try:
                    addr = ipaddress.ip_address(ip)
                except ValueError:
                    return self._json(400, {"error": "ip no válida"})
                if not any(addr in n for n in TS_NETS):
                    return self._json(400, {"error": "no es una IP de Tailscale"})
                d = _local("/localapi/v0/whois?addr=" + urllib.parse.quote(str(addr)))
                if not d:
                    return self._json(404, {"error": "desconocida"})
                node, prof = d.get("Node") or {}, d.get("UserProfile") or {}
                hi = node.get("Hostinfo") or {}
                return self._json(200, {
                    "login": prof.get("LoginName"),
                    "name": prof.get("DisplayName"),
                    "device": hi.get("Hostname") or node.get("ComputedName"),
                    "os": hi.get("OS"),
                    "node": (node.get("Name") or "").rstrip("."),
                })
            if u.path == "/self":
                st = _local("/localapi/v0/status")
                if not st:
                    return self._json(503, {"error": "tailscaled no responde"})
                s = st.get("Self") or {}
                return self._json(200, {
                    "node_id": s.get("ID"),
                    "dns_name": (s.get("DNSName") or "").rstrip("."),
                    "ips": s.get("TailscaleIPs") or [],
                    "running": st.get("BackendState") == "Running",
                })
            if u.path == "/health":
                return self._json(200, {"ok": True})
            return self._json(404, {"error": "no encontrado"})
        except (OSError, ValueError) as e:
            return self._json(503, {"error": f"tailscaled no disponible: {type(e).__name__}"})

    def log_message(self, *_args) -> None:  # sin ruido en los logs
        pass


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", 8088), Handler).serve_forever()
