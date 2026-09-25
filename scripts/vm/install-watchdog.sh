#!/usr/bin/env bash
# Instala el vigilante de recursos (systemd timer cada 5 min) y la rotación de
# logs de Docker. Ejecutar en el host Linux del stack:  sudo bash scripts/vm/install-watchdog.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"

install -m 0755 "$here/valhalla-watchdog.sh" /usr/local/bin/valhalla-watchdog

cat > /etc/systemd/system/valhalla-watchdog.service <<'EOF'
[Unit]
Description=Valhalla SOC - vigilante de disco, RAM y contenedores
After=docker.service

[Service]
Type=oneshot
ExecStart=/usr/local/bin/valhalla-watchdog
Nice=10
EOF

cat > /etc/systemd/system/valhalla-watchdog.timer <<'EOF'
[Unit]
Description=Ejecuta el vigilante de Valhalla SOC cada 5 minutos

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
AccuracySec=30s

[Install]
WantedBy=timers.target
EOF

# Rotación de logs de todos los contenedores (evita que el disco crezca sin límite)
if [ ! -f /etc/docker/daemon.json ]; then
  cat > /etc/docker/daemon.json <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "20m", "max-file": "3" }
}
EOF
  echo "daemon.json creado: se aplica a los contenedores que se (re)creen."
fi

systemctl daemon-reload
systemctl enable --now valhalla-watchdog.timer
/usr/local/bin/valhalla-watchdog
echo "Vigilante instalado. Estado: $(cat /var/log/valhalla/watchdog-status.json)"
