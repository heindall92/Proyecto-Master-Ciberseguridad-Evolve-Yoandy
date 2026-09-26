#!/usr/bin/env bash
# Tras el primer `docker compose up`: credenciales del indexador en el keystore del manager.
#
# El bloque <indexer> de wazuh_config/ossec.conf hace que el manager envíe al indexador el
# inventario de vulnerabilidades (índice wazuh-states-vulnerabilities-*), pero necesita
# usuario y contraseña en su keystore. La contraseña se pasa por stdin: no aparece en la
# línea de comandos ni en el historial.
set -euo pipefail
cd "$(dirname "$0")/.."

env_get() { grep -E "^$1=" .env 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '\r"'"'"; }
USER_IDX="$(env_get OPENSEARCH_USER)"; USER_IDX="${USER_IDX:-admin}"
PASS_IDX="$(env_get INDEXER_PASSWORD)"
[ -n "$PASS_IDX" ] || { echo "Falta INDEXER_PASSWORD en .env (ejecuta scripts/setup_env.py)" >&2; exit 1; }

echo "Esperando al manager de Wazuh..."
for _ in $(seq 1 60); do
  docker compose exec -T wazuh.manager test -x /var/ossec/bin/wazuh-keystore 2>/dev/null && break
  sleep 5
done

printf %s "$USER_IDX" | docker compose exec -T wazuh.manager /var/ossec/bin/wazuh-keystore -f indexer -k username
printf %s "$PASS_IDX" | docker compose exec -T wazuh.manager /var/ossec/bin/wazuh-keystore -f indexer -k password
docker compose restart wazuh.manager >/dev/null
echo "Keystore del indexador configurado y manager reiniciado."
