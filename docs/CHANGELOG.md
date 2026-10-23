# Changelog — Valhalla SOC

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

---

## [Sin publicar] — 2026-10-23 — Backend por módulos

### 🧱 Arquitectura
- **`backend/app/main.py` pasa de 3.449 a ~90 líneas**: solo crea la app, aplica el middleware y une los routers.
- **`routers/`**: los 110 endpoints, agrupados por dominio (auth, users, incidents, siem, intel, reports, chat, settings), con las mismas rutas y nombres (comprobado contra la tabla de rutas anterior).
- **`services/`**: lógica compartida (incidentes y monitores, firewall, invitaciones, claves de API, IA del chat, informes, tareas en segundo plano); `realtime.py`, `startup.py`, `migrations.py`, `middlewares.py` y `limits.py` aparte.
- El código se movió sin reescribirlo (división automática por el árbol sintáctico) y la suite pasa igual: **62/62**.

### 🧹 Repositorio
- **Eliminados** los scripts sueltos que nada usaba (`create_dashboards.py`, `setup_monitors.py`, `setup_reports.py`, `backend/check_cowrie_status.py`, `scripts/verify_local_stack.py`, `scripts/purge_backend_probes.py`, `scripts/backup_db.ps1`), `docs/historico/` (informes y planes antiguos; siguen en el historial de git) `honeypot/`, la copia autónoma de Cowrie (el SOC usa `cowrie_config/`), e `integrations/hermes/`, la integración con el agente Hermes, que no llegó a usarse.
- **Dependencias**: Pillow 13.0.0, certifi 2026.10.19, vite y DOMPurify parcheados por avisos nuevos de `pip-audit` y `npm audit`.

---

## [Sin publicar] — 2026-10-01 — Integración continua, tipos a cero y documentación al día

### 🔁 Integración continua
- **Nuevo** `.github/workflows/ci.yml` en cada *push* y *pull request*: lint de errores graves (ruff) y pytest del backend con la matriz de trazabilidad en el resumen del job; tipos, pruebas y build de la consola; `pip-audit` y `npm audit`; build de las imágenes Docker del backend y del gateway. La auditoría se repite cada lunes.
- **Eliminado** `security.yml`: ejecutaba `tests/test_security.py`, que ya no existía.

### 🧪 Pruebas
- **Backend: 57 → 62.** Nueva `test_lifespan.py` (arranque idempotente, producción sin admin no arranca, apagado que no pierde auditorías, tarea colgada que no bloquea, proxies de confianza tras encender la máquina). La prueba de logout ahora reutiliza la cookie «robada» desde otro cliente (antes pasaba aunque no se revocara nada).
- **Consola: 0 → 56** con Vitest y Testing Library (`npm test`): saneado XSS, cliente de la API (CSRF, una sola renovación de sesión concurrente), stores, `HoldButton`, avisos y privacidad (sin recursos de terceros).

### 🛠️ Correcciones
- **Tipos:** 3 → 0 errores de `tsc` (`rank` → `security_rank` en el modo sin conexión; `lang` sobrante en Honeypots y Runbooks).
- **FastAPI:** `@app.on_event("startup")` (obsoleto) → `lifespan`, con apagado ordenado: cancela la sincronización con Wazuh, da 5 s a las tareas pendientes (auditoría) y cierra el pool de la BD. Las tareas en segundo plano guardan referencia (asyncio podía recolectarlas a medias).
- **IP real:** la caché de proxies de confianza quedaba vacía 5 minutos tras encender la máquina.
- **Chat:** dejaba de mutilar mensajes con `<`/`>`; elimina caracteres bidi («Trojan Source»).
- **Traducción de alertas:** fallaba con descripciones con paréntesis (se construía un `RegExp` sin escapar).
- **Informes en el menú:** ya no se ofrecen al reportero ni al lector, a los que el backend responde 403.
- **Login:** «¿Primera vez? Ver manual» abría otra copia de la consola; ahora abre el manual.
- **Gateway:** la CSP de nginx bloqueaba el script de arranque y los estilos inline.

### 🔒 Seguridad y privacidad
- **Fuentes autoalojadas** (`@fontsource`, OFL-1.1): la consola ya no pide nada a Google Fonts; CSP sin dominios de Google.
- **PyJWT** 2.13.0 → 2.15.1 y **urllib3** 2.7.0 → 2.8.0 (CVE publicadas tras la revisión del 26/09).
- **Dockerfiles del gateway** (`nginx/Dockerfile`, `frontend/Dockerfile.prod`): Node 22 LTS y `npm ci` con lockfile.
- `reset_admin.py` pide la contraseña sin eco si no se pasa como argumento.

