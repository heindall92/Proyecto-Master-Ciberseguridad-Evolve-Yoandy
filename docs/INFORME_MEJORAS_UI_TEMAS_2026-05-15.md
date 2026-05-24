# INFORME DE MEJORAS ESTÉTICAS Y FUNCIONALES — VALHALLA SOC

**Fecha:** 2026-05-15  
**Alcance:** Frontend React (HUD táctico), multitema, formularios, integraciones de datos reales, pipeline honeypot  
**Rama:** `fix/dashboard-soc-cierre`

---

## 1. Resumen ejecutivo

Este ciclo de trabajo unifica la **experiencia visual** del SOC con un sistema de **cuatro esquemas cromáticos** (Green, Cyan, Amber, Purple) en modo oscuro y claro, corrige el problema de **formularios que permanecían en verde** al cambiar de tema, y añade capacidades operativas (threat map en tiempo real, runbooks, traducción SIEM, contenedor atacante Kali, etc.).

---

## 2. Sistema multitema (TEMAS)

### 2.1 Arquitectura

| Capa | Archivo | Función |
|------|---------|---------|
| Variables base | `frontend/app/src/ui/HUD.css` (`:root`) | Tokens `--signal`, `--line`, `--bg-panel-deep`, etc. |
| Esquemas oscuros | `HUD.css` — `body[data-scheme="cyan\|amber\|purple"]` | Sobrescribe acentos por esquema |
| Modo claro | `frontend/app/src/ui/light-theme-overrides.css` | Fondo claro + esquemas `body[data-theme="light"][data-scheme="…"]` |
| Estado UI | `frontend/app/src/store/uiSlice.ts` | `scheme`, `theme`, `scanlines` en localStorage |
| Aplicación DOM | `frontend/app/src/ui/AppCore.tsx` | `data-theme`, `data-scheme`, `data-scan` en `document.body` |

### 2.2 Comportamiento acordado

- **Modo oscuro / Modo claro:** controlan luminosidad y contraste (legibilidad).
- **GREEN / CYAN / AMBER / PURPLE:** controlan el color de acento (bordes, botones, labels, scanlines).
- Los colores de **severidad** (LOW verde, CRITICAL rojo, etc.) se mantienen semánticos.

### 2.3 Panel // TEMAS

- Selector de esquema sin resaltado solo-dark inconsistente.
- Toggle **MODO CLARO** y **SCANLINES** sincronizados con atributos del body.
- Topbar usa variables del esquema activo (eliminada clase forest fija).

---

## 3. Corrección de formularios (tema vs verde)

### 3.1 Problema reportado

Al seleccionar CYAN (u otro esquema), la mayor parte de la UI seguía el tema, pero **inputs, selects, textareas y modales** (p. ej. «Create New Incident») seguían mostrando bordes, fondos y hover **verdes**.

### 3.2 Causas técnicas corregidas

| Causa | Corrección |
|-------|------------|
| Esquema CYAN sin `--line-strong` | Añadido `--line-strong`, `--line-faint`, `--scanline-color` por esquema |
| Hover global `rgba(60,255,158,…)` | Sustituido por `color-mix` con `var(--signal)` |
| Fondo input `#050a08` fijo | `var(--bg-panel-deep)` |
| Modal `rgba(10, 20, 15, 0.98)` | `var(--bg-panel-deep)` + borde `var(--line-strong)` |
| Drawer workspace verdoso global | `.ws-detail-drawer` con variables de tema; regla global verde eliminada de light-overrides |
| Scanlines siempre verdes | Variable `--scanline-color` por esquema |

### 3.3 Componentes afectados

- Modal crear incidente: `.ws-create-modal`, `.ws-create-modal__input`, `.ws-create-modal__select`
- Usuarios: `.users-form-input`, `.users-form-select`, `.users-form-label`
- Formularios globales: `input`, `textarea`, `select` en `HUD.css`
- Filtros workspace: `.ws-filter-select`, `.ws-btn-primary`
- Modo claro: reglas en `light-theme-overrides.css` para modales y selects (flechas SVG por esquema)

### 3.4 Selects y «rallitas»

