#!/usr/bin/env bash
# ───────────────────────────────────────────────────────────
# Detiene el honeypot Cowrie.
# ───────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HONEYPOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${HONEYPOT_DIR}"

echo "[valhalla-honeypot] Deteniendo Cowrie..."
docker compose down

echo "[valhalla-honeypot] Contenedor detenido."
echo "  Los volúmenes NO se borran (logs persistentes)."
echo "  Para borrar también los volúmenes:"
echo "    docker compose down -v"
