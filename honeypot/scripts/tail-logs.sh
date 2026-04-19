#!/usr/bin/env bash
# ───────────────────────────────────────────────────────────
# Tail en vivo de los logs JSON de Cowrie, formateados.
# Uso:
#   ./scripts/tail-logs.sh              # formato bonito con jq
#   ./scripts/tail-logs.sh --raw        # JSON crudo, sin formatear
# ───────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HONEYPOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
LOG_FILE="${HONEYPOT_DIR}/logs/cowrie.json"

if [[ ! -f "${LOG_FILE}" ]]; then
  echo "✗ No existe ${LOG_FILE}"
  echo "  ¿Está el honeypot arrancado?  ./scripts/status.sh"
  exit 1
fi

MODE="${1:-pretty}"

if [[ "${MODE}" == "--raw" ]]; then
  tail -F "${LOG_FILE}"
elif command -v jq >/dev/null 2>&1; then
  tail -F "${LOG_FILE}" | \
    jq -r '[.timestamp, .eventid, (.src_ip // "-"), (.username // "-"), (.password // "-"), (.input // .message // "-")] | @tsv'
else
  echo "(jq no instalado — mostrando JSON crudo)"
  tail -F "${LOG_FILE}"
fi
