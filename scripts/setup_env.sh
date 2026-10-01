#!/usr/bin/env bash
# Configuración inicial Valhalla SOC (Linux / macOS / WSL)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
exec python3 scripts/setup_env.py "$@"
