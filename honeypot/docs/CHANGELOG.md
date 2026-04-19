# 📜 Valhalla SOC — Honeypot — Registro de cambios

Documento que deja constancia de **qué había antes**, **qué se ha creado**, **por qué** y **qué se ha dejado intacto** en el proyecto para hacer el honeypot Cowrie un subproyecto independiente.

> Fecha: 2026-04-19
> Autor del cambio: Santiago (Santi Prada)
> Alcance: carpeta `honeypot/` — ningún fichero preexistente del repo ha sido modificado.

---

## 1. Estado anterior

Antes de este cambio, Cowrie vivía **dentro del `docker-compose.yml` principal** junto con Wazuh Indexer, Manager y Dashboard. Eso implicaba:

- No se podía arrancar el honeypot sin levantar también Wazuh (pesado: ~6 GB de RAM).
- La configuración de Cowrie estaba en `cowrie_config/` a nivel raíz, mezclada con el resto.
- No había documentación específica del honeypot.
- No había scripts de operación ni forma rápida de probarlo.
- El backend FastAPI (pendiente de hacer) no tenía un contrato claro de **cómo** consumir los logs.

### Ficheros que existían antes y que seguimos respetando

```
cowrie_config/cowrie.cfg           ← configuración vieja (todavía usada por el compose principal)
cowrie_config/userdb.txt           ← userdb vieja
docker-compose.yml                 ← compose monolítico que incluye Cowrie + Wazuh
wazuh_config/rules/cowrie_rules.xml
wazuh_config/decoders/cowrie_decoders.xml
```

**Ninguno de estos ficheros ha sido tocado.** El stack monolítico sigue funcionando exactamente igual que antes. El nuevo subproyecto es una alternativa paralela, no un reemplazo.

---

## 2. Qué se ha creado

Carpeta nueva `honeypot/` con todo lo necesario para que Cowrie corra **solo**:

```
honeypot/
├── docker-compose.yml              ← compose standalone (solo Cowrie)
├── Makefile                        ← atajos make up/down/logs/...
├── README.md                       ← visión general + quickstart
├── .env.example                    ← variables (puertos, nombre)
├── .gitignore                      ← ignora logs/, downloads/, tty/, .env
├── push-to-github.ps1              ← helper one-click para Windows
├── cowrie/
│   ├── cowrie.cfg                  ← config propia (output JSON ON, textlog ON)
│   └── userdb.txt                  ← 50+ credenciales señuelo típicas de botnets
├── logs/.gitkeep                   ← carpeta bind-mount para inspección local
├── downloads/.gitkeep              ← payloads capturados
├── tty/.gitkeep                    ← sesiones TTY grabadas
├── scripts/
│   ├── start.sh                    ← docker compose up -d + banner informativo
│   ├── stop.sh                     ← docker compose down (preserva volúmenes)
│   ├── status.sh                   ← estado + health + contador de eventos
│   ├── tail-logs.sh                ← tail -F con formato jq
│   └── test-attack.sh              ← simula fuerza bruta para validar
└── docs/
    ├── MANUAL.md                   ← manual de operación completo
    ├── CHANGELOG.md                ← este documento
    └── VERIFICACION.md             ← procedimiento formal de verificación
```

---

## 3. Detalle de cada fichero

### 3.1 `honeypot/docker-compose.yml`

Compose **standalone** con un único servicio `cowrie`. Puntos clave:

- Imagen `cowrie/cowrie:latest` (misma que el compose principal → cero divergencia).
- Puertos parametrizados por `.env`: `COWRIE_SSH_PORT`, `COWRIE_TELNET_PORT`.
- Volúmenes **nombrados** (`valhalla_cowrie_logs`, `valhalla_cowrie_downloads`, `valhalla_cowrie_tty`): nombres fijos para que el backend los pueda montar con `external: true`.
- Además **bind-mount** a `./logs`, `./downloads`, `./tty` para que seas tú (humano) quien puede inspeccionarlos sin entrar al contenedor.
- Red **`valhalla-net`** con nombre fijo → el backend se une a ella con `external: true`.
- `healthcheck` con `nc -z localhost 2222` cada 30 s.
- Límites de recursos: `512 M` de RAM, `0.5` CPU.
- Logging rotativo: max 3 ficheros de 10 MB por contenedor (evita que el daemon de Docker se llene).

### 3.2 `honeypot/cowrie/cowrie.cfg`

Configuración propia, no se comparte con el `cowrie_config/cowrie.cfg` del root. Decisiones:

- `[output_jsonlog] enabled = true` → **este es el contrato** con el backend.
- `[output_textlog] enabled = true` → para que un humano pueda leerlo con `tail`.
- `hostname = production-server`, banner OpenSSH 8.9p1 Ubuntu → cebo realista.
- `sftp_enabled = true` para capturar también transferencias.
- `forwarding = false` — bloqueamos port-forwarding para no dar al atacante un pivote real.

### 3.3 `honeypot/cowrie/userdb.txt`

Lista extendida (50+) de combinaciones `usuario:contraseña` típicas de:
- **Bots genéricos**: root/123456, admin/admin, test/test…
- **Stacks cloud / dev**: ubuntu/ubuntu, pi/raspberry, postgres/postgres…
- **Cuentas de servicio / CI**: deploy/deploy, git/git, jenkins/jenkins…
- **IoT / routers / cámaras (Mirai-style)**: support/support, service/service…
- Denegaciones explícitas para passwords generados por `openssl` o `pbkdf2` (menos señal útil).

