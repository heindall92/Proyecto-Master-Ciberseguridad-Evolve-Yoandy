# ═══════════════════════════════════════════════════════════
#  Valhalla SOC — Agente Wazuh Linux (Fase 2)
#  Wazuh no publica imagen oficial del agente; la construimos.
# ═══════════════════════════════════════════════════════════
FROM ubuntu:22.04

ARG WAZUH_VERSION=4.9.2-1
ENV DEBIAN_FRONTEND=noninteractive

# Repo Wazuh + agente + utilidades (iptables para Active Response, auditd para detección host)
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl gnupg2 ca-certificates lsb-release iptables procps audispd-plugins && \
    curl -fsSL https://packages.wazuh.com/key/GPG-KEY-WAZUH | gpg --no-default-keyring --keyring gnupg-ring:/usr/share/keyrings/wazuh.gpg --import && \
    chmod 644 /usr/share/keyrings/wazuh.gpg && \
    echo "deb [signed-by=/usr/share/keyrings/wazuh.gpg] https://packages.wazuh.com/4.x/apt/ stable main" > /etc/apt/sources.list.d/wazuh.list && \
    apt-get update && \
    WAZUH_MANAGER="wazuh.manager" apt-get install -y wazuh-agent=${WAZUH_VERSION} && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
