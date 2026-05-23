#!/bin/bash
# ═══════════════════════════════════════════════════════════
#  Valhalla SOC — Entrypoint del agente Wazuh Linux
#  Apunta al manager, se auto-enrola (authd) y arranca el agente.
# ═══════════════════════════════════════════════════════════
set -e

MANAGER="${WAZUH_MANAGER:-wazuh.manager}"
AGENT_NAME="${WAZUH_AGENT_NAME:-valhalla-linux-01}"
OSSEC_CONF="/var/ossec/etc/ossec.conf"

# Asegurar la dirección del manager en la config
if grep -q "<address>" "$OSSEC_CONF"; then
  sed -i "s|<address>.*</address>|<address>${MANAGER}</address>|" "$OSSEC_CONF"
fi

# Definir el comando firewall-drop en el agente para que execd pueda ejecutarlo
# cuando el manager dispare el Active Response (cierra la propagación de AR al agente).
if ! grep -q "<name>firewall-drop</name>" "$OSSEC_CONF"; then
  sed -i '0,/<ossec_config>/s||<ossec_config>\n  <command>\n    <name>firewall-drop</name>\n    <executable>firewall-drop</executable>\n    <timeout_allowed>yes</timeout_allowed>\n  </command>|' "$OSSEC_CONF"
  echo "[valhalla-agent] Comando firewall-drop definido en ossec.conf"
fi

# Enrolar si aún no hay clave de agente
if [ ! -s /var/ossec/etc/client.keys ]; then
  echo "[valhalla-agent] Enrolando '${AGENT_NAME}' en ${MANAGER}..."
  for i in $(seq 1 30); do
    if /var/ossec/bin/agent-auth -m "${MANAGER}" -A "${AGENT_NAME}" 2>/var/ossec/logs/agent-auth.log; then
      echo "[valhalla-agent] Enrolamiento OK"
      break
    fi
    echo "[valhalla-agent] Manager no disponible aún, reintento ${i}/30..."
    sleep 5
  done
fi

# Arrancar el agente
/var/ossec/bin/wazuh-control start || true

# Mantener el contenedor vivo siguiendo el log
exec tail -f /var/ossec/logs/ossec.log
