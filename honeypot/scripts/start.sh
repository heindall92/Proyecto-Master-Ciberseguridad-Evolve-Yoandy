#!/usr/bin/env bash
# ───────────────────────────────────────────────────────────
# Arranca el honeypot Cowrie en modo standalone.
# ───────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HONEYPOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${HONEYPOT_DIR}"

# Cargar .env si existe
if [[ -f .env ]]; then
  # shellcheck disable=SC1091
  set -a; source .env; set +a
fi

echo "[valhalla-honeypot] Arrancando Cowrie..."
docker compose up -d

echo ""
echo "[valhalla-honeypot] Estado:"
docker compose ps

cat <<EOF

  ✔ Honeypot operativo
    SSH      -> localhost:${COWRIE_SSH_PORT:-2222}
    Telnet   -> localhost:${COWRIE_TELNET_PORT:-2223}

  Logs JSON (consumidos por el backend):
    -> ./logs/cowrie.json           (bind-mount local)
    -> volumen  'valhalla_cowrie_logs'

  Pruébalo:
    ssh -p ${COWRIE_SSH_PORT:-2222} root@localhost     # contraseña: 123456

  Seguir los logs:
    ./scripts/tail-logs.sh
EOF