- Uso de `background-color` en lugar de shorthand `background` en selects.
- `background-repeat: no-repeat` obligatorio en flechas desplegable.
- Flechas SVG por esquema en oscuro y claro (`body[data-scheme="…"] select`).

---

## 4. Mejoras por vista (funcional + estética)

| Vista | Mejoras |
|-------|---------|
| **Workspace** | Modal crear ticket con clases CSS; drawer detalle con tokens de tema; runbooks/assign/resolve con `var(--signal)` |
| **Usuarios** | Formulario modal migrado a clases `users-form-*` |
| **Threat Map** | Geo real desde honeypot; módulo `threat_map.py`; UI refactorizada |
| **Threat Intel** | API key por usuario en servidor; mirror VT |
| **SIEM** | Traducción alertas según idioma UI (`alertTranslations.ts`); resiliencia ante fallos API |
| **Monitores** | Datos reales; mensajes 403 para no-admin |
| **Cowrie** | Vista alineada al HUD |
| **LSA Monitor** | Integración backend LSA (datos reales / demo según endpoint) |
| **Auditoría** | Contexto ISO 27001 en copy |
| **Perfil** | Ajustes de presentación |
| **Dashboard** | KPIs y layout cohesionados con tokens HUD |
| **Integraciones / Health** | Estilo unificado |
| **Intro cinemática** | CSS/TS actualizados |

---

## 5. Backend e infraestructura (soporte a UI)

| Componente | Cambio |
|------------|--------|
| `backend/app/main.py` | Tickets, webhook, sync Wazuh, endpoints threat map, runbooks seed |
| `backend/app/runbooks_seed.py` | 8–10 playbooks por defecto |
| `backend/app/threat_map.py` | Agregación geo de ataques |
| `backend/app/opensearch_client.py` | Consultas para mapa y SIEM |
| `docker-compose.yml` | Servicio atacante Kali (perfil labs), intervalo 15 min |
| `attacker/attack-loop.sh` | Simulación SSH/telnet contra Cowrie |
| `Valhalla-Runner.bat` | Ajustes de arranque local |

---

## 6. Archivos principales tocados

```
frontend/app/src/ui/HUD.css                    (+ tokens, esquemas, forms, workspace)
frontend/app/src/ui/light-theme-overrides.css  (nuevo — modo claro multitema)
frontend/app/src/ui/AppCore.tsx
frontend/app/src/ui/AnalystWorkspace.tsx
frontend/app/src/ui/UsersView.tsx
frontend/app/src/ui/ThreatMapView.tsx
frontend/app/src/lib/alertTranslations.ts      (nuevo)
backend/app/main.py
backend/app/threat_map.py                      (nuevo)
backend/app/runbooks_seed.py                   (nuevo)
docker-compose.yml
attacker/attack-loop.sh                        (nuevo)
```

---

## 7. Verificación manual recomendada

1. **Ctrl+F5** tras cambios CSS.
2. Modo oscuro → TEMAS → **CYAN** → Workspace → «Nuevo incidente»: bordes y labels cian, no verdes.
3. Repetir con **AMBER** y **PURPLE**.
4. Activar **MODO CLARO** y comprobar formularios + panel TEMAS.
5. Threat Map con Cowrie activo y atacante en perfil `labs`.
6. SIEM con idioma ES/EN y descripciones traducidas.

---

## 8. Deuda conocida (UI / producto)

| Ítem | Estado |
|------|--------|
| Perfil: avatar, cambio contraseña, sesión | Pendiente funcional completo |
| Remediación hallazgos auditoría ciber | Ver `AUDITORIA_CIBERSEGURIDAD_2026-05-15.md` |
| Modo offline admin en frontend | Debe deshabilitarse en producción |

---

## 9. Conclusión

El HUD Valhalla SOC alcanza **coherencia visual multitema** en formularios, modales y paneles laterales, alineando la interfaz con el esquema elegido por el analista. Las mejoras funcionales (mapa de amenazas, runbooks, pipeline honeypot, i18n SIEM) refuerzan el valor operativo del producto para demostración y operación en laboratorio.

---

*Informe de cierre estético-funcional — Valhalla SOC, mayo 2026.*