### 3.4 Scripts (`honeypot/scripts/*.sh`)

Envoltorio delgado sobre `docker compose`. Motivo: que alguien que no sepa Docker pueda operar el honeypot desde shell sin tener que memorizar comandos. Todos con:

- `set -euo pipefail` (fail fast).
- Detección automática del directorio del script (portable).
- Mensajes en español porque es un proyecto de máster en España.

### 3.5 `honeypot/Makefile`

Wrapper aún más corto. Para Windows sin Make, los scripts `.sh` siguen funcionando en Git Bash / WSL. Para Windows puro hay `push-to-github.ps1` y los comandos `docker compose` directos documentados en el `MANUAL.md`.

### 3.6 `honeypot/push-to-github.ps1`

Script PowerShell para hacer el **push a GitHub** desde Windows:
1. Borra `.git/index.lock` huérfano si existe (viene del entorno sandbox de este asistente — ver §6).
2. Pone `core.autocrlf=true` para evitar 3000 líneas de ruido por CRLF vs LF.
3. Stagea **solo** `honeypot/` (no arrastra modificaciones fantasma por line-endings en otros ficheros).
4. Hace un commit con mensaje descriptivo.
5. `git push origin main`.

### 3.7 `honeypot/README.md`

Quickstart (arranca en 60 segundos), arquitectura, layout de ficheros, ejemplos de eventos JSON. Para profundizar, enlaza a `docs/MANUAL.md`.

### 3.8 `honeypot/docs/MANUAL.md`

Manual completo de operación: requisitos, configuración, operación diaria, 4 pasos de verificación, troubleshooting, seguridad operacional, integración con backend/Wazuh.

### 3.9 `honeypot/docs/VERIFICACION.md`

Procedimiento formal de verificación — plantilla de tabla para registrar resultados. Útil como entregable académico o auditoría interna.

---

## 4. Cosas que **no** he tocado (intencionalmente)

| Fichero | Por qué no lo toco |
|---|---|
| `docker-compose.yml` (root) | Sigue funcionando como estaba; ofrecemos alternativa, no reemplazo. |
| `cowrie_config/` (root) | Configuración del compose monolítico; cualquier cambio rompería el stack ya operativo. |
| `wazuh_config/` | Reglas/decoders Wazuh que dependen del log actual; siguen válidas. |
| `README.md` del root | Habrá que actualizarlo cuando esté todo (backend incluido). Evito pisarlo ahora. |
| `MANUAL.md` del root | Mismo motivo. |

Cuando quieras, en un commit posterior, añado en el `README.md` raíz una sección "Modo standalone" que apunte a `honeypot/README.md`.

---

## 5. Cómo se ha empujado a GitHub

**No se ha empujado automáticamente desde la sandbox del asistente** porque:

1. Las credenciales de GitHub están en **Windows Credential Manager**, que no es accesible desde el contenedor Linux del asistente.
2. El montaje Windows↔Linux de la sandbox dejó un `.git/index.lock` huérfano que **no se puede borrar** con `rm` desde el lado Linux (permission denied a nivel del driver de mount).

### Solución — una sola línea en PowerShell

Desde `C:\Users\santi\Documents\Valhalla-SOC`:

```powershell
powershell -ExecutionPolicy Bypass -File .\honeypot\push-to-github.ps1
```

Lo que hace ese script está documentado en §3.6. Al terminar, `honeypot/` aparece en [github.com/saantiidp/Valhalla-SOC/tree/main/honeypot](https://github.com/saantiidp/Valhalla-SOC/tree/main/honeypot).

### Alternativa manual

```powershell
cd C:\Users\santi\Documents\Valhalla-SOC
Remove-Item -Force .git\index.lock -ErrorAction SilentlyContinue
git config core.autocrlf true
git add honeypot/
git commit -m "feat(honeypot): stack Cowrie standalone con export JSON"
git push origin main
```

---

## 6. Nota sobre el ruido de line-endings

Al hacer `git status` en el repo aparecen 17 ficheros como "modified" (README.md, docker-compose.yml, etc.) **aunque no se ha tocado ninguno**. Eso es porque los ficheros en disco están con CRLF (Windows) y en el repo están con LF (Linux/GitHub) y el `core.autocrlf` estaba sin configurar.

**No staggeo ninguno de esos ficheros en el commit del honeypot.** Solo se stagea `honeypot/`. Si quieres limpiar ese ruido en otro commit aparte:

```powershell
git config core.autocrlf true
git rm --cached -r .
git reset --hard HEAD
```

O más conservador — crear `.gitattributes` con:

```
* text=auto eol=lf
*.ps1 text eol=crlf
*.bat text eol=crlf
```

y luego `git add --renormalize .` + commit.

---

## 7. Próximos pasos (fuera del alcance de este cambio)

- `backend/` — FastAPI que hace `tail -F cowrie.json`, consulta Ollama y expone la API.
- Tests automatizados del flujo completo (pytest + docker-compose de test).
- Actualizar `README.md` raíz con la nueva sección "Modo standalone".
- CI en GitHub Actions que arranque el honeypot, simule un ataque y verifique los eventos JSON.
