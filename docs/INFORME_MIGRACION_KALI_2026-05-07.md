# Valhalla SOC — Informe de Migración e Integración del Nodo Atacante
**Fecha:** 2026-05-07  
**Responsable:** Claude Code (Anthropic) + svisomar  
**Rama:** `main` | **Commit final:** `3c80ee8`

---

## Resumen Ejecutivo

En esta sesión se realizaron dos grandes bloques de trabajo:

1. **Migración del stack Docker** desde la instalación anterior en `E:\Valhalla-SOC-main\` al repositorio clonado en `C:\Users\sviso\Downloads\Evolve\Valhalla SOC\Valhalla-SOC\`, preservando todos los volúmenes nombrados (datos Wazuh, modelos Ollama, PostgreSQL).

2. **Configuración persistente del nodo atacante Kali Linux**, incluyendo Dockerfile propio con herramientas de pentesting, volumen persistente de workspace y capacidades de red necesarias para nmap.

---

## Bloque 1 — Migración del Stack Docker

### Problema inicial
El stack anterior corría bajo el proyecto Docker `valhalla-soc-main` desde `E:\Valhalla-SOC-main\`. Al clonar el repositorio en la nueva ruta, los contenedores quedaron en estado inconsistente (el frontend reiniciaba con exit 254 por `ENOENT: /app/package.json`).

### Solución: preservación de volúmenes
Se usó el flag `-p valhalla-soc-main` para que el nuevo proyecto docker-compose reutilizara los volúmenes nombrados existentes:

```bash
docker compose -p valhalla-soc-main up -d
```

Esto preservó:
- `valhalla-soc-main_wazuh-indexer-data` — índices SIEM
- `valhalla-soc-main_ollama` — modelos Ollama descargados
- `valhalla-soc-main_wazuh-manager-data` — datos del manager Wazuh

### Generación de certificados SSL
Los certificados TLS estaban vacíos tras el clone. Se generaron con `wazuh-certs-tool.sh` dentro de un contenedor Ubuntu:22.04:

```bash
docker run --rm -v "$PWD:/repo" ubuntu:22.04 bash -c "
  apt-get update && apt-get install -y openssl curl &&
  cd /repo &&
  sed -i 's/\r//' wazuh-certs-tool.sh &&
  bash wazuh-certs-tool.sh -A
"
```

**Nota CRLF:** El script clonado en Windows tenía terminaciones `\r\n`. Se normalizó con `sed -i 's/\r//'` dentro del contenedor Linux.

Certificados generados en `config/wazuh_indexer_ssl_certs/`:
- `root-ca.pem` / `root-ca.key`
- `admin.pem` / `admin-key.pem`
- `wazuh.indexer.pem` / `wazuh.indexer-key.pem`
- `wazuh.manager.pem` / `wazuh.manager-key.pem`
- `wazuh.dashboard.pem` / `wazuh.dashboard-key.pem`

### Reset de PostgreSQL
El volumen `pgdata` anterior tenía credenciales de la instalación vieja (`E:\`). Se eliminó y recreó:

```bash
docker volume rm valhalla-soc-main_pgdata
docker compose -p valhalla-soc-main up -d postgres
```

### Estado final del stack (8/8 contenedores UP)
| Contenedor | Puerto | Estado |
|---|---|---|
| wazuh.indexer | 9200 | ✅ Running |
| wazuh.manager | 1514, 1515, 514/udp, 55000 | ✅ Running |
| wazuh.dashboard | 443 | ✅ Running |
| valhalla-cowrie | 2222, 2223 | ✅ Running |
| postgres | 5432 | ✅ Running |
| ollama | 11434 | ✅ Running |
| backend | 8000 | ✅ Running |
| dashboard (frontend) | 3000 | ✅ Running |

---

## Bloque 2 — Nodo Atacante Kali Linux

### Motivación
El servicio `attacker` en el compose original usaba directamente `image: kalilinux/kali-rolling` sin herramientas de pentesting, sin volumen persistente y sin las capacidades de red necesarias para nmap.

### Dockerfile creado: `attacker/Dockerfile`

```dockerfile
FROM kalilinux/kali-rolling
ENV DEBIAN_FRONTEND=noninteractive

