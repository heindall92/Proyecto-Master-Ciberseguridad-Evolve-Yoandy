FROM kalilinux/kali-rolling

ENV DEBIAN_FRONTEND=noninteractive

# Actualizar índices primero (capa separada para evitar fallos de caché)
RUN apt-get update

# Herramientas de reconocimiento, escaneo y análisis de vulnerabilidades
RUN apt-get install -y --no-install-recommends --fix-missing \
    nmap \
    masscan \
    netdiscover \
    openssh-client \
    sshpass \
    ssh-audit \
    hydra \
    medusa \
    curl \
    wget \
    gobuster \
    dirb \
    netcat-openbsd \
    socat \
    tcpdump \
    traceroute \
    dnsutils \
    whois \
    iputils-ping \
    net-tools \
    iproute2 \
    exploitdb \
    python3 \
    python3-pip \
    git \
    vim \
    nano \
    tmux \
    jq \
    less \
    unzip \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# nikto se instala por separado por incompatibilidades con mirrors regionales
RUN apt-get update && apt-get install -y --no-install-recommends --fix-missing nikto \
    && apt-get clean && rm -rf /var/lib/apt/lists/* || true

# Directorio de trabajo persistente del operador
WORKDIR /root/workspace

# Prompt identificativo y aliases operativos
RUN printf '\n\
# Valhalla SOC — Attacker Node\n\
export PS1="\\[\\033[1;31m\\][KALI-VALHALLA]\\[\\033[0m\\] \\[\\033[1;34m\\]\\w\\[\\033[0m\\] # "\n\
\n\
alias nmap-quick="nmap -sV -sC -T4"\n\
alias nmap-full="nmap -sV -sC -p- -T4"\n\
alias nmap-udp="nmap -sU -sV --top-ports 200"\n\
alias nmap-vuln="nmap -sV --script vuln"\n\
alias scan-cowrie="nmap -sV -sC -p 2222,2223 cowrie"\n\
alias ssh-cowrie="ssh -p 2222 root@cowrie"\n\
alias telnet-cowrie="telnet cowrie 2223"\n\
\n\
echo ""\n\
echo "  VALHALLA SOC — Nodo Atacante | Kali Linux Rolling"\n\
echo "  Honeypot objetivo: cowrie:2222 (SSH) | cowrie:2223 (Telnet)"\n\
echo "  Workspace persistente: /root/workspace"\n\
echo ""\n' >> /root/.bashrc

CMD ["/bin/bash"]
