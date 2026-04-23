#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════
# Valhalla SOC — Honeypot — Verificación automática (Linux/macOS/WSL)
#
# Uso (desde honeypot/):
#   bash scripts/verify.sh
#
# Requisitos: docker, docker compose, python3 (opcional pero
# recomendable — con paramiko hace login real y ejecuta comandos).
# ═══════════════════════════════════════════════════════════
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HONEYPOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${HONEYPOT_DIR}"

DATE="$(date +%Y%m%d-%H%M%S)"
EVIDENCE="docs/EVIDENCIA-${DATE}.md"

declare -a RESULTS   # "TC-XX|OK|reason"

W()  { echo -e "$*" >> "${EVIDENCE}"; }
log(){ echo -e "\e[36m$*\e[0m"; }
ok(){  RESULTS+=("$1|OK|"); echo -e "  \e[32m[OK]\e[0m $1"; }
ko(){  RESULTS+=("$1|KO|$2"); echo -e "  \e[31m[KO]\e[0m $1 — $2"; }

run() { # run <cmd...>  → echoes output, always returns 0
    local out
    out="$("$@" 2>&1)" || true
    echo "${out}"
}

# ── cabecera ────────────────────────────────────────────────
mkdir -p docs
cat > "${EVIDENCE}" <<EOF
# 🔬 Valhalla SOC — Honeypot — Evidencia de verificación

