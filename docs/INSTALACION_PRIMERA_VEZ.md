# Instalación en la primera ejecución — Valhalla SOC

Guía para quien **clona el repositorio** y quiere usar la herramienta sin depender del mantenedor para secretos.

**Repositorio:** [github.com/heindall92/Proyecto-Master-Ciberseguridad-Evolve-Yoandy](https://github.com/heindall92/Proyecto-Master-Ciberseguridad-Evolve-Yoandy)

---

## Requisitos

- Docker Desktop (Windows/Mac) o Docker + Compose (Linux)
- Python 3.11+ (solo para el asistente de secretos y scripts auxiliares)
- Node.js 18+ (si ejecuta el frontend fuera de Docker)
- Ollama con el modelo configurado (`ollama pull qwen2.5-coder:7b`)

---

## Paso 1 — Configurar secretos (automático)

**No copie `.env.example` a mano.** Use el asistente:

| Sistema | Comando |
|---------|---------|
| Windows (recomendado) | Doble clic en `setup.bat` o `Valhalla-Runner.bat` |
| Solo secretos | `scripts\setup_env.bat` |
| Linux / macOS / WSL | `chmod +x scripts/setup_env.sh && ./scripts/setup_env.sh` |
| Make | `make setup` |

El asistente:

1. Detecta si falta `.env` o las claves son placeholders.
2. Pide la **contraseña del usuario `admin`** del SOC (Enter = `Valhalla2026!` solo para laboratorio).
3. Genera **SECRET_KEY** y **WEBHOOK_SECRET** automáticamente.
4. Crea `.env` y una copia local `.env.setup-backup` (no se sube a Git).

Guarde las tres claves en un gestor de contraseñas. El login del dashboard es usuario **`admin`** con la contraseña que eligió.

---

## Paso 2 — Levantar el stack

```bash
docker compose --profile labs up -d --build
```

O en Windows: `Valhalla-Runner.bat` (ejecuta el setup y luego Docker + frontend local).

---

## Entrega limpia (sin datos de prueba)

El repositorio **no incluye** tickets, chats ni usuarios de laboratorio. Tras clonar:

- Solo existe el usuario **`admin`** (creado con `ADMIN_PASSWORD`).
- Sin tickets ni mensajes de chat hasta que el analista los cree o sincronice Wazuh manualmente.
- Sin notificaciones precargadas (panel vacío al inicio).

Si en su máquina de desarrollo quedaron datos viejos:

```bash
python scripts/factory_reset_soc.py -y
docker compose up -d backend
```

Instalación **desde cero** (volumen Postgres nuevo):

```bash
docker compose down -v
python scripts/setup_env.py
docker compose --profile labs up -d --build
```

Para poblar tickets desde Wazuh cuando el SIEM ya esté integrado, en `.env`:

```
AUTO_SYNC_WAZUH_TICKETS=true
AUTO_CREATE_WEBHOOK_TICKETS=true
```

---

## Paso 3 — Acceder al dashboard

| Servicio | URL |
|----------|-----|
| Valhalla SOC | http://localhost:3000 |
| API backend | http://localhost:8000 |

Credenciales: **admin** + la contraseña definida en el paso 1.

La sesión usa cookies httpOnly: access (~2 h) y refresh (~7 días). Tras logout los tokens quedan revocados en el servidor.

Si la base de datos ya existía con otra contraseña de admin:

```bash
python scripts/reset_admin.py "SuNuevaContraseñaSegura123"
```

---

## Integración Wazuh → Valhalla

El valor de **WEBHOOK_SECRET** en `.env` debe coincidir con el entorno del manager Wazuh (`WEBHOOK_SECRET` en el contenedor). El script `wazuh_config/integrations/custom-valhalla.py` envía:

- Cabecera `X-Valhalla-Webhook-Token`
- Firma `X-Valhalla-Signature` (HMAC-SHA256 del cuerpo JSON)

---

## Producción

Antes de exponer el SOC a Internet:

1. `ENV=production` en `.env`
2. `SESSION_COOKIE_SECURE=true`
3. `TLS_VERIFY_SSL=true` y opcionalmente `TLS_CA_BUNDLE=/ruta/ca.pem`
4. Rotar credenciales de Postgres/OpenSearch (no usar `valhalla` / `admin` por defecto)
5. Revisar `docs/AUDITORIA_CIBERSEGURIDAD_2026-05-15.md`

---

## Ayuda

- Manual extendido: [`MANUAL.md`](../MANUAL.md)
- Auditoría de seguridad: [`docs/AUDITORIA_CIBERSEGURIDAD_2026-05-15.md`](AUDITORIA_CIBERSEGURIDAD_2026-05-15.md)
