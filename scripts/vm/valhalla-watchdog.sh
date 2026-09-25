#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Valhalla SOC — vigilante de recursos del host (disco, RAM, swap, contenedores)
#
# Se ejecuta cada 5 minutos (systemd timer). Registra el estado y, solo en
# situación CRÍTICA, actúa para proteger el sistema:
#   · Disco >= CRIT  → limpia caché de build y capas huérfanas de Docker y
#                      recorta el journal. Nunca borra volúmenes ni datos.
#   · RAM baja o swap alto → descarga el modelo de Ollama de memoria
#                      (se vuelve a cargar solo en la siguiente consulta).
#
# Salidas: /var/log/valhalla/watchdog.log (JSON por línea),
#          /var/log/valhalla/watchdog-status.json (último estado) y syslog.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

DISK_WARN=${DISK_WARN:-80}          # % de uso del disco raíz
DISK_CRIT=${DISK_CRIT:-90}
MEM_AVAIL_CRIT_MB=${MEM_AVAIL_CRIT_MB:-600}
SWAP_CRIT_PCT=${SWAP_CRIT_PCT:-75}
OLLAMA_URL=${OLLAMA_URL:-http://127.0.0.1:11434}
LOG_DIR=/var/log/valhalla
LOG="$LOG_DIR/watchdog.log"
STATUS="$LOG_DIR/watchdog-status.json"

mkdir -p "$LOG_DIR"
now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
level="ok"
actions=()
notes=()

raise() { # sube el nivel: ok < warn < crit
  case "$1" in
    crit) level="crit" ;;
    warn) [ "$level" = "ok" ] && level="warn" ;;
  esac
}

# ── Disco ────────────────────────────────────────────────────────────────────
disk_pct=$(df --output=pcent / | tail -1 | tr -dc '0-9')
disk_free_gb=$(df -BG --output=avail / | tail -1 | tr -dc '0-9')
if [ "$disk_pct" -ge "$DISK_CRIT" ]; then
  raise crit; notes+=("disco ${disk_pct}%")
  docker builder prune -f >/dev/null 2>&1 && actions+=("docker builder prune")
  docker image prune -f >/dev/null 2>&1 && actions+=("docker image prune (solo huérfanas)")
  journalctl --vacuum-size=200M >/dev/null 2>&1 && actions+=("journal recortado a 200M")
elif [ "$disk_pct" -ge "$DISK_WARN" ]; then
  raise warn; notes+=("disco ${disk_pct}%")
fi

# ── Memoria y swap ───────────────────────────────────────────────────────────
mem_avail_mb=$(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo)
swap_total=$(awk '/SwapTotal/ {print $2}' /proc/meminfo)
swap_free=$(awk '/SwapFree/ {print $2}' /proc/meminfo)
swap_pct=0
[ "$swap_total" -gt 0 ] && swap_pct=$(( (swap_total - swap_free) * 100 / swap_total ))

if [ "$mem_avail_mb" -lt "$MEM_AVAIL_CRIT_MB" ] || [ "$swap_pct" -ge "$SWAP_CRIT_PCT" ]; then
  raise crit; notes+=("RAM libre ${mem_avail_mb}MB, swap ${swap_pct}%")
  # Descargar de memoria los modelos cargados (keep_alive=0)
  loaded=$(curl -s --max-time 5 "$OLLAMA_URL/api/ps" | grep -o '"name":"[^"]*"' | cut -d'"' -f4)
  for m in $loaded; do
    curl -s --max-time 10 "$OLLAMA_URL/api/generate" -d "{\"model\":\"$m\",\"keep_alive\":0}" >/dev/null 2>&1 \
      && actions+=("modelo $m descargado de RAM")
  done
elif [ "$mem_avail_mb" -lt $(( MEM_AVAIL_CRIT_MB * 2 )) ]; then
  raise warn; notes+=("RAM libre ${mem_avail_mb}MB")
fi

# ── Contenedores ─────────────────────────────────────────────────────────────
unhealthy=$(docker ps --filter health=unhealthy --format '{{.Names}}' 2>/dev/null | paste -sd, -)
exited=$(docker ps -a --filter status=exited --filter label=com.docker.compose.project --format '{{.Names}}' 2>/dev/null \
  | grep -vE 'ollama-init' | paste -sd, -)
[ -n "$unhealthy" ] && { raise warn; notes+=("sin salud: $unhealthy"); }
[ -n "$exited" ] && { raise warn; notes+=("parados: $exited"); }

# ── Registro ─────────────────────────────────────────────────────────────────
json_arr() { local out="" x; for x in "$@"; do out+="\"${x//\"/\\\"}\","; done; echo "[${out%,}]"; }
line=$(printf '{"ts":"%s","level":"%s","disk_pct":%s,"disk_free_gb":%s,"mem_avail_mb":%s,"swap_pct":%s,"notes":%s,"actions":%s}' \
  "$now" "$level" "$disk_pct" "$disk_free_gb" "$mem_avail_mb" "$swap_pct" "$(json_arr "${notes[@]+"${notes[@]}"}")" "$(json_arr "${actions[@]+"${actions[@]}"}")")

echo "$line" >> "$LOG"
echo "$line" > "$STATUS"
[ "$level" != "ok" ] && logger -t valhalla-watchdog -p "user.$([ "$level" = crit ] && echo crit || echo warning)" "$line"

# Mantener el propio log acotado (~2000 líneas ≈ 7 días)
tail -n 2000 "$LOG" > "$LOG.tmp" 2>/dev/null && mv "$LOG.tmp" "$LOG"
exit 0
