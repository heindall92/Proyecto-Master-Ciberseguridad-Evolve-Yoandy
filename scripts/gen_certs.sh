#!/usr/bin/env bash
# Genera los certificados TLS de Wazuh (indexer, manager, dashboard) con el generador oficial.
#
# No se versionan (son secretos): cada instalación crea los suyos en
# config/wazuh_indexer_ssl_certs/. Si ya existen, no hace nada (usa --force para regenerar).
# Solo necesita Docker: no hace falta sudo.
set -euo pipefail
cd "$(dirname "$0")/.."

DEST="config/wazuh_indexer_ssl_certs"
if [ -f "$DEST/root-ca.pem" ] && [ "${1:-}" != "--force" ]; then
  echo "Certificados ya presentes en $DEST (usa --force para regenerarlos)."
  exit 0
fi
mkdir -p "$DEST"

docker run --rm \
  -v "$PWD/config/certs.yml:/config/certs.yml:ro" \
  -v "$PWD/$DEST:/certificates/" \
  wazuh/wazuh-certs-generator:0.0.2

# Permisos: el manager corre como wazuh (uid 999) y lee sus certificados directamente;
# indexer y dashboard los copian al arrancar. El CA debe ser legible para el conector
# del indexador (vulnerabilidades); las claves privadas, solo por su dueño.
docker run --rm -v "$PWD/$DEST:/c" alpine:3.20 sh -c "
  chown $(id -u):$(id -g) /c/* &&
  chown 999:999 /c/wazuh.manager* /c/root-ca-manager* 2>/dev/null;
  chmod 400 /c/* && chmod 644 /c/root-ca.pem"

echo "Certificados de Wazuh generados en $DEST"