# Layer separada para evitar problemas de caché
RUN apt-get update

# Herramientas principales de pentesting
RUN apt-get install -y --no-install-recommends --fix-missing \
    nmap masscan netdiscover openssh-client sshpass ssh-audit \
    hydra medusa curl wget gobuster dirb netcat-openbsd socat \
    tcpdump traceroute dnsutils whois iputils-ping net-tools \
    iproute2 exploitdb python3 python3-pip git vim nano tmux jq less unzip \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# nikto separado — bloqueado por mirrors regionales en algunos entornos
RUN apt-get update && apt-get install -y --no-install-recommends --fix-missing nikto \
    && apt-get clean && rm -rf /var/lib/apt/lists/* || true

WORKDIR /root/workspace

# Prompt y aliases operativos
RUN printf '...' >> /root/.bashrc

CMD ["/bin/bash"]
```

**Por qué layers separadas para apt-get update:** Kali usa mirrors rotativos; si update y install van en la misma capa cacheada, se pueden instalar paquetes con índices obsoletos.

**Por qué `--fix-missing`:** El mirror `mirror.raiolanetworks.com` retornó error 499 (bloqueo antivirus) para el paquete `nikto`. El flag permite continuar si algún paquete falla en la descarga.

**Por qué `nikto || true`:** Se instala en capa opcional para que un fallo de mirror no rompa todo el build.

### Cambios en docker-compose.yml

```yaml
attacker:
  build:
    context: ./attacker
    dockerfile: Dockerfile
  image: valhalla-attacker:latest
  container_name: valhalla-attacker
  hostname: attacker
  tty: true
  stdin_open: true
  command: /bin/bash
  restart: unless-stopped
  profiles: ["labs"]           # Opt-in: no arranca con up normal
  volumes:
    - attacker-home:/root/workspace   # Workspace persistente
  cap_add:
    - NET_ADMIN
    - NET_RAW                  # Necesario para raw sockets de nmap
  networks:
    - valhalla-net

volumes:
  attacker-home:               # Añadido a la sección de volúmenes
```

**Por qué `cap_add: NET_RAW`:** nmap usa raw sockets para SYN scans. Sin esta capability el kernel rechaza la operación con "Operation not permitted".

**Por qué `profiles: ["labs"]`:** El nodo atacante es opcional para simulaciones. Con profiles hay que activarlo explícitamente: `docker compose --profile labs up -d attacker`.

### Build y despliegue

```bash
# Build sin caché para evitar layers obsoletas
docker build --no-cache -t valhalla-attacker:latest ./attacker

# Recrear contenedor con nuevo compose
docker compose -p valhalla-soc-main --profile labs up -d attacker
```

### Verificación de herramientas instaladas
```
Nmap version 7.99 ( https://nmap.org )
OpenSSH_10.2p1 Debian-3, OpenSSL 3.4.1
Hydra v9.6
searchsploit — disponible via exploitdb
```

---

## Bloque 3 — Monitorización de Logs Cowrie

### Problema: Cowrie no tiene shell
El contenedor `cowrie/cowrie:latest` usa Python/Twisted como entrypoint. No tiene `/bin/bash`, `busybox`, ni `tail`. No es posible ejecutar comandos de sistema.

### Solución: Python scripts inyectados via `docker cp`

**`tail_f.py`** — Sigue `cowrie.json` (formato JSON por evento):
```python
import time, sys
LOG = '/cowrie/cowrie-git/var/log/cowrie/cowrie.json'
with open(LOG, 'r') as f:
    content = f.read()
    if content:
        sys.stdout.write(content); sys.stdout.flush()
    f.seek(0, 2)
    while True:
        line = f.readline()
        if line: sys.stdout.write(line); sys.stdout.flush()
        else: time.sleep(0.2)
```

**`tail_cowrie_log.py`** — Sigue `cowrie.log` (formato texto legible):
```python
LOG = '/cowrie/cowrie-git/var/log/cowrie/cowrie.log'
# misma lógica de seguimiento
```

**Inyección y ejecución:**
```bash
docker cp tail_f.py valhalla-cowrie:/tmp/tail_f.py
docker exec -it valhalla-cowrie /cowrie/cowrie-env/bin/python3 /tmp/tail_f.py
```

---

## Problemas Encontrados y Soluciones

| Problema | Causa | Solución |
|---|---|---|
| Frontend exit 254 (ENOENT package.json) | Contenedores apuntando a `E:\` antigua | `docker compose down` en proyecto viejo, arrancar nuevo con mismo `-p` |
| Indexer/Dashboard crash (cert not found) | `config/wazuh_indexer_ssl_certs/` vacío tras clone | Generar certs con `wazuh-certs-tool.sh` en contenedor Ubuntu |
| Script wazuh-certs-tool.sh falla en Linux | CRLF en fichero clonado en Windows | `sed -i 's/\r//'` antes de ejecutar |
| PostgreSQL auth failure | Volumen `pgdata` con credenciales de instalación anterior | `docker volume rm` + recrear |
| nmap "Operation not permitted" | Falta de raw socket capabilities | `cap_add: NET_ADMIN, NET_RAW` en compose |
| Build Kali falla (nikto 499 antivirus) | Mirror español bloqueado por antivirus | `--fix-missing` + layer separada con `|| true` |
| `docker run -w /repo` falla en Git Bash | Git Bash mangling de rutas absolutas (`/repo` → `C:/Program Files/Git/repo`) | Usar PowerShell para comandos Docker con rutas absolutas |
| Cowrie: "exec /bin/bash: no such file" | Imagen minimal sin shell | Scripts Python + `docker cp` + `python3` como entrypoint |

---

## Aliases del Nodo Atacante

| Alias | Comando expandido |
|---|---|
| `nmap-quick` | `nmap -sV -sC -T4` |
| `nmap-full` | `nmap -sV -sC -p- -T4` |
| `nmap-udp` | `nmap -sU -sV --top-ports 200` |
| `nmap-vuln` | `nmap -sV --script vuln` |
| `scan-cowrie` | `nmap -sV -sC -p 2222,2223 cowrie` |
| `ssh-cowrie` | `ssh -p 2222 root@cowrie` |
| `telnet-cowrie` | `telnet cowrie 2223` |

---

## Estructura de Ficheros Relevantes

```
Valhalla-SOC/
├── attacker/
│   └── Dockerfile              ← NUEVO — imagen Kali pentesting
├── config/
│   └── wazuh_indexer_ssl_certs/  ← Certificados TLS generados
│       ├── root-ca.pem
│       ├── admin.pem / admin-key.pem
│       ├── wazuh.indexer.pem / wazuh.indexer-key.pem
│       ├── wazuh.manager.pem / wazuh.manager-key.pem
│       └── wazuh.dashboard.pem / wazuh.dashboard-key.pem
└── docker-compose.yml          ← MODIFICADO — attacker build + caps + volume
```

Scripts auxiliares (en raíz del workspace, no en repo):
- `tail_f.py` — tail -f para cowrie.json
- `tail_cowrie_log.py` — tail -f para cowrie.log

---

## Comandos de Operación

```bash
# Arrancar todo el stack (sin attacker)
docker compose -p valhalla-soc-main up -d

# Arrancar también el nodo atacante
docker compose -p valhalla-soc-main --profile labs up -d attacker

# Acceder al Kali atacante
docker exec -it valhalla-attacker bash

# Seguir logs de Cowrie (JSON)
docker cp tail_f.py valhalla-cowrie:/tmp/tail_f.py
docker exec -it valhalla-cowrie /cowrie/cowrie-env/bin/python3 /tmp/tail_f.py

# Seguir logs de Cowrie (texto)
docker cp tail_cowrie_log.py valhalla-cowrie:/tmp/tail_cowrie_log.py
docker exec -it valhalla-cowrie /cowrie/cowrie-env/bin/python3 /tmp/tail_cowrie_log.py

# Dashboard Wazuh
# https://localhost — admin / SecretPassword (ver credenciales.txt)

# Frontend custom Valhalla
# http://localhost:3000
```

---

## Commit del Trabajo

```
3c80ee8  feat(attacker): add Dockerfile with pentesting tools and persistent workspace
```

**Ficheros incluidos en el commit:**
- `attacker/Dockerfile` — nuevo
- `docker-compose.yml` — modificado (build context, cap_add, attacker-home volume)
