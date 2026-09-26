#!/bin/bash
# Inicializa el plugin de seguridad de OpenSearch (índice .opendistro_security) del Wazuh
# Indexer. Se ejecuta en segundo plano desde el entrypoint; es idempotente gracias a un
# marcador versionado en el volumen de datos.
#
# v1: contraseña de "admin" desde INDEXER_PASSWORD.
# v2: además, contraseña propia de "kibanaserver" (el usuario con el que la consola de Wazuh
#     habla con el indexador) desde DASHBOARD_PASSWORD, y eliminación de los usuarios de
#     demostración (anomalyadmin, kibanaro, logstash, readall, snapshotrestore), que venían con
#     su contraseña pública. Las instalaciones con v1 aplican v2 una vez al arrancar.
set -u

H=/usr/share/wazuh-indexer
TOOLS="$H/plugins/opensearch-security/tools"
SEC_CFG="$H/opensearch-security"
USERS="$SEC_CFG/internal_users.yml"
CERTS="$H/certs"
MARKER=/var/lib/wazuh-indexer/.valhalla-security-v2
DEMO_USERS="anomalyadmin kibanaro logstash readall snapshotrestore"
export JAVA_HOME="$H/jdk"

log() { echo "[valhalla-init-security] $*"; }

if [ -f "$MARKER" ]; then
  log "seguridad v2 ya aplicada, nada que hacer"
  exit 0
fi

# Esperar a que el nodo escuche en 9200 (máx. ~5 min)
for _ in $(seq 1 60); do
  (exec 3<>/dev/tcp/127.0.0.1/9200) 2>/dev/null && break
  sleep 5
done

set_hash() {  # set_hash <usuario> <variable de entorno con la contraseña>
  local user="$1" var="$2" hash
  hash=$(bash "$TOOLS/hash.sh" -env "$var" 2>/dev/null | grep -E '^\$2[aby]\$' | tail -1)
  if [ -n "$hash" ]; then
    sed -i "/^${user}:/,/hash:/ s|hash: .*|hash: \"$hash\"|" "$USERS"
    log "contraseña de $user actualizada"
  else
    log "AVISO: no se pudo generar el hash de $user; se mantiene el anterior"
  fi
}

if [ -n "${INDEXER_PASSWORD:-}" ] && [ "$INDEXER_PASSWORD" != "admin" ]; then
  set_hash admin INDEXER_PASSWORD
fi
if [ -n "${DASHBOARD_PASSWORD:-}" ] && [ "$DASHBOARD_PASSWORD" != "kibanaserver" ]; then
  set_hash kibanaserver DASHBOARD_PASSWORD
else
  log "AVISO: DASHBOARD_PASSWORD vacía; kibanaserver conserva su contraseña por defecto"
fi

# Quitar los usuarios de demostración: cada bloque va desde "usuario:" hasta la siguiente clave raíz
for u in $DEMO_USERS; do
  awk -v u="$u" '
    $0 ~ "^" u ":" { skip = 1; next }
    skip && /^[^[:space:]#]/ { skip = 0 }
    !skip' "$USERS" > "$USERS.tmp" && mv "$USERS.tmp" "$USERS"
done
log "usuarios de demostración eliminados: $DEMO_USERS"

for attempt in 1 2 3 4 5; do
  if bash "$TOOLS/securityadmin.sh" -cd "$SEC_CFG/" -nhnv -icl \
      -cacert "$CERTS/root-ca.pem" -cert "$CERTS/admin.pem" -key "$CERTS/admin-key.pem" \
      -h 127.0.0.1 -p 9200; then
    touch "$MARKER"
    log "seguridad v2 aplicada correctamente"
    exit 0
  fi
  log "securityadmin falló (intento $attempt), reintento en 15 s"
  sleep 15
done
log "ERROR: no se pudo aplicar la configuración de seguridad del indexer"
exit 1
