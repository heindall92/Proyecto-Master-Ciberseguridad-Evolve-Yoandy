#!/usr/bin/env bash
# Ejecuta la suite del backend y regenera la matriz de trazabilidad (docs/TRAZABILIDAD.md).
# Las pruebas usan SQLite en memoria y dobles de Wazuh/OpenSearch/Ollama/Tailscale:
# no tocan la base de datos ni los servicios reales.
set -euo pipefail
cd "$(dirname "$0")/.."
# El contenedor solo monta backend/: los requisitos se copian un momento y la matriz se trae de vuelta
cp docs/REQUISITOS.md backend/.REQUISITOS.md
trap 'rm -f backend/.REQUISITOS.md' EXIT
status=0
docker compose exec -T -e TRACE_MATRIX=/app/.TRAZABILIDAD.md -e TRACE_REQS=/app/.REQUISITOS.md   backend python -m pytest -q -p no:cacheprovider tests "$@" || status=$?
mv backend/.TRAZABILIDAD.md docs/TRAZABILIDAD.md
exit $status
