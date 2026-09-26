#!/usr/bin/env bash
# Cierra los puertos de Docker a la VPN (Tailscale): desde la VPN solo se entra por
# https://<maquina>.<tailnet>.ts.net (tailscale serve -> 127.0.0.1:3000), cifrado.
#
# Sin esto, cualquiera con acceso a la VPN llegaría por http sin cifrar a Valhalla (3000),
# a la API (8000), a Wazuh (443, 55000, 9200) y al resto de puertos publicados por Docker.
# `tailscale serve` no pasa por aquí: conecta desde el propio host (localhost), no reenvía.
#
# Idempotente. Instalación persistente (se reaplica al arrancar Docker):
#   sudo install -m 755 scripts/vpn-firewall.sh /usr/local/sbin/valhalla-vpn-firewall
#   sudo install -m 644 scripts/valhalla-vpn-firewall.service /etc/systemd/system/
#   sudo systemctl daemon-reload && sudo systemctl enable --now valhalla-vpn-firewall
set -euo pipefail

IFACE="${TS_IFACE:-tailscale0}"
RULE=(-i "$IFACE" -m comment --comment "valhalla: VPN solo por HTTPS" -j DROP)

for ipt in iptables ip6tables; do
  command -v "$ipt" >/dev/null || continue
  # DOCKER-USER lo crea Docker al arrancar; esperar a que exista
  for _ in $(seq 1 30); do "$ipt" -nL DOCKER-USER >/dev/null 2>&1 && break; sleep 2; done
  "$ipt" -nL DOCKER-USER >/dev/null 2>&1 || { echo "$ipt: no existe DOCKER-USER (¿Docker parado?)" >&2; continue; }
  # Respuestas de conexiones que salen de los contenedores hacia la VPN: se permiten
  "$ipt" -C DOCKER-USER -i "$IFACE" -m conntrack --ctstate ESTABLISHED,RELATED -j RETURN 2>/dev/null \
    || "$ipt" -I DOCKER-USER -i "$IFACE" -m conntrack --ctstate ESTABLISHED,RELATED -j RETURN
  "$ipt" -C DOCKER-USER "${RULE[@]}" 2>/dev/null || "$ipt" -I DOCKER-USER 2 "${RULE[@]}"
  echo "$ipt: puertos de Docker cerrados a $IFACE"
done
