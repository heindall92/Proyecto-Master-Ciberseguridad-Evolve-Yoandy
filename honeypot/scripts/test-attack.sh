#!/usr/bin/env bash
# ───────────────────────────────────────────────────────────
# Simula un "atacante" lanzando intentos SSH contra el honeypot
# para verificar que está registrando eventos en el JSON.
#
# Uso:
#   ./scripts/test-attack.sh                 # localhost:2222
#   ./scripts/test-attack.sh 192.168.1.10 2222
# ───────────────────────────────────────────────────────────
set -euo pipefail

HOST="${1:-localhost}"
PORT="${2:-2222}"

if ! command -v sshpass >/dev/null 2>&1; then
  echo "[i] sshpass no instalado — usa las credenciales manualmente:"
  echo "    ssh -p ${PORT} root@${HOST}   (pw: 123456)"
  echo ""
fi

echo "[valhalla-honeypot] Simulando fuerza bruta contra ${HOST}:${PORT}..."

CREDS=(
  "root:123456"
  "root:admin"
  "admin:admin"
  "pi:raspberry"
  "ubuntu:ubuntu"
)

for CRED in "${CREDS[@]}"; do
  USER="${CRED%%:*}"
  PASS="${CRED##*:}"
  echo "  → ${USER}:${PASS}"
  if command -v sshpass >/dev/null 2>&1; then
    sshpass -p "${PASS}" ssh \
      -o StrictHostKeyChecking=no \
      -o UserKnownHostsFile=/dev/null \
      -o ConnectTimeout=5 \
      -p "${PORT}" \
      "${USER}@${HOST}" \
      "uname -a; id; cat /etc/passwd | head -5; exit" 2>/dev/null || true
  else
    # Sin sshpass: al menos hace el TCP handshake para que se loguee la conexión
    (echo "SSH-2.0-TestAttacker"; sleep 1) | nc -w 2 "${HOST}" "${PORT}" >/dev/null 2>&1 || true
  fi
done

echo ""
echo "[✔] Ataque simulado. Revisa los logs:"
echo "    ./scripts/tail-logs.sh"
