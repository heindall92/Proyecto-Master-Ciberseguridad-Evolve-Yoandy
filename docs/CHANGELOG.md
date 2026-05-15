# Changelog — Valhalla SOC

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

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
- **Nuevo** `docs/AUDITORIA_CIBERSEGURIDAD_2026-05-15.md` — auditoría OWASP/API (hallazgos críticos a altos).
- **Nuevo** `docs/INFORME_MEJORAS_UI_TEMAS_2026-05-15.md` — multitema, formularios, threat map, runbooks, honeypot.

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