**Generado:** $(date +'%Y-%m-%d %H:%M:%S')
**Máquina:** $(hostname)
**Usuario:** ${USER:-unknown}
**Carpeta:** \`${HONEYPOT_DIR}\`

> Documento generado automáticamente por \`scripts/verify.sh\`.

---
EOF

log "→ Iniciando verificación. Informe: ${EVIDENCE}"

# TC-00
W ""
W "## TC-00 · Entorno"
W ""
W "\`\`\`"
W "$(run docker --version)"
W "$(run docker compose version)"
W "\`\`\`"
if command -v docker >/dev/null; then ok "TC-00"; else ko "TC-00" "docker no instalado"; exit 1; fi

# TC-01
W ""
W "## TC-01 · Imagen Docker disponible"
W ""
log "→ docker pull cowrie/cowrie:latest"
PULL="$(run docker pull cowrie/cowrie:latest)"
W "\`\`\`"; W "${PULL}"; W "\`\`\`"
if echo "${PULL}" | grep -qE "(Downloaded|up to date|Pull complete)"; then ok "TC-01"; else ko "TC-01" "pull falló"; fi

# TC-02
W ""
W "## TC-02 · Stack arranca sin errores"
W ""
run docker compose down >/dev/null
UP="$(run docker compose up -d)"
W "\`\`\`"; W "${UP}"; W "\`\`\`"
if echo "${UP}" | grep -qE "(Started|Running|Created)"; then ok "TC-02"; else ko "TC-02" "fallo al arrancar"; fi

log "→ Esperando 30s a que Cowrie inicialice..."
sleep 30

# TC-03
W ""
W "## TC-03 · Healthcheck"
W ""
STATE="$(run docker inspect -f '{{.State.Status}}' valhalla-cowrie)"
HEALTH="$(run docker inspect -f '{{.State.Health.Status}}' valhalla-cowrie)"
retry=0
while ! echo "${HEALTH}" | grep -q healthy && [ $retry -lt 6 ]; do
    sleep 10
    HEALTH="$(run docker inspect -f '{{.State.Health.Status}}' valhalla-cowrie)"
    retry=$((retry+1))
done
W "\`\`\`"
W "State: ${STATE}"
W "Health: ${HEALTH}"
W "\`\`\`"
if echo "${HEALTH}" | grep -q healthy; then ok "TC-03"; else ko "TC-03" "health=${HEALTH}"; fi

# TC-04 + TC-05
for PORT in 2222 2223; do
    W ""
    W "## Puerto ${PORT}"
    W ""
    if (echo > /dev/tcp/127.0.0.1/${PORT}) 2>/dev/null; then
        W "Puerto ${PORT} LISTEN ✔"
        ok "TC-PORT-${PORT}"
    else
        W "Puerto ${PORT} NO responde ✗"
        ko "TC-PORT-${PORT}" "cerrado"
    fi
done

# TC-06 — banner SSH
W ""
W "## TC-06 · Banner SSH"
W ""
BANNER="$(timeout 3 bash -c "exec 3<>/dev/tcp/127.0.0.1/2222; head -c 200 <&3")" || true
W "\`\`\`"
W "${BANNER}"
W "\`\`\`"
if echo "${BANNER}" | grep -q 'SSH-2.0-OpenSSH'; then ok "TC-06"; else ko "TC-06" "banner inesperado"; fi

# TC-07 + TC-09 — login + comandos
W ""
W "## TC-07 + TC-09 · Login + comandos en shell falsa"
W ""
if command -v python3 >/dev/null; then
    # paramiko 4.x es incompatible con Cowrie (cierra el canal) - pineamos <4
    python3 -m pip install --quiet --break-system-packages 'paramiko<4' 2>/dev/null || \
        python3 -m pip install --quiet 'paramiko<4' 2>/dev/null || true
    ATTACK="$(python3 - <<'PY' 2>&1
try:
    import paramiko, time
except Exception as e:
    print(f"NO_PARAMIKO: {e}"); raise SystemExit(0)
creds=[('root','123456'),('admin','admin'),('pi','raspberry'),('root','toor'),('ubuntu','ubuntu')]
for u,p in creds:
    try:
        c=paramiko.SSHClient(); c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        c.connect('127.0.0.1',port=2222,username=u,password=p,timeout=5,banner_timeout=5,auth_timeout=5,allow_agent=False,look_for_keys=False)
        _, stdout, _ = c.exec_command('uname -a; id; ls /; cat /etc/passwd | head -3')
        print(f"[OK] {u}:{p} -> {stdout.read().decode('utf-8','ignore')[:250]}")
        c.close()
    except Exception as e:
        print(f"[FAIL] {u}:{p} -> {e}")
    time.sleep(1)
PY
)"
    W "\`\`\`"; W "${ATTACK}"; W "\`\`\`"
    if echo "${ATTACK}" | grep -q '\[OK\]'; then ok "TC-07"; ok "TC-09"; else ko "TC-07" "no loguea"; fi
else
    W "_(python3 no disponible)_"
    ko "TC-07" "sin python no se ejecutan comandos"
fi

# TC-10 + TC-11
W ""
W "## TC-10 + TC-11 · Eventos JSON"
W ""
sleep 3
LOG="${HONEYPOT_DIR}/logs/cowrie.json"
if [ -f "${LOG}" ]; then
    COUNT="$(wc -l < "${LOG}" | tr -d ' ')"
    W "Total de eventos registrados: **${COUNT}**"
    W ""
    W "Últimas 20 líneas:"
    W "\`\`\`json"
    W "$(tail -n 20 "${LOG}")"
    W "\`\`\`"
    if [ "${COUNT}" -gt 0 ]; then ok "TC-10"; else ko "TC-10" "JSON vacío"; fi
    if [ "${COUNT}" -gt 5 ]; then ok "TC-11"; else ko "TC-11" "solo ${COUNT} eventos"; fi
else
    ko "TC-10" "no existe ${LOG}"
    ko "TC-11" "no existe ${LOG}"
fi

# TC-13 — persistencia
W ""
W "## TC-13 · Persistencia tras restart"
W ""
N1="$(wc -l < "${LOG}" 2>/dev/null || echo 0)"
run docker compose restart >/dev/null
sleep 10
N2="$(wc -l < "${LOG}" 2>/dev/null || echo 0)"
W "Eventos antes del restart: ${N1}"
W "Eventos después:            ${N2}"
if [ "${N2}" -ge "${N1}" ]; then ok "TC-13"; else ko "TC-13" "logs perdidos"; fi

# TC-14 — volúmenes
W ""
W "## TC-14 · Volúmenes nombrados"
W ""
VOLS="$(run docker volume ls --format '{{.Name}}')"
W "\`\`\`"; W "${VOLS}"; W "\`\`\`"
if echo "${VOLS}" | grep -q valhalla_cowrie_logs; then ok "TC-14"; else ko "TC-14" "volumen ausente"; fi

# TC-15 — bind-mount
W ""
W "## TC-15 · Bind-mount local"
W ""
W "\`\`\`"
W "$(ls -la logs/ 2>&1)"
W "\`\`\`"
if [ -s logs/cowrie.json ]; then ok "TC-15"; else ko "TC-15" "cowrie.json vacío/ausente"; fi

# ───── Resumen ────────────────────────────────────────────
W ""
W "---"
W ""
W "## 📊 Resumen"
W ""
W "| Test | Estado |"
W "|---|---|"
OK_COUNT=0
TOTAL=0
for r in "${RESULTS[@]}"; do
    ID="${r%%|*}"; REST="${r#*|}"
    STATUS="${REST%%|*}"; WHY="${REST#*|}"
    ICON="❌"; [ "${STATUS}" = "OK" ] && ICON="✅"
    EXTRA=""; [ -n "${WHY}" ] && EXTRA=" _(${WHY})_"
    W "| ${ID} | ${ICON} **${STATUS}**${EXTRA} |"
    [ "${STATUS}" = "OK" ] && OK_COUNT=$((OK_COUNT+1))
    TOTAL=$((TOTAL+1))
done
W ""
W "**Total: ${OK_COUNT} / ${TOTAL} tests OK**"
W ""
if [ "${OK_COUNT}" -eq "${TOTAL}" ]; then
    W "### ✅ Veredicto: APTO para integración con el backend."
else
    W "### ⚠️ Veredicto: revisar tests en KO."
fi
W ""
W "_Generado por scripts/verify.sh el $(date +'%Y-%m-%d %H:%M:%S')_"

echo ""
echo "════════════════════════════════════════════════════"
echo "  ${OK_COUNT} / ${TOTAL} tests OK"
echo "  Evidencia → ${EVIDENCE}"
echo "════════════════════════════════════════════════════"
