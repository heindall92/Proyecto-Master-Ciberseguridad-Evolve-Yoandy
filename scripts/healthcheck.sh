#!/usr/bin/env sh
# Valhalla SOC — comprobación rápida de servicios (ejecutar en host con stack levantado)
set -e
BACKEND="${BACKEND_URL:-http://localhost:8000}"
GATEWAY="${GATEWAY_URL:-https://localhost:8443}"

echo "== Backend =="
curl -sf "${BACKEND}/health" | head -c 200
echo ""

echo "== Gateway (prod profile) =="
curl -skf "${GATEWAY}/" -o /dev/null && echo "gateway OK" || echo "gateway SKIP (profile prod no activo)"

echo "== Postgres =="
docker compose exec -T postgres pg_isready -U "${POSTGRES_USER:-valhalla}" 2>/dev/null || echo "postgres SKIP"

echo "== Cowrie log =="
docker compose exec -T wazuh.manager test -f /var/log/cowrie/cowrie.json 2>/dev/null \
  && echo "cowrie.json visible en manager" || echo "cowrie log SKIP"

echo "Done."
