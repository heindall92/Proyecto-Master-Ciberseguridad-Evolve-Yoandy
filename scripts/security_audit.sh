#!/usr/bin/env bash
# Auditoría de dependencias e imágenes: pip-audit (backend), npm audit (consola) y Trivy (imágenes propias).
# Uso: bash scripts/security_audit.sh      (con el stack levantado; resultados en stdout)
set -uo pipefail
cd "$(dirname "$0")/.."

echo "== pip-audit · backend/requirements.txt"
docker run --rm -v "$PWD/backend/requirements.txt:/r.txt:ro" python:3.12-slim \
  sh -c "pip install -q pip-audit >/dev/null 2>&1 && pip-audit -r /r.txt"

echo; echo "== npm audit · consola"
docker compose exec -T dashboard npm audit --omit=dev
docker compose exec -T dashboard npm audit | tail -1

echo; echo "== Trivy · imágenes propias (HIGH, CRITICAL)"
for img in valhalla-soc-backend:latest valhalla-soc-dashboard:latest; do
  docker run --rm -v /var/run/docker.sock:/var/run/docker.sock -v "${HOME}/.cache/trivy:/root/.cache/" \
    aquasec/trivy:0.57.1 image -q --scanners vuln --severity HIGH,CRITICAL "$img"
done
