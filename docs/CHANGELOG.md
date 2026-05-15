# Changelog — Valhalla SOC

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

---

## [0.1.0] — 2026-05-01 — Fase 0: Higienización del Repositorio

### 🔒 Seguridad
- **Eliminado** `credenciales.txt` con contraseñas en texto plano.
- **Eliminadas** credenciales visibles (`admin / admin`) del formulario de login (`AppCore.tsx`).
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

## [0.2.0] — 2026-05-15 — Fase 2: Estabilización y Dashboard Final

### 🛠️ Corregido (Fixed)
- **Dashboard**: Corregido crash crítico `summary.metrics is undefined`. Ahora el estado inicial es robusto y tolera fallos de API.
- **Backend**: Eliminado *early return* en `/api/dashboard` que impedía la entrega de métricas de tickets abiertos.
- **OpenSearch**: Migrados histogramas de `calendar_interval` a `fixed_interval` para soportar intervalos de 6h en Cowrie y SIEM.
- **UI Alignment**: Corregida desalineación de columnas en `SiemView.tsx` y `DashboardSuperFinal.tsx`.
- **Runbooks**: Normalizadas categorías de "Malware", "Phishing", etc., a minúsculas para coincidir con los filtros de búsqueda del frontend.

### ✨ Añadido (Added)
- **SIEM dedicated view**: Añadida columna de **Source IP** (IP de origen) para mejorar el análisis de incidentes desde la vista completa.
- **Demo Assets**: Actualizado `SuperPopulate.py` con 800+ alertas realistas distribuidas en una ventana de 7 días.

### 🧹 Limpieza (Removed)
- **Redundancia**: Eliminados endpoints duplicados de VirusTotal y Threat Map en `main.py`.

---

## [Unreleased] — Fase 3: Integraciones Avanzadas
