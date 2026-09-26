"""Borra del SIEM las sesiones falsas que generaba el widget de salud contra Cowrie.

Hasta el 26/09/2026 el backend comprobaba Cowrie abriendo una conexión TCP a su puerto
SSH: el honeypot registraba cada comprobación como una sesión de ataque (conexión y
cierre en 0-7 ms, sin login). Este script elimina solo esos eventos del indexador.

Uso (dentro del contenedor backend):
    python /opt/valhalla-scripts/purge_backend_probes.py            # solo muestra qué borraría
    python /opt/valhalla-scripts/purge_backend_probes.py --apply    # copia de seguridad + borrado

Se borra únicamente lo que cumple TODO esto: IP de origen = IP del backend y evento
cowrie.session.connect o cowrie.session.closed. La copia queda en /app/backups/.
"""
from __future__ import annotations

import json
import os
import socket
import sys
from datetime import datetime, timezone

import httpx

URL = os.environ["OPENSEARCH_URL"].rstrip("/")
AUTH = (os.environ["OPENSEARCH_USER"], os.environ["OPENSEARCH_PASS"])
INDEX = "wazuh-alerts-*"


def backend_ips() -> set[str]:
    return {ai[4][0] for ai in socket.getaddrinfo(socket.gethostname(), None)} - {"127.0.0.1"}


def main() -> int:
    apply = "--apply" in sys.argv
    ips = sorted(backend_ips())
    query = {"bool": {"filter": [
        {"terms": {"data.src_ip": ips}},
        {"terms": {"data.eventid": ["cowrie.session.connect", "cowrie.session.closed"]}},
    ]}}
    with httpx.Client(auth=AUTH, verify=False, timeout=120) as c:
        # Salvaguarda: si alguna de esas IPs llegó a intentar un login, no es una sonda; no se toca nada
        logins = c.post(f"{URL}/{INDEX}/_count", json={"query": {"bool": {"filter": [
            {"terms": {"data.src_ip": ips}}, {"prefix": {"data.eventid": "cowrie.login"}}]}}}).json()["count"]
        if logins:
            print(f"ABORTADO: hay {logins} intentos de login desde {ips}; no parecen sondas.")
            return 1

        hits = c.post(f"{URL}/{INDEX}/_search", json={"size": 10000, "query": query}).json()["hits"]
        total = hits["total"]["value"]
        print(f"IPs del backend: {ips}")
        print(f"Eventos a borrar: {total}")
        if not total:
            return 0
        if total > 10000:
            print("Hay más de 10.000: ejecuta el script otra vez tras el borrado.")
        if not apply:
            print("Modo prueba: no se ha borrado nada. Añade --apply para borrar.")
            return 0

        os.makedirs("/app/backups", exist_ok=True)
        path = f"/app/backups/sondas-backend-{datetime.now(timezone.utc):%Y%m%d-%H%M%S}.json"
        with open(path, "w", encoding="utf-8") as f:
            json.dump({"motivo": "sondas TCP del widget de salud contra Cowrie", "query": query,
                       "docs": [{"_index": h["_index"], "_id": h["_id"], "_source": h["_source"]} for h in hits["hits"]]}, f)
        print(f"Copia de seguridad: {path}")

        r = c.post(f"{URL}/{INDEX}/_delete_by_query", params={"refresh": "true", "conflicts": "proceed"},
                   json={"query": query}).json()
        print(f"Borrados: {r.get('deleted')} · fallos: {len(r.get('failures', []))}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