### 📝 Documentación
- `MANUAL.md` 2.0, `docs/INSTALACION_PRIMERA_VEZ.md` y `docs/MANUAL_ACCESO.md` reescritos según el producto actual (ya no `admin/admin`, Ollama en el host ni Node 18).
- README, SECURITY.md, THIRD_PARTY_NOTICES.md, requisitos, matriz de trazabilidad y memoria (PDF y Word) regenerados con las cifras nuevas.

---

## [0.1.0] — 2026-05-01 — Fase 0: Higienización del Repositorio

### 🔒 Seguridad
- **Eliminado** `credenciales.txt` con contraseñas en texto plano.
- **Eliminadas** credenciales visibles (`admin / Valhalla2026!`) del formulario de login (`AppCore.tsx`).
- **Creado** `.env.example` con todas las variables de entorno requeridas.
- **Hardening** `backend/app/settings.py`: migración a `pydantic-settings` con validación `RuntimeError` si faltan secretos en producción.
- **Actualizado** `.gitignore` para excluir `.env`, backups, caches, y archivos sensibles.

### 🧹 Limpieza de Código
- **Eliminado** `frontend/app/src/ui/DashboardTest.tsx` (componente muerto).
- **Consolidados** endpoints duplicados en `backend/app/main.py`:
  - `GET /api/agents` — fusionados en uno solo con campos `version` + `lastKeepAlive`.
  - `DELETE /api/tickets/{id}` — eliminada la versión sin protección `admin`.
  - Eliminadas 3 rutas de agentes duplicadas (`packages`, `ports`, `vulnerabilities`).

### 📝 Logging
- **Creado** logger centralizado del frontend (`frontend/app/src/lib/logger.ts`).
  - Silencia automáticamente `console.*` en builds de producción (`import.meta.env.DEV`).
- **Migrados** todos los `console.log/warn/error` en **12 archivos** del frontend:
  - `AppCore.tsx`, `AnalystWorkspace.tsx`, `audio.ts`
  - `DashboardSuperFinal.tsx`, `UsersView.tsx`, `ThreatMapView.tsx`
  - `ThreatIntelView.tsx`, `SiemView.tsx`, `RunbooksView.tsx`
  - `LSAMonitorView.tsx`, `CowrieView.tsx`, `AssetsView.tsx`
  - `reportApi.ts`

### 🛠️ DevOps
- **Creado** `Makefile` con comandos: `dev`, `lint`, `fmt`, `test`, `clean`, `install`.
- **Creado** `.pre-commit-config.yaml` con hooks: trailing whitespace, ruff (lint+format), detect-secrets, private-key scanner.

### 🔀 UX
- Placeholder "CONSTRUCCIÓN EN PROCESO" reemplazado por pantalla 404 profesional con botón de retorno.
- Enlace de login redirige a manual en lugar de mostrar credenciales.

---

## [Unreleased] — 2026-05-15

### Documentación
- **Nuevo** `docs/historico/AUDITORIA_CIBERSEGURIDAD_2026-05-15.md` — auditoría OWASP/API (hallazgos críticos a altos).
- **Nuevo** `docs/historico/INFORME_MEJORAS_UI_TEMAS_2026-05-15.md` — multitema, formularios, threat map, runbooks, honeypot.

### UI / UX
- Sistema multitema GREEN / CYAN / AMBER / PURPLE en modo oscuro y claro (`light-theme-overrides.css`).
- Formularios y modales alineados al esquema activo (fix bordes/hover verdes en CYAN+).
- Workspace: modal crear incidente, drawer, filtros y stats con clases HUD.
- Intro cinemática, Cowrie, Threat Map, SIEM i18n, Monitores, Perfil — cohesionados al HUD.

### Backend / Ops
- Threat map geo desde OpenSearch; seed de runbooks; sync alertas Wazuh.
- Contenedor atacante Kali (`attack-loop.sh`, perfil `labs` en compose).

### Seguridad (pendiente remediación)
- Ver informe ciber — Fase 1: auth en LSA/webhook/WS, admin bootstrap, offline mode.

---

## [Unreleased] — Fase 1: Hardening de Backend

### Planeado
- Migración de `print()` a `structlog` en `backend/app/main.py`.
- Implementación de RBAC granular con decorador `@require_role()`.
- Rate limiting por endpoint sensible.
- Validación de inputs con Pydantic v2 strict mode.
