# Instalación en la primera ejecución — Valhalla SOC

> **Actualizada en octubre de 2026.** La versión anterior pedía Node.js 18 y Ollama instalados en el
> equipo, el modelo `qwen2.5-coder:7b` y la consola en `npm run dev` fuera de Docker. Hoy **todo corre
> en Docker** (también la IA, con `qwen2.5:3b-instruct`) y el instalador genera los secretos y los
> certificados de cada instalación.

Guía detallada para quien **clona el repositorio** y quiere dejar Valhalla SOC funcionando sin depender
de nadie para los secretos. Para el uso diario, ver el [manual de usuario](../MANUAL.md).

**Repositorio:** [github.com/heindall92/Proyecto-Master-Ciberseguridad-Evolve-Yoandy](https://github.com/heindall92/Proyecto-Master-Ciberseguridad-Evolve-Yoandy)

---

## Requisitos

| | Necesario |
|---|---|
| Docker | Docker Desktop (Windows/macOS) o Docker Engine con Compose v2 (Linux) |
| Git y Python 3 | Para clonar y para el asistente de secretos (`scripts/setup_env.py`) |
| Hardware | 8 GB de RAM (16 GB recomendados) y 25 GB libres |
| Linux | `vm.max_map_count=262144` para el indexador de Wazuh (ver abajo) |

**No hace falta** instalar Node.js, Ollama ni PostgreSQL en el equipo.

```bash
# Linux: ajuste del indexador (la segunda línea lo hace permanente)
sudo sysctl -w vm.max_map_count=262144
echo "vm.max_map_count=262144" | sudo tee /etc/sysctl.d/99-valhalla.conf
```

---

## Opción A — Instalador (recomendada)

```bash
# Linux / macOS / WSL
git clone https://github.com/heindall92/Proyecto-Master-Ciberseguridad-Evolve-Yoandy.git valhalla-soc
cd valhalla-soc
./install.sh
```

```powershell
# Windows (PowerShell)
git clone https://github.com/heindall92/Proyecto-Master-Ciberseguridad-Evolve-Yoandy.git valhalla-soc
cd valhalla-soc
.\install.ps1
```

| Paso | Qué hace |
|---|---|
| 1/7 | Comprueba Git, Docker (y que el daemon está en marcha) y Python 3 |
| 2/7 | Usa el repositorio clonado (o lo clona/actualiza en `~/Valhalla-SOC`) |
| 3/7 | Genera `.env` con secretos únicos — **no sobrescribe** un `.env` existente |
| 4/7 | Genera los certificados TLS de Wazuh en `config/wazuh_indexer_ssl_certs/` |
| 5/7 | `docker compose --profile labs up -d --build` |
| 6/7 | Espera a que `ollama-init` descargue el modelo de IA (~2 GB la primera vez) |
| 7/7 | Guarda las credenciales del indexador en el keystore del manager (`scripts/wazuh_post_install.sh`) |

| Opción | Linux / macOS | Windows |
|---|---|---|
| Sin atacante ni agente de laboratorio | `NO_LABS=1 ./install.sh` | `.\install.ps1 -NoLabs` |
| Sin esperar al modelo de IA | `SKIP_OLLAMA=1 ./install.sh` | `.\install.ps1 -SkipOllama` |
| Otra carpeta de instalación | `INSTALL_DIR=/ruta ./install.sh` | `.\install.ps1 -InstallDir C:\ruta` |

En el paso 3 el instalador usa el modo no interactivo y la contraseña de `admin` queda en
`Valhalla2026!` (solo laboratorio). Si quieres elegirla tú, ejecuta antes el asistente
(`python3 scripts/setup_env.py`, opción B) y después el instalador: verá que `.env` ya existe y lo
respetará.

---

## Opción B — Paso a paso

Lo mismo que hace el instalador, a mano:

```bash
# 1. Secretos únicos en .env (SECRET_KEY, WEBHOOK_SECRET, ADMIN_PASSWORD, INDEXER_PASSWORD…)
python3 scripts/setup_env.py

# 2. Certificados TLS de Wazuh (no se versionan: cada instalación crea los suyos)
bash scripts/gen_certs.sh

# 3. Stack completo; sin "--profile labs" no se levantan el atacante ni el agente
docker compose --profile labs up -d --build

# 4. Modelo de IA: lo descarga el servicio ollama-init; comprobar que está
docker compose exec ollama ollama list

# 5. Credenciales del indexador en el keystore del manager (inventario de vulnerabilidades)
bash scripts/wazuh_post_install.sh
```

Alternativas para el paso 1: `setup.bat` (Windows, que después arranca todo con `Valhalla-Runner.bat`),
`./scripts/setup_env.sh` o `make setup`.

### Qué genera el asistente de secretos

1. Detecta si falta `.env` o si contiene valores de ejemplo (`change-me…`, `replace-with-real…`).
2. Pide la **contraseña de `admin`** de la consola: mínimo 12 caracteres con mayúsculas, minúsculas y
   números. Enter = `Valhalla2026!`, **solo para un laboratorio**.
3. Genera `SECRET_KEY` y `WEBHOOK_SECRET` aleatorios, una contraseña del indexador compartida por el
   indexador, el manager, su consola y el backend, y otra para la API de Wazuh.
4. Escribe `.env` y una copia de los secretos de la consola en `.env.setup-backup`. **Ninguno de los dos
   se sube a Git.** Pasa la copia a un gestor de contraseñas y bórrala del disco.

---

## Comprobar la instalación

```bash
docker compose ps                           # todos "running" / "healthy" (ollama-init termina y sale)
docker compose logs -f backend              # debe acabar en "Valhalla SOC API Started"
docker compose exec ollama ollama list      # qwen2.5:3b-instruct
```

| Servicio | Dirección | Usuario |
|---|---|---|
| Consola Valhalla SOC | `http://localhost:3000` | `admin` · `ADMIN_PASSWORD` del `.env` |
| API y su documentación | `http://localhost:8000/docs` | sesión de la consola |
| Consola nativa de Wazuh | `https://localhost:5601` | `admin` · `INDEXER_PASSWORD` del `.env` |
| Honeypot (la trampa) | `ssh root@localhost -p 2222` | cualquiera |

Con el perfil `labs` el atacante automático genera actividad en pocos minutos: debe aparecer en
**SIEM** y en **Honeypots**.

---

## Entrega limpia (sin datos de prueba)

El repositorio **no incluye** incidentes, chats ni usuarios de laboratorio. Tras la instalación:

- solo existen `admin` (creado con `ADMIN_PASSWORD`) y el usuario de sistema de la IA (`valhalla-ia`);
- hay 5 monitores de detección y 20 runbooks de serie;
- no se crean incidentes automáticamente hasta que lo actives.

Para que Wazuh abra incidentes solo, en `.env`:

```
AUTO_SYNC_WAZUH_TICKETS=true
AUTO_CREATE_WEBHOOK_TICKETS=true
```

Si en una máquina de desarrollo quedaron datos viejos:

```bash
make factory-reset                       # conserva admin, monitores, runbooks y ajustes
```

Instalación **desde cero** (borra todos los volúmenes, incluida la base de datos):

```bash
docker compose --profile labs down -v
python3 scripts/setup_env.py --force
docker compose --profile labs up -d --build
```

---

## Si algo falla

| Síntoma | Solución |
|---|---|
| El indexador se reinicia en bucle | Falta `vm.max_map_count=262144` (Linux). |
| `.env ya existe — no se sobreescribe` y quieres regenerarlo | Solo en una instalación **desde cero** (abajo): `--force` crea también contraseñas nuevas de PostgreSQL y del indexador, que no coincidirían con los volúmenes ya creados. Para cambiar solo la de `admin`, usa `reset_admin.py`. |
| No entra con `admin` | `ADMIN_PASSWORD` solo se aplica al **crear** el usuario. Para cambiarla: `docker compose exec backend python /opt/valhalla-scripts/reset_admin.py` (la pide sin mostrarla). |
| El modelo no aparece | `docker compose exec ollama ollama pull qwen2.5:3b-instruct` |
| Fallo en el paso 7/7 | El manager aún arrancaba: repite `bash scripts/wazuh_post_install.sh` en un par de minutos. |
| `ENV=production` y la API no arranca | Es intencionado: en producción la API se niega a arrancar sin usuario `admin` ni `ADMIN_PASSWORD`. |

---

## Integración Wazuh → Valhalla

`WEBHOOK_SECRET` en `.env` es el mismo valor que recibe el manager de Wazuh. El script
`wazuh_config/integrations/custom-valhalla.py` envía cada alerta a `/api/webhook/wazuh` con:

- la cabecera `X-Valhalla-Webhook-Token`, y
- la firma `X-Valhalla-Signature` (HMAC-SHA256 del cuerpo JSON).

Una petición sin el secreto o con la firma incorrecta se rechaza (requisito RF-05, con prueba automática).

---

## Producción

Antes de exponer el SOC fuera del laboratorio:

1. `ENV=production` y `SESSION_COOKIE_SECURE=true` en `.env`.
2. `TLS_VERIFY_SSL=true` y, si la CA de Wazuh no es pública, `TLS_CA_BUNDLE=/ruta/ca.pem`.
3. Contraseña de `admin` propia (no `Valhalla2026!`) y secretos regenerados.
4. Gateway HTTPS: `docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile prod up -d --build`
   (puerto 8443), o acceso por VPN con Tailscale (ver el [README](../README.md#arranque-rápido)).
5. Revisar [`SECURITY.md`](../SECURITY.md) y la [auditoría de ciberseguridad](AUDITORIA_CIBERSEGURIDAD_2026-05-15.md).

---

## Ayuda

- Manual de usuario: [`MANUAL.md`](../MANUAL.md)
- Acceso, roles y sesión: [`docs/MANUAL_ACCESO.md`](MANUAL_ACCESO.md)
- Seguridad: [`SECURITY.md`](../SECURITY.md)
