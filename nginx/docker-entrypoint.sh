#!/bin/sh
set -e
CERT_DIR="/etc/nginx/certs"
mkdir -p "$CERT_DIR"
if [ ! -f "$CERT_DIR/cert.pem" ]; then
  echo "Generating self-signed TLS certificate for Valhalla gateway..."
  openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout "$CERT_DIR/key.pem" \
    -out "$CERT_DIR/cert.pem" \
    -subj "/CN=valhalla-soc/O=Valhalla/C=ES"
fi
exec "$@"
