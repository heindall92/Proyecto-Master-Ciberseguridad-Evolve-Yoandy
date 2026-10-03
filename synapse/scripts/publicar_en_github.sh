#!/usr/bin/env bash
# Publica S.Y.N.A.P.S.E. en https://github.com/maricelmeneses/synapse (rama main) CON su historial.
#
# Qué hace:
#   1. Clona la rama de trabajo del repositorio de Yoandy (público, no pide credenciales).
#   2. Extrae solo la carpeta synapse/ con todos sus commits (git subtree split).
#   3. La sube a la rama main del repositorio de Maricel. Aquí Git pide iniciar sesión:
#      se abre el navegador (Git Credential Manager) o pide usuario y un token de GitHub.
#
# Se puede ejecutar tantas veces como haga falta: cada vez sube solo lo nuevo.
# No toca ninguna carpeta tuya: trabaja en una carpeta temporal que borra al terminar.
#
# Uso (Linux, macOS o Git Bash en Windows):
#   curl -fsSL https://raw.githubusercontent.com/heindall92/Proyecto-Master-Ciberseguridad-Evolve-Yoandy/claude/sweet-brahmagupta-rzk7c1/synapse/scripts/publicar_en_github.sh | bash
set -euo pipefail

ORIGEN="${SYNAPSE_ORIGEN:-https://github.com/heindall92/Proyecto-Master-Ciberseguridad-Evolve-Yoandy.git}"
RAMA="${SYNAPSE_RAMA:-claude/sweet-brahmagupta-rzk7c1}"
DESTINO="${SYNAPSE_DESTINO:-https://github.com/maricelmeneses/synapse.git}"

paso() { printf '\n\033[1;34m▸ %s\033[0m\n' "$*"; }
ok() { printf '\033[1;32m✓ %s\033[0m\n' "$*"; }
fallo() { printf '\n\033[1;31m✕ %s\033[0m\n' "$*" >&2; exit 1; }

command -v git >/dev/null 2>&1 || fallo "Git no está instalado. Descárgalo de https://git-scm.com/downloads y vuelve a ejecutar."
git subtree --help >/dev/null 2>&1 || fallo "Tu Git no incluye 'git subtree'. Instala Git for Windows o el paquete git-subtree."

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

paso "Descargando la rama de trabajo ($RAMA)…"
git clone --quiet --branch "$RAMA" --single-branch "$ORIGEN" "$TMP/origen" || fallo "No se pudo clonar $ORIGEN"
cd "$TMP/origen"
[ -d synapse ] || fallo "La rama $RAMA no contiene la carpeta synapse/"

paso "Extrayendo synapse/ con su historial…"
git subtree split --prefix=synapse -b synapse-main >/dev/null
ok "$(git rev-list --count synapse-main) commits listos"

FLAGS=()
[ "${SYNAPSE_FORZAR:-0}" = "1" ] && FLAGS=(--force) && paso "Modo forzado: el main remoto se sustituye por el historial del proyecto."

paso "Subiendo a $DESTINO (main). Si Git pide iniciar sesión, usa la cuenta de GitHub de maricelmeneses."
if git push ${FLAGS[@]+"${FLAGS[@]}"} "$DESTINO" synapse-main:main; then
  ok "Publicado: ${DESTINO%.git}"
else
  cat >&2 <<'MSG'

✕ GitHub rechazó la subida. Las causas habituales:
  • «Authentication failed»: la contraseña de GitHub ya no sirve en Git. Inicia sesión en el navegador
    cuando se abra, o crea un token en https://github.com/settings/tokens (permiso «repo») y úsalo como contraseña.
  • «rejected (fetch first)»: main tiene commits hechos directamente en GitHub (por ejemplo, un README).
    Si no los necesitas, repite el comando poniendo  SYNAPSE_FORZAR=1  delante de «bash».
MSG
  exit 1
fi
