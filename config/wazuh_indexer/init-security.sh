#!/bin/bash
# Inicializa el plugin de seguridad de OpenSearch (índice .opendistro_security) en el
# primer arranque del Wazuh Indexer y fija la contraseña del usuario "admin" a
# INDEXER_PASSWORD (definida en .env). Se ejecuta en segundo plano desde el entrypoint;
# es idempotente gracias a un marcador en el volumen de datos.
set -u

H=/usr/share/wazuh-indexer
TOOLS="$H/plugins/opensearch-security/tools"
SEC_CFG="$H/opensearch-security"
CERTS="$H/certs"
MARKER=/var/lib/wazuh-indexer/.valhalla-security-initialized
export JAVA_HOME="$H/jdk"

log() { echo "[valhalla-init-security] $*"; }

if [ -f "$MARKER" ]; then
  log "seguridad ya inicializada, nada que hacer"
  exit 0
fi

# Esperar a que el nodo escuche en 9200 (máx. ~5 min)
for _ in $(seq 1 60); do
  (exec 3<>/dev/tcp/127.0.0.1/9200) 2>/dev/null && break
  sleep 5
done

if [ -n "${INDEXER_PASSWORD:-}" ] && [ "$INDEXER_PASSWORD" != "admin" ]; then
  HASH=$(bash "$TOOLS/hash.sh" -env INDEXER_PASSWORD 2>/dev/null | grep -E '^\$2[aby]\$' | tail -1)
  if [ -n "$HASH" ]; then
    sed -i "/^admin:/,/hash:/ s|hash: .*|hash: \"$HASH\"|" "$SEC_CFG/internal_users.yml"
    log "hash de admin actualizado desde INDEXER_PASSWORD"
  else
    log "AVISO: no se pudo generar el hash; se mantiene la contraseña por defecto"
  fi
fi

for attempt in 1 2 3 4 5; do
  if bash "$TOOLS/securityadmin.sh" -cd "$SEC_CFG/" -nhnv -icl \
      -cacert "$CERTS/root-ca.pem" -cert "$CERTS/admin.pem" -key "$CERTS/admin-key.pem" \
      -h 127.0.0.1 -p 9200; then
    touch "$MARKER"
    log "seguridad inicializada correctamente"
    exit 0
  fi
  log "securityadmin falló (intento $attempt), reintento en 15 s"
  sleep 15
done
log "ERROR: no se pudo inicializar la seguridad del indexer"
exit 1
