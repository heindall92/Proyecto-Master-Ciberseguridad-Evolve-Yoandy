# ✅ Valhalla SOC — Honeypot — Procedimiento de verificación

Plantilla de test formal para validar que el honeypot funciona correctamente. Útil como entregable para el máster y como auditoría interna antes de exponer el honeypot a internet.

> **Cómo usar esta plantilla:** ejecuta cada paso, rellena la columna "Resultado" con la evidencia real (captura, salida de comando, o ✓/✗), y al final firma abajo.

---

## Información del entorno

| Campo | Valor |
|---|---|
| Fecha de la prueba | |
| Máquina / hostname | |
| Docker version | `docker --version` → |
| Docker Compose version | `docker compose version` → |
| Puerto SSH del honeypot | 2222 (por defecto) |
| Puerto Telnet del honeypot | 2223 (por defecto) |
| Persona que verifica | |

---

## TC-01 · Imagen Docker disponible

| Campo | Valor |
|---|---|
| Precondición | Docker daemon corriendo |
| Acción | `docker pull cowrie/cowrie:latest` |
| Resultado esperado | Descarga completa, exit code 0 |
| **Resultado obtenido** | |

---

## TC-02 · Stack arranca sin errores

| Campo | Valor |
|---|---|
| Precondición | Estar en `honeypot/` |
| Acción | `docker compose up -d` o `make up` |
| Resultado esperado | Contenedor `valhalla-cowrie` en estado `Up`. Sin errores en `docker compose logs cowrie`. |
| **Resultado obtenido** | |

---

## TC-03 · Healthcheck pasa

| Campo | Valor |
|---|---|
| Precondición | TC-02 OK. Esperar 30–60 s desde el arranque (hay `start_period`). |
| Acción | `docker inspect -f '{{.State.Health.Status}}' valhalla-cowrie` |
| Resultado esperado | `healthy` |
| **Resultado obtenido** | |

---

## TC-04 · Puerto SSH (2222) escucha

| Campo | Valor |
|---|---|
| Acción (Linux) | `ss -tlnp \| grep :2222` |
| Acción (Windows) | `Test-NetConnection localhost -Port 2222` |
| Resultado esperado | Puerto en estado LISTEN, `TcpTestSucceeded: True` |
| **Resultado obtenido** | |

---

## TC-05 · Puerto Telnet (2223) escucha

| Campo | Valor |
|---|---|
| Acción (Linux) | `ss -tlnp \| grep :2223` |
| Acción (Windows) | `Test-NetConnection localhost -Port 2223` |
| Resultado esperado | Puerto en estado LISTEN |
| **Resultado obtenido** | |

---

## TC-06 · Banner SSH engañoso

| Campo | Valor |
|---|---|
| Acción | `nc localhost 2222` (Enter, luego Ctrl-C) |
| Resultado esperado | Recibes una línea tipo `SSH-2.0-OpenSSH_8.9p1 Ubuntu-3ubuntu0.6` |
| **Resultado obtenido** | |

---

## TC-07 · Login con credencial débil es aceptado

| Campo | Valor |
|---|---|
| Acción | `ssh -p 2222 -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null root@localhost` → password: `123456` |
| Resultado esperado | Prompt de shell: `root@production-server:~#` |
| **Resultado obtenido** | |

---

## TC-08 · Login con credencial fuerte es rechazado

| Campo | Valor |
|---|---|
| Acción | `ssh -p 2222 root@localhost` → password: `Tr0ubador!_random_9281` |
| Resultado esperado | Login denegado tras 3 intentos |
| **Resultado obtenido** | |

---

## TC-09 · Shell falsa responde a comandos

Dentro de la sesión SSH de TC-07:

| Comando | Esperado |
|---|---|
| `uname -a` | `Linux production-server 5.15.0-91-generic …` |
| `id` | `uid=0(root) gid=0(root) groups=0(root)` |
| `ls /` | `bin boot dev etc home …` |
| `cat /etc/passwd` | Lista de usuarios falsos |
| `wget http://example.com/x.sh` | Queda registrado aunque no descargue nada útil |

**Resultado obtenido:**

---

## TC-10 · Los eventos llegan a `cowrie.json`

| Campo | Valor |
|---|---|
| Acción | `tail -n 20 logs/cowrie.json \| jq .eventid` |
| Resultado esperado | Aparecen (al menos) `cowrie.session.connect`, `cowrie.login.success`, `cowrie.command.input`, `cowrie.session.closed` |
| **Resultado obtenido** | |

Copia aquí un ejemplo real de evento:

```json
```

---

## TC-11 · Counter de eventos crece con tráfico

| Acción | Valor obtenido |
|---|---|
| `wc -l logs/cowrie.json` antes de TC-07 | |
| `wc -l logs/cowrie.json` después de TC-07 | |
| Diferencia | **Debe ser > 5** |

---

## TC-12 · `make test` ejecuta una fuerza bruta simulada

| Campo | Valor |
|---|---|
| Acción | `make test` |
| Resultado esperado | 5 intentos registrados en el JSON, mezcla de `login.success` y `login.failed` |
| **Resultado obtenido** | |

---

## TC-13 · Persistencia de logs ante reinicio

| Paso | Acción | Esperado |
|---|---|---|
| 1 | `wc -l logs/cowrie.json` (anotar N) | N |
| 2 | `make restart` | OK |
| 3 | `wc -l logs/cowrie.json` | ≥ N (no se pierde nada) |

**Resultado obtenido:** N antes = , N después =

---

## TC-14 · Stop limpio

| Campo | Valor |
|---|---|
| Acción | `make down` |
| Resultado esperado | Contenedor para, volúmenes permanecen (`docker volume ls` incluye `valhalla_cowrie_logs`) |
| **Resultado obtenido** | |

---

## TC-15 · Bind-mount local refleja los logs

| Campo | Valor |
|---|---|
| Acción | `ls -la logs/ && ls -la downloads/` |
| Resultado esperado | `logs/cowrie.json` existe y tiene contenido |
| **Resultado obtenido** | |

---

## Resumen

| Test | Estado |
|---|---|
| TC-01 | ☐ OK ☐ KO |
| TC-02 | ☐ OK ☐ KO |
| TC-03 | ☐ OK ☐ KO |
| TC-04 | ☐ OK ☐ KO |
| TC-05 | ☐ OK ☐ KO |
| TC-06 | ☐ OK ☐ KO |
| TC-07 | ☐ OK ☐ KO |
| TC-08 | ☐ OK ☐ KO |
| TC-09 | ☐ OK ☐ KO |
| TC-10 | ☐ OK ☐ KO |
| TC-11 | ☐ OK ☐ KO |
| TC-12 | ☐ OK ☐ KO |
| TC-13 | ☐ OK ☐ KO |
| TC-14 | ☐ OK ☐ KO |
| TC-15 | ☐ OK ☐ KO |

**Veredicto:** ☐ Apto para integración con backend ☐ Requiere correcciones (ver anexo)

Firma: ________________________ Fecha: __________
