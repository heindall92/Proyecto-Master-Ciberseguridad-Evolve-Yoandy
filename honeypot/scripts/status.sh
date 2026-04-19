#!/usr/bin/env bash
# ───────────────────────────────────────────────────────────
# Muestra el estado y salud del honeypot.
# ───────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HONEYPOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${HONEYPOT_DIR}"

CONTAINER_NAME="${COWRIE_CONTAINER_NAME:-valhalla-cowrie}"

echo "────────────────────────────────────────────────────"
echo "  Valhalla Honeypot — estado"
echo "────────────────────────────────────────────────────"

if ! docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  echo "  ✗ Contenedor '${CONTAINER_NAME}' NO existe."
  echo "    Arranca con: ./scripts/start.sh"
  exit 1
fi

STATE="$(docker inspect -f '{{.State.Status}}' "${CONTAINER_NAME}")"
HEALTH="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}n/a{{end}}' "${CONTAINER_NAME}")"

echo "  Contenedor : ${CONTAINER_NAME}"
echo "  Estado     : ${STATE}"
echo "  Healthcheck: ${HEALTH}"
echo ""
docker compose ps
echo ""

# Cuenta de eventos registrados
LOG_FILE="${HONEYPOT_DIR}/logs/cowrie.json"
if [[ -f "${LOG_FILE}" ]]; then
  EVENTS=$(wc -l < "${LOG_FILE}" | tr -d ' ')
  SIZE=$(du -h "${LOG_FILE}" | cut -f1)
  echo "  Eventos JSON registrados: ${EVENTS}"
  echo "  Tamaño log JSON         : ${SIZE}"
else
  echo "  (todavía no hay logs en ${LOG_FILE})"
fi
