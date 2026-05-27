#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# Valhalla SOC — Instalador para Linux / macOS / WSL
#
# Uso (one-liner):
#   curl -fsSL https://raw.githubusercontent.com/heindall92/Proyecto-Master-Ciberseguridad-Evolve-Yoandy/main/install.sh | bash
#
# O si ya tienes el repo clonado:
#   chmod +x install.sh && ./install.sh
#
# Opciones de entorno:
#   INSTALL_DIR=/ruta/personalizada ./install.sh
#   SKIP_OLLAMA=1 ./install.sh
#   NO_LABS=1 ./install.sh
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

REPO_URL="https://github.com/heindall92/Proyecto-Master-Ciberseguridad-Evolve-Yoandy.git"
INSTALL_DIR="${INSTALL_DIR:-$HOME/Valhalla-SOC}"
OLLAMA_MODEL="${OLLAMA_MODEL:-qwen2.5:3b-instruct}"
SKIP_OLLAMA="${SKIP_OLLAMA:-0}"
NO_LABS="${NO_LABS:-0}"

# ── Colores ───────────────────────────────────────────────────────────────────
CY='\033[0;36m'; GR='\033[0;32m'; YL='\033[0;33m'; RD='\033[0;31m'; NC='\033[0m'; DG='\033[0;90m'

step() { echo ""; echo -e "  ${CY}[$1]${NC} $2"; echo -e "  ${DG}$(printf '%.0s─' {1..60})${NC}"; }
ok()   { echo -e "      ${GR}OK${NC}  $1"; }
warn() { echo -e "    ${YL}WARN${NC}  $1"; }
fail() { echo -e "   ${RD}ERROR${NC}  $1" >&2; exit 1; }

# ── Banner ────────────────────────────────────────────────────────────────────
echo ""
echo -e "  ${CY}╔═══════════════════════════════════════╗${NC}"
echo -e "  ${CY}║         VALHALLA SOC  Installer       ║${NC}"
echo -e "  ${CY}║    SOC con IA local · 100% Docker     ║${NC}"
echo -e "  ${CY}╚═══════════════════════════════════════╝${NC}"
echo ""

# ── 1. Prerrequisitos ─────────────────────────────────────────────────────────
step "1/5" "Comprobando prerrequisitos"

command -v git   >/dev/null 2>&1 || fail "Git no encontrado. Instálalo con tu gestor de paquetes (apt/brew/dnf) y vuelve a ejecutar."
ok "Git $(git --version)"

command -v docker >/dev/null 2>&1 || fail "Docker no encontrado. Visita https://docs.docker.com/get-docker/ para instalarlo."
ok "Docker $(docker --version)"

docker info >/dev/null 2>&1 || fail "Docker daemon no está en ejecución. Inicia Docker y vuelve a intentarlo."
ok "Docker daemon activo"

command -v python3 >/dev/null 2>&1 || fail "Python 3 no encontrado. Instálalo con: apt install python3 / brew install python"
ok "$(python3 --version)"

# ── 2. Clonar o actualizar el repo ───────────────────────────────────────────
step "2/5" "Preparando el repositorio"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || echo "")"

if [ -f "$SCRIPT_DIR/.git/config" ] 2>/dev/null; then
    INSTALL_DIR="$SCRIPT_DIR"
    ok "Ejecutando desde el repo en: $INSTALL_DIR"
elif [ -d "$INSTALL_DIR/.git" ]; then
    ok "Repo ya existe en $INSTALL_DIR — actualizando"
    cd "$INSTALL_DIR"
    git pull --ff-only
else
    echo -e "      ${DG}Clonando en $INSTALL_DIR ...${NC}"
    git clone "$REPO_URL" "$INSTALL_DIR"
    ok "Repo clonado"
fi

cd "$INSTALL_DIR"

# ── 3. Generar .env con secretos únicos ──────────────────────────────────────
step "3/5" "Configurando secretos (.env)"

if [ -f ".env" ]; then
    ok ".env ya existe — no se sobreescribe (exporta FORCE_ENV=1 para regenerar)"
else
    python3 scripts/setup_env.py --yes
    ok ".env generado con secretos únicos"
fi

# ── 4. Levantar el stack con Docker Compose ──────────────────────────────────
step "4/5" "Levantando el stack Docker"

PROFILE_ARG=""
[ "$NO_LABS" = "0" ] && PROFILE_ARG="--profile labs"

CMD="docker compose $PROFILE_ARG up -d --build"
echo -e "      ${DG}> $CMD${NC}"
eval "$CMD"

ok "Todos los contenedores iniciados"

# ── 5. Modelo IA (Ollama) ────────────────────────────────────────────────────
step "5/5" "Descargando modelo de IA ($OLLAMA_MODEL)"

if [ "$SKIP_OLLAMA" = "1" ]; then
    warn "Saltando descarga del modelo (SKIP_OLLAMA=1). El chatbot IA no funcionará hasta que lo descargues."
else
    echo -e "      ${DG}Esperando a que Ollama arranque...${NC}"
    tries=0
    until docker exec ollama ollama list >/dev/null 2>&1 || [ $tries -ge 20 ]; do
        sleep 3
        tries=$((tries + 1))
    done

    if docker exec ollama ollama list >/dev/null 2>&1; then
        docker exec ollama ollama pull "$OLLAMA_MODEL"
        ok "Modelo $OLLAMA_MODEL descargado"
    else
        warn "Ollama tardó demasiado en arrancar. Ejecuta manualmente: docker exec ollama ollama pull $OLLAMA_MODEL"
    fi
fi

# ── Resumen ───────────────────────────────────────────────────────────────────
echo ""
echo -e "  ${GR}╔═══════════════════════════════════════════════════════╗${NC}"
echo -e "  ${GR}║           VALHALLA SOC  instalado con éxito           ║${NC}"
echo -e "  ${GR}╚═══════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  Panel SOC:         ${GR}http://localhost:3000${NC}"
echo -e "  Wazuh Dashboard:   ${GR}https://localhost${NC}  (admin / admin)"
echo -e "  API Backend:       ${GR}http://localhost:8000/docs${NC}"
echo -e "  Cowrie Honeypot:   SSH puerto 2222"
echo ""
echo -e "  ${DG}Credenciales admin SOC: ver .env → ADMIN_PASSWORD${NC}"
echo -e "  ${DG}Para parar todo: docker compose down${NC}"
echo ""
