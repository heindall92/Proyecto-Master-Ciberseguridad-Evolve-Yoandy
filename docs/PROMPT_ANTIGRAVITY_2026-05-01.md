# PROMPT OPERATIVO PARA ANTIGRAVITY — VALHALLA SOC v1.0.0
**Fecha:** 2026-05-01
**Uso:** Pegar el bloque de cada FASE en una sesión nueva de Antigravity. Cada fase es autocontenida.

---

## 📋 CONTEXTO MAESTRO (incluir SIEMPRE al inicio de cualquier sesión)

```
Eres un agente de ingeniería senior trabajando en el proyecto Valhalla SOC, un Security Operations Center con dashboard React + backend FastAPI + Wazuh SIEM + Cowrie honeypot + Ollama IA local.

REPO: E:\000Yoandy\Proyecto SOC\Valhalla-SOC\
STACK:
- Backend: Python 3.11+, FastAPI 0.115, SQLAlchemy 2.0 async, PostgreSQL, Pydantic v2, JWT (PyJWT), bcrypt
- Frontend: React 19, TypeScript 5.8, Vite 6, MUI 6, react-grid-layout, react-leaflet, react-router 7
- Infra: docker-compose con Wazuh 4.9.5 (manager + indexer + dashboard), Cowrie honeypot, Ollama local (qwen2.5-coder:7b)
- Desktop: Electron 41 standalone

ESTÁNDAR DE CALIDAD (NO NEGOCIABLE):
1. Investigar antes de construir. Leer el archivo objetivo COMPLETO antes de editarlo.
2. No romper nada existente. Cualquier refactor mantiene retrocompatibilidad o aporta migración.
3. Cada cambio se acompaña de test que lo valida. Sin test → no se considera terminado.
4. Documentar cada cambio en docs/CHANGELOG.md con fecha, autor (Antigravity), motivo, archivos.
5. Commits atómicos con mensajes Conventional Commits (`feat:`, `fix:`, `chore:`, `test:`, `docs:`, `security:`).
6. Ningún secreto en código. Todo en .env. Si encuentras uno hardcoded, sacarlo INMEDIATAMENTE.
7. Ningún `console.log`, `print(...)` de debug, ni `TODO/FIXME` sin issue tracker abierto.
8. Tests verdes antes de mergear. `make test` debe pasar.
9. Si una decisión arquitectónica es ambigua, escribir un ADR breve en docs/adr/ antes de implementar.
10. El estándar es "esto está terminado", no "suficientemente bueno".

PROHIBIDO:
- Dejar features a medias.
- Patches superficiales cuando la solución correcta está al alcance.
- "Lo dejamos para después" si se puede cerrar ahora.
- Hervir el océano. Resolver lo del scope de la fase, no expandirlo.

ANTES DE TOCAR CÓDIGO:
1. `git status` para ver el estado.
2. `git checkout -b <rama-de-fase>` (las ramas las indica cada fase).
3. Leer docs/PLAN_MAESTRO_CIERRE_2026-05-01.md en su totalidad.
4. Leer docs/AUDITORIA_2026-04-19.md para no repetir trabajo ya hecho.
5. Ejecutar `make lint && make test` para confirmar baseline verde.

AL TERMINAR:
1. `make lint && make test` deben pasar.
2. Actualizar docs/CHANGELOG.md.
3. Commit y push.
4. Reportar al usuario: qué se hizo, qué tests añadidos, qué quedó fuera de scope (si algo).
```

---

## 🚀 FASE 0 — Higienización del repositorio

```
FASE: 0 — Higienización del repositorio
RAMA: chore/phase-0-hygiene
DURACIÓN ESTIMADA: 1 día
DEPENDENCIAS: ninguna

OBJETIVO: Dejar el repo en estado limpio antes de tocar lógica.

TAREAS (ejecutar en orden):

T0.1 — Auditar y limpiar secretos
  - Leer E:\000Yoandy\Proyecto SOC\Valhalla-SOC\credenciales.txt
  - Si contiene credenciales reales: moverlas a .env, eliminar el archivo, añadirlo al .gitignore.
  - Auditar git history: si las credenciales estuvieron en commits anteriores, generar reporte y recomendar rotación.

T0.2 — Crear .env.example exhaustivo
  Archivo: .env.example
  Variables que debe contener (con valores dummy claramente marcados):
    SECRET_KEY=change-me-in-production-min-32-chars
    DATABASE_URL=postgresql+asyncpg://valhalla:valhalla@postgres:5432/valhalla
    WAZUH_API_URL=https://wazuh.manager:55000
    WAZUH_API_USER=wazuh-wui
    WAZUH_API_PASSWORD=replace-with-real-pass
    OPENSEARCH_URL=https://wazuh.indexer:9200
    OPENSEARCH_USER=admin
    OPENSEARCH_PASSWORD=replace-with-real-pass
    OLLAMA_BASE_URL=http://ollama:11434
    OLLAMA_MODEL=qwen2.5-coder:7b
    VIRUSTOTAL_API_KEY=
    OTX_API_KEY=
    JWT_ALGORITHM=HS256
    ACCESS_TOKEN_EXPIRE_MINUTES=480
    CORS_ORIGINS=http://localhost:3000
    ENV=development
    LOG_LEVEL=INFO
    EVIDENCE_DIR=/app/uploads/evidence
    MAX_UPLOAD_SIZE_MB=10
    RATE_LIMIT_LOGIN=5/minute
    RATE_LIMIT_VT=10/minute
    RATE_LIMIT_THREAT_MAP=6/minute
    GEO_CACHE_TTL_DAYS=30
    SESSION_COOKIE_SECURE=true
    SESSION_COOKIE_SAMESITE=strict
    CSRF_ENABLED=true

T0.3 — Externalizar secretos hardcoded en backend/app/settings.py
  - Reemplazar TODOS los defaults inseguros (líneas 10, 15-22) por:
      from pydantic_settings import BaseSettings, SettingsConfigDict
      class Settings(BaseSettings):
          model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")
          secret_key: str
          database_url: str
          wazuh_api: str
          wazuh_user: str
          wazuh_pass: str
          # ... etc, sin defaults para los críticos
          env: str = "development"
  - Si ENV=production y falta algún secreto crítico, levantar RuntimeError al import.
  - Añadir test tests/security/test_settings.py que verifica esto.

T0.4 — .gitignore mejorado
  Añadir si no están:
    backend/backups/
    backend/uploads/
    *.db
    *.db-*
    .env
    .env.*.local
    coverage/
    htmlcov/
    .pytest_cache/
    .ruff_cache/
    .mypy_cache/
    playwright-report/
    test-results/
    sbom.json
    *.spdx.json

T0.5 — Eliminar DashboardTest.tsx y referencias
  - Archivo: frontend/app/src/ui/DashboardTest.tsx → DELETE
  - grep -r "DashboardTest" frontend/app/src/ — limpiar imports residuales
  - Confirmar build sigue pasando: cd frontend && npm run build

T0.6 — Limpiar console.log de producción
  - En frontend/app/src/ buscar todos los console.log/error/warn
  - Mantener solo dentro de:
      if (import.meta.env.DEV) { console.error(...); }
  - O reemplazar por un logger central (frontend/app/src/lib/logger.ts) que respete env.
  - En backend/app/ reemplazar print() por logger estructurado (structlog).

T0.7 — Resolver endpoints duplicados en backend/app/main.py
  - GET /api/agents está definido en líneas 337 y 753: consolidar en una sola implementación con todos los parámetros opcionales.
  - DELETE /api/tickets/{id} duplicado en 465 y 501: consolidar.
  - Verificar OpenAPI /docs solo lista cada ruta una vez.

T0.8 — Pre-commit + Makefile
  Archivo: .pre-commit-config.yaml
    repos:
      - repo: https://github.com/astral-sh/ruff-pre-commit
        rev: v0.4.0
        hooks: [{id: ruff, args: [--fix]}, {id: ruff-format}]
      - repo: https://github.com/pre-commit/mirrors-prettier
        rev: v3.1.0
        hooks: [{id: prettier, files: \.(ts|tsx|js|jsx|json|md|yaml|yml)$}]
      - repo: https://github.com/pre-commit/pre-commit-hooks
        rev: v4.5.0
        hooks: [{id: trailing-whitespace}, {id: end-of-file-fixer}, {id: check-yaml}, {id: check-added-large-files, args: [--maxkb=500]}]
      - repo: https://github.com/zricethezav/gitleaks
        rev: v8.18.0
        hooks: [{id: gitleaks}]

  Archivo: Makefile
    .PHONY: dev test lint build security-scan clean
    dev:
        docker compose up -d --build
    test:
        cd backend && pytest --cov=app --cov-fail-under=80
        cd frontend && npm test
    lint:
        cd backend && ruff check . && ruff format --check .
        cd frontend && npm run lint
    build:
        cd frontend && npm run build
        docker compose build
    security-scan:
        gitleaks detect --no-git
        cd backend && pip-audit && bandit -r app/
        cd frontend && npm audit --production --audit-level=high
        trivy fs --severity HIGH,CRITICAL .
    clean:
        find . -type d -name __pycache__ -exec rm -rf {} +
        rm -rf coverage htmlcov .pytest_cache

T0.9 — CHANGELOG.md inicial
  Crear docs/CHANGELOG.md con sección [Unreleased] y subsección "Phase 0".

CRITERIOS DE ACEPTACIÓN:
  ✅ git status muestra solo cambios de Fase 0
  ✅ make lint pasa
  ✅ make test pasa
  ✅ docker compose up -d arranca sin errores con .env recién copiado
  ✅ /docs OpenAPI lista cada ruta una sola vez
  ✅ pre-commit run --all-files pasa
  ✅ grep -r "console\." frontend/app/src/ solo retorna instancias envueltas en DEV
  ✅ grep -r "print(" backend/app/ retorna 0 (excepto en formato/logger)

ENTREGABLE: PR chore/phase-0-hygiene con commits atómicos.
```

---

## 🛡️ FASE 1 — Hardening de Backend

```
FASE: 1 — Hardening de Backend
RAMA: feat/phase-1-backend-hardening
DEPENDENCIAS: Fase 0 mergeada

OBJETIVO: Cerrar las brechas críticas de seguridad de la API.

TAREAS:

T1.1 — Rate limiting con slowapi
  - pip install slowapi
  - backend/app/main.py: configurar Limiter con storage Redis o memoria
  - Decoradores en endpoints:
      @limiter.limit("5/minute") en /api/auth/login
      @limiter.limit("10/minute") en /api/vt/*
      @limiter.limit("6/minute") en /api/threat-map
      @limiter.limit("20/minute") en /api/analyze/*
  - Custom handler que retorne JSON {detail, retry_after}
  - Test: tests/security/test_rate_limit.py con asyncio que dispara 6 logins en 60s y verifica 429 en el 6º.

T1.2 — JWT en httpOnly cookie
  - Modificar backend/app/auth.py:
      * Endpoint /api/auth/login devuelve set-cookie en lugar de body con token
      * Cookie: name="valhalla_session", httpOnly=True, secure=settings.session_cookie_secure, samesite="strict", max_age=480*60
      * Crear /api/auth/logout que limpia la cookie
  - Modificar backend/app/auth.py get_current_user: leer cookie en lugar de Authorization header (mantener Authorization como fallback para compatibilidad Electron)
  - Modificar frontend/app/src/lib/api.ts: añadir credentials:'include' a todos los fetch; eliminar localStorage.setItem('token')
  - Modificar AppCore.tsx: ya no leer token de localStorage; en su lugar llamar /api/auth/me y si retorna 401 mostrar login
  - Test: tests/security/test_xss_token.py que inyecta payload XSS y verifica que document.cookie no expone el JWT

T1.3 — CSRF double-submit token
  - Generar token en /api/auth/login y devolverlo en cookie no-httpOnly "valhalla_csrf"
  - Middleware FastAPI que para POST/PUT/PATCH/DELETE valida header X-CSRF-Token == cookie valhalla_csrf
  - Frontend: interceptor que lee la cookie y añade el header automáticamente
  - Test: tests/security/test_csrf.py — POST sin header → 403

T1.4 — Validación dura de uploads
  - Endpoint /api/tickets/{id}/evidence:
      * MAX_UPLOAD_SIZE_MB de .env (default 10)
      * import magic; mime = magic.from_buffer(content[:2048], mime=True)
      * Whitelist: image/png, image/jpeg, application/pdf, text/plain, application/json
      * Rechazar si filename contiene ../ o NUL
      * Sanitizar filename con secrets.token_urlsafe(16) + extensión validada
      * Resolver path destino con Path(EVIDENCE_DIR).resolve() / safe_filename y verificar que startswith(EVIDENCE_DIR.resolve())
  - Test: tests/security/test_upload.py — payload .exe disfrazado, oversized, path traversal

T1.5 — IDOR en /api/tickets/{id}*
  - Decorador require_ticket_access(ticket_id, current_user) que valida:
      * Si role == admin → permitido
      * Si role == analyst y ticket.assigned_to_id == user.id → permitido
      * Si role == reporter y ticket.reporter_id == user.id → permitido
      * Si role == viewer → solo lectura de tickets de su department (si existe) o solo si reporter
      * En otro caso → 404 (no 403, para no leakar existencia)
  - Aplicar a GET, PUT, DELETE, /assign, /resolve, /analyze, /evidence
  - Test: tests/security/test_idor.py con dos usuarios y verificación cruzada

T1.6 — Validators Pydantic custom
  - backend/app/validators.py:
      def strict_ipv4(v: str) -> str: validar octetos 0-255
      def safe_text(max_len) -> Callable: bleach.clean para text fields
      def cve_format(v: str) -> str: regex CVE-YYYY-NNNN+
      def mitre_technique(v: str) -> str: regex T\d{4}(\.\d{3})?
  - Aplicar en backend/app/schemas.py a los DTOs correspondientes
  - Test: tests/security/test_validators.py con payloads bordes

T1.7 — Path traversal en /api/evidence/{id}/download
  - En el handler: file_path = Path(evidence.file_path).resolve()
  - if not str(file_path).startswith(str(Path(settings.evidence_dir).resolve())): raise HTTPException(404)
  - Test: tests/security/test_path_traversal.py — modificar registro DB para apuntar fuera, verificar 404

T1.8 — Mitigación timing attack en login
  - En /api/auth/login:
      DUMMY_HASH = bcrypt.hashpw(b"dummy", bcrypt.gensalt()).decode()
      user = ...
      bcrypt.checkpw(password, (user.password_hash if user else DUMMY_HASH).encode())
      if not user or not match: raise HTTPException(401, "Credenciales inválidas")
  - Test con timeit: diferencia < 50ms p95 entre user existente vs no existente

T1.9 — Headers extras de seguridad
  Middleware que añade en response:
    Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
    Cross-Origin-Embedder-Policy: require-corp
    Cross-Origin-Opener-Policy: same-origin
    Cross-Origin-Resource-Policy: same-origin
    Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-{random}'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' http://localhost:* https://localhost:*; frame-ancestors 'none'; form-action 'self'; base-uri 'self'; object-src 'none'
    Strict-Transport-Security: max-age=63072000; includeSubDomains; preload (solo si HTTPS)

T1.10 — Logging estructurado con structlog
  - backend/app/logging_config.py: configurar structlog con processors:
      * TimeStamper(fmt="iso")
      * add_log_level
      * filter_secrets (custom processor que redacta keys: password, token, secret, api_key, csrf, cookie)
      * JSONRenderer en prod, ConsoleRenderer en dev
  - Reemplazar todos los print/logging.info por log.info(event, **context)
  - Test: tests/security/test_logging.py — escribir log con secret, verificar redacted

CRITERIOS DE ACEPTACIÓN:
  ✅ pytest tests/security/ pasa al 100%
  ✅ securityheaders.com (con header-cli local) puntúa A+
  ✅ DevTools cookies muestra valhalla_session con HttpOnly + Secure + SameSite=Strict
  ✅ Inyectar XSS en input no permite robar la cookie de sesión
  ✅ Login con user inválido vs válido tiene diferencia de timing < 50ms
  ✅ Upload de .exe disfrazado de .png es rechazado

ENTREGABLE: PR feat/phase-1-backend-hardening con suite tests/security/ completa.
```

---

## 🔌 FASE 2 — Conectar las vistas inactivas

```
FASE: 2 — Conectar las vistas inactivas y completar funcionalidad administrativa
RAMA: feat/phase-2-views-wired
DEPENDENCIAS: Fase 1 mergeada

OBJETIVO: Toda vista referenciada en el menú existe, está enrutada, consume datos reales.

TAREAS:

T2.1 — Habilitar IncidentsView
  - Descomentar import en frontend/app/src/ui/AppCore.tsx línea 21
  - Añadir NavBtn en sidebar (entre 'siem' y 'workspace'): id="incidents", label="Incidentes", icon="i-incident"
  - Añadir handler en main: {view === 'incidents' && <IncidentsView lang={lang} />}
  - Backend: añadir GET /api/incidents en main.py como alias de /api/tickets con filtro severity in (high, critical)
  - Verificar IncidentsView.tsx tiene loading + empty + error states; si no, añadirlos.

T2.2 — AuditLogView (NUEVO)
  Backend (backend/app/main.py):
    @app.get("/api/audit", dependencies=[Depends(require_role("admin"))])
    async def list_audit(user: str|None=None, action: str|None=None, from_dt:datetime|None=None, to_dt:datetime|None=None, page:int=1, size:int=50, db: AsyncSession = Depends(get_db)) -> PaginatedAudit
  Modelo AuditLog (si no existe): id, user_id, username, action (CREATE/UPDATE/DELETE/LOGIN/LOGOUT/ACCESS_DENIED), resource (ticket/user/runbook/...), resource_id, ip, user_agent, payload_hash, timestamp
  Middleware que registra cada POST/PUT/PATCH/DELETE en audit_log
  Frontend (frontend/app/src/ui/AuditLogView.tsx):
    - Tabla con columnas: timestamp, user, action, resource, ip, payload_summary
    - Filtros: usuario, acción, rango fecha
    - Paginación
    - Botón "Exportar CSV"
  Añadir entrada de menú visible solo si user.role === 'admin'

T2.3 — SystemSettingsView (NUEVO)
  Modelo SystemSetting: key (PK), value_encrypted, updated_at, updated_by
  Backend: GET/PUT /api/settings (solo admin)
  Cifrado: AES-256-GCM con clave derivada de SECRET_KEY via PBKDF2 (no almacenar la key)
  Settings expuestos: ollama_url, ollama_model, vt_api_key, otx_api_key, max_upload_mb, retention_days_cowrie, default_theme, ollama_min_alert_level
  Frontend: formulario con validación, secretos como password fields que no muestran el valor actual (solo permiten cambiar)
  Test: tests/test_settings_crypto.py verifica round-trip y que el value_encrypted en DB no contenga el plaintext

T2.4 — IntegrationsHealthView (NUEVO)
  Backend: GET /api/health/integrations
    Retorna {wazuh: {status, latency_ms, error}, indexer: {...}, dashboard: {...}, cowrie: {...}, ollama: {...}, virustotal: {...}, postgres: {...}}
    Cada check con timeout 3s, ejecutados en paralelo asyncio.gather
  Frontend: vista con tarjeta por integración, color según status, refresco cada 30s
  Test: tests/test_health_integrations.py

T2.5 — MonitorsView (NUEVO)
  Backend: GET/PUT /api/monitors (gestiona los 7 monitores SIEM)
    Almacenar config en DB (tabla monitors) en lugar de scripts Python
    PUT permite enabled, threshold, severity_floor
    GET /api/monitors/{id}/recent_triggers consulta OpenSearch últimas alertas que matchean
  Frontend: lista los 7 monitores con toggle, slider de umbral, detalle expandible
  Migración Alembic que crea tabla con los 7 defaults

T2.6 — LSA Monitor backend
  Implementar en main.py:
    @app.get("/api/agents/{agent_id}/lsa-status") — consulta a Wazuh API SCA módulo, retorna RunAsPPL, Credential Guard, Protected Process Light status
    @app.post("/api/agents/{agent_id}/lsa-harden") — ejecuta active response /var/ossec/active-response/bin/lsa-harden.cmd vía Wazuh API
  Crear script lsa-harden.cmd para Windows (configurar via PowerShell)
  Test E2E sobre agente lab Windows

T2.7 — Persistir Runbooks en DB
  - Eliminar fallback en memoria de main.py
  - Asegurar GET /api/runbooks consulta SOLO la tabla Runbook
  - Crear migración Alembic que inserta los 4 default runbooks (intrusion, malware, ransomware, ddos) si la tabla está vacía
  - Test: crear runbook, reiniciar uvicorn, verificar persiste

T2.8 — Self-service password
  Backend:
    POST /api/auth/change-password {current: str, new: str}
    Valida current con bcrypt.checkpw, exige new con políticas (min 12 chars, 1 mayús, 1 minús, 1 dígito, 1 símbolo)
    Re-emite cookie sesión
  Frontend ProfileView.tsx:
    Sección "Cambiar contraseña" con 3 inputs (current, new, confirm)
    Validación client-side espejo
    Mensaje de éxito + auto-logout

T2.9 — Geo-cache para ThreatMap
  Modelo IpGeolocation: ip (PK), country_code, country_name, city, lat, lon, isp, asn, as_owner, cached_at
  Backend: en /api/threat-map, antes de llamar ip-api.com:
    cached = await db.get(IpGeolocation, ip)
    if cached and (now - cached.cached_at) < timedelta(days=GEO_CACHE_TTL_DAYS): use cached
    else: fetch + upsert
  Bulk fetch ip-api.com batch endpoint (hasta 100 IPs/request)
  Test: 100 IPs, 1 sola llamada externa.

T2.10 — Paginación uniforme
  Crear backend/app/pagination.py:
    class PaginatedResponse(BaseModel, Generic[T]): items: list[T]; total: int; page: int; size: int; pages: int
    def paginate(query, page, size) -> PaginatedResponse
  Aplicar a: /api/wazuh/cowrie-sessions, /api/wazuh/recent-alerts, /api/audit, /api/incidents, /api/agents/{id}/packages, /api/ioc, /api/runbooks
  Frontend: componente <Pagination /> reutilizable

T2.11 — Export CSV/JSON desde UI
  Backend: GET /api/export/{view}?format=csv|json&filters=...
    Views soportadas: alerts, sessions, threats, audit, tickets
  Frontend: botón "📥 Export" en cada vista con datos tabulares; modal selecciona formato y rango
  Header Content-Disposition con filename "valhalla_{view}_{YYYYMMDDHHMMSS}.csv"

T2.12 — Server-Sent Events para notificaciones
  Backend: @app.get("/api/stream/notifications") — async generator que emite eventos cuando hay nuevo ticket o alerta crítica (usar asyncio.Queue por usuario)
  Frontend: AppCore.tsx — EventSource que escucha y dispara playNotificationSound + setStats
  Test E2E: crear ticket desde otra sesión, verificar UI lo refleja en < 2s sin polling

T2.13 — Eliminar fallback "CONSTRUCCIÓN EN PROCESO"
  - AppCore.tsx línea 510-514: reemplazar por <NotFoundView /> que muestra 404 + "Volver a Overview"
  - Verificar que TODAS las vistas del array de validación tienen handler

CRITERIOS DE ACEPTACIÓN:
  ✅ Todas las 14 vistas del menú cargan datos reales
  ✅ Reiniciar backend mantiene runbooks creados
  ✅ Geo-cache reduce llamadas ip-api.com >90%
  ✅ Export descarga archivo válido en cada vista tabular
  ✅ Notificación llega en <2s vía SSE
  ✅ Audit log registra TODA mutación
  ✅ Self-service password funciona end-to-end
  ✅ ningún placeholder "CONSTRUCCIÓN EN PROCESO" visible

ENTREGABLE: PR feat/phase-2-views-wired con migraciones Alembic + tests Vitest + screenshots de cada vista en estados loading/empty/error/success en docs/ux-gallery/phase-2/.
```

---

## 💎 FASE 3 — UX Polish

```
FASE: 3 — UX Polish (premium feel)
RAMA: feat/phase-3-ux-polish
DEPENDENCIAS: Fase 2 mergeada

OBJETIVO: Sentirse producto comercial, no demo.

TAREAS:

T3.1 — Ocultar credenciales por defecto en login
  AppCore.tsx líneas 305-307: eliminar el bloque que muestra "default_creds: admin / Valhalla2026!"
  Reemplazar por: <a href="/MANUAL.md" target="_blank">¿Primera vez? Ver manual</a>

T3.2 — Migrar inline styles
  - Auditar AppCore.tsx, DashboardSuperFinal.tsx (>500 props inline)
  - Crear frontend/app/src/ui/components/ con: Topbar, Sidenav, NavBtn, UserMenu, NotificationBell, KpiCard, PanelHeader, etc.
  - Estilos a frontend/app/src/ui/components/*.module.css
  - Conservar solo inline styles dinámicos genuinos (anchos calculados, colores condicionales por dato)
  - Objetivo: grep -c 'style={{' src/ < 50

T3.3 — BrandLogo component
  Reemplazar AlexanaLetter/AlexanaWord (manual SVG letter-by-letter) por:
    <BrandLogo variant="full|short|icon" size="sm|md|lg|xl" />
  SVG paths optimizados (svgo) o web font Alexana embebida

T3.4 — Skeleton + Empty + Error states
  Crear:
    <Skeleton variant="card|row|chart|kpi" />
    <EmptyState icon title hint actionLabel onAction />
    <ErrorState error onRetry />
  Usar en cada vista (DashboardSuperFinal, IncidentsView, AuditLogView, etc.)

T3.5 — Sistema tema light/dark real
  CSS variables para ambos:
    [data-theme="dark"] {--bg-void:#0a0e0d; --text:#fff; ...}
    [data-theme="light"] {--bg-void:#f8fafc; --text:#0f172a; ...}
  Toggle persistido en cookie (no localStorage para SSR-friendly)
  Probar coherencia en TODAS las vistas

T3.6 — Animaciones de transición de vista
  framer-motion:
    <AnimatePresence mode="wait">
      <motion.div key={view} initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={{duration:0.2}}>
        {currentView}
      </motion.div>
    </AnimatePresence>

T3.7 — Accesibilidad WCAG 2.1 AA
  - aria-label en TODOS los botones-icono
  - role="navigation"/main/banner/contentinfo en regiones
  - Focus visible: outline:2px solid var(--signal); outline-offset:2px
  - Skip link "Saltar al contenido principal"
  - Verificar contrastes con tools (target ≥ 4.5:1)
  - Anuncios live para notificaciones nuevas
  - Tab order lógico

T3.8 — Responsive
  Breakpoints: 1024 (sidebar colapsable), 1440 (default), 1920 (4k+ aumentar tamaños)
  Test en todas las vistas

T3.9 — TV Mode pulido
  Modo presentación con:
    - Header oculto, sidenav oculto
    - KPIs gigantes (96px font)
    - Auto-rotación de paneles cada 30s con barra de progreso
    - Indicador discreto "TV MODE" abajo-derecha
  Salir con Esc

T3.10 — Keyboard shortcuts
  Hook useKeyboardShortcuts:
    g+o → overview
    g+s → siem
    g+w → workspace
    g+m → threat map
    g+r → runbooks
    g+a → audit log
    / → focus search global
    ? → modal con tabla de shortcuts
    Esc → cerrar modal/cierra TV mode
  Modal de ayuda accesible

T3.11 — Onboarding tour
  react-joyride en primer login (detectar via campo first_login en User):
    Step 1: Bienvenida + propósito del SOC
    Step 2: Sidebar y módulos principales
    Step 3: Overview y KPIs
    Step 4: Cómo asignarse un ticket
    Step 5: Ejecutar un runbook
    Step 6: Audit log + perfil
  Botón "Reanudar tour" en ProfileView

CRITERIOS:
  ✅ axe-core 0 issues serious/critical en todas las vistas
  ✅ Lighthouse Performance ≥90, Accessibility ≥95 en todas las vistas
  ✅ Toggle light/dark sin flash de tema incorrecto (FOUC)
  ✅ Inline styles props < 50 totales
  ✅ Login sin credenciales visibles
  ✅ TV mode usable en pantalla 4K vertical y horizontal

ENTREGABLE: PR feat/phase-3-ux-polish con galería docs/ux-gallery/phase-3/.
```

---

## 🔒 FASE 4 — Hardening de Frontend

```
FASE: 4 — Hardening Frontend
RAMA: feat/phase-4-frontend-hardening
DEPENDENCIAS: Fase 3 mergeada

TAREAS:

T4.1 — Sanitizar HTML dinámico
  - grep -r "dangerouslySetInnerHTML" frontend/app/src/ → 0 resultados (eliminar todos)
  - Si imprescindible, envolver con DOMPurify.sanitize(value, {USE_PROFILES:{html:true}, ALLOWED_TAGS:['b','i','em','strong']})

T4.2 — Validación client-side espejo
  Crear frontend/app/src/lib/validators.ts con mismas reglas que backend (IPv4, longitudes, regex)
  Aplicar en cada formulario antes de submit
  Mostrar el mismo mensaje de error que backend

T4.3 — SRI en CDN scripts
  Cualquier <script src="cdn..."> debe tener integrity="sha384-..."
  Calcular hash con: openssl dgst -sha384 -binary file.js | openssl base64 -A

T4.4 — Eliminar eval/Function/setTimeout(string)
  eslint-plugin-security en .eslintrc:
    "rules": {"security/detect-eval-with-expression": "error", ...}

T4.5 — Trusted Types
  CSP: require-trusted-types-for 'script'
  Crear policy:
    if (window.trustedTypes) {
      window.trustedTypes.createPolicy('default', {
        createHTML: (s) => DOMPurify.sanitize(s),
        createScriptURL: (s) => s
      });
    }

T4.6 — npm audit gates
  npm audit --production --audit-level=high → 0 issues
  Si aparece nuevo: gate CI bloquea PR

T4.7 — Build determinista
  package-lock.json commiteado
  En CI: npm ci (no npm install) para builds reproducibles

CRITERIOS:
  ✅ npm audit --production retorna 0 high/critical
  ✅ DevTools console: 0 violaciones de CSP/Trusted Types
  ✅ Construir 2 veces produce hash idéntico

ENTREGABLE: PR feat/phase-4-frontend-hardening
```

---

## 🎯 FASE 5 — Pentest interno

```
FASE: 5 — Pentest interno + informe ético
RAMA: test/phase-5-pentest
DEPENDENCIAS: Fases 1-4 mergeadas
ENTORNO: instancia local del propio dashboard (autorización legítima del owner)

OBJETIVO: Validar que el dashboard resiste los ataques que detecta. Documentar resultados.

PROCEDIMIENTO:
  1. Levantar entorno limpio: docker compose down -v && docker compose up -d --build
  2. Snapshot DB para rollback rápido.
  3. Ejecutar cada test, documentar request/response, severidad CVSS 4.0, remediación.
  4. Si un test encuentra vuln: PARAR la fase, abrir issue, corregir, reanudar.
  5. Generar informe final docs/INFORME_PENTEST_2026-05-XX.md.

TESTS (mismos 20 de PLAN_MAESTRO, sección Fase 5):

T5.1 Fuerza bruta — hydra -l admin -P /usr/share/wordlists/rockyou.txt 127.0.0.1 http-post-form "/api/auth/login:username=^USER^&password=^PASS^:Credenciales inválidas" -t 16
  Pass: bloqueo IP tras 5 fallos, todos posteriores 429

T5.2 SQLi — sqlmap --crawl=3 --random-agent --batch --output-dir=./sqlmap-out -u "http://localhost:8000/api/tickets?search=test"
  Pass: 0 inyecciones detectadas

T5.3 XSS — XSStrike automatizado + payloads manuales en cada campo de texto
  payloads = ['<svg/onload=alert(1)>', '"><script>alert(1)</script>', 'javascript:alert(1)', '<img src=x onerror=alert(1)>', '<iframe src=javascript:alert(1)>']
  En campos: ticket.title, ticket.description, ticket.notes, runbook.name, runbook.steps, evidence.filename, ioc.value, ioc.notes, user.username, user.email
  Pass: ningún payload se ejecuta

T5.4 CSRF — request POST desde origen externo:
  curl -X POST http://localhost:8000/api/tickets -H "Cookie: valhalla_session=...captured..." -H "Content-Type: application/json" -d '{...}'
  Pass: 403 sin X-CSRF-Token

T5.5 SSRF — payloads en /api/ollama/check, /api/integrations/test
  ['http://169.254.169.254/latest/meta-data/', 'file:///etc/passwd', 'gopher://localhost:6379/_INFO', 'http://[::1]:22/', 'http://0.0.0.0:8000/']
  Pass: whitelist rechaza, 400

T5.6 Path traversal — /api/evidence/{id}/download con id manipulado para apuntar a registro cuyo file_path incluye ../../../etc/passwd
  Pass: validación realpath rechaza, 404

T5.7 IDOR — viewer A vs viewer B con tickets cruzados
  Pass: 404 consistente

T5.8 Path injection en filename — POST /api/tickets/{id}/evidence con filename="../../etc/passwd" o filename="evidence.png\x00.exe"
  Pass: filename normalizado a UUID + extensión

T5.9 DoS — slowhttptest -c 1000 -H -i 10 -r 200 -t POST -u http://localhost:8000/api/auth/login
  Pass: usuarios legítimos siguen recibiendo respuesta < 1s

T5.10 JWT attacks — jwt_tool con --tamper, --bruteforce, --kid-injection
  Pass: 401 en todos

T5.11 Open redirect — /api/auth/login?next=//evil.com, ?next=javascript:alert(1)
  Pass: validar paths relativos, rechazar absolutos externos

T5.12 XXE — upload XML con entidades externas
  Pass: defusedxml o libxml2 con --no-net --nonet, entidades deshabilitadas

T5.13 Mass assignment — POST /api/users (como viewer) con role:"admin"
  Pass: 403 de la propia ruta, además Pydantic schema no permite el campo

T5.14 Race condition — 100 requests paralelos a /api/tickets/{id}/assign
  Pass: solo 1 efectivo, lock o UPDATE...WHERE assigned_to_id IS NULL

T5.15 Prototype pollution — npm audit + pruebas dependencias
  Pass: 0 CVE

T5.16 Cabeceras inseguras — header-cli http://localhost:8000
  Pass: A+ score

T5.17 Open redirect / subdominio — N/A en local; documentar checklist prod

T5.18 Honeytokens — insertar usuario "canary_admin" + IP "10.99.99.99" en DB; alertar si alguien los consulta
  Pass: Wazuh dispara alerta nivel 12 al SELECT de canary

T5.19 Sandbox Cowrie → backend — desde shell Cowrie: curl http://valhalla-backend:8000
  Pass: red Docker cowrie aislada de backend, conexión rechazada

T5.20 OWASP ZAP — zap-baseline.py -t http://localhost:3000 -r zap-report.html
  Pass: 0 high, < 5 medium documentados

ENTREGABLE: docs/INFORME_PENTEST_2026-05-XX.md con cada test, evidencia (request/response capturadas), severidad CVSS 4.0, remediación aplicada (commit hash si aplica), e ID interno VLH-PENTEST-001..020.
```

---

## ✅ FASE 6 — Tests automatizados

```
FASE: 6 — Tests automatizados
RAMA: test/phase-6-automated-tests
DEPENDENCIAS: Fase 5 cerrada con 0 high/critical

TAREAS:

T6.1 Backend unit (pytest)
  - backend/tests/unit/ con tests por módulo (auth, security, validators, schemas, db, lsa_monitor, wazuh_client)
  - pytest --cov=app --cov-fail-under=80
  - Fixtures: in-memory SQLite, mock httpx, factories pytest-factoryboy

T6.2 Backend integration (pytest + testcontainers)
  - backend/tests/integration/ con PG real testcontainers + opensearch-py mock
  - Cada endpoint: happy path + 2 error paths
  - Marcador @pytest.mark.integration para CI separado

T6.3 Backend security (pytest)
  - backend/tests/security/ ya creado en Fase 1; ampliar con casos OWASP top 10
  - Importar @pytest.mark.security

T6.4 Frontend unit (Vitest)
  - frontend/app/src/__tests__/ con tests por componente
  - Cobertura ≥70% en lib/ y componentes puros
  - vitest --coverage

T6.5 Frontend E2E (Playwright)
  - frontend/e2e/ con flujos:
      auth.spec.ts (login válido, login inválido, logout)
      tickets.spec.ts (crear, asignar, resolver)
      audit.spec.ts (admin ve audit log, exporta CSV)
      runbooks.spec.ts (crear, editar, eliminar)
      threat-map.spec.ts (carga mapa, filtra por horas)
  - playwright.config.ts: 3 navegadores (chromium, firefox, webkit)

T6.6 Visual regression
  - playwright-visual-comparison
  - Screenshot de cada vista en 1920×1080 dark + light theme
  - Baseline en frontend/e2e/__visuals__/
  - Diff threshold 0.1%

T6.7 Performance (lighthouse-ci)
  - .lighthouserc.json con assertions: LCP <2.5s, FID <100ms, CLS <0.1, TBT <300ms
  - Score ≥90 en Performance, Accessibility, Best Practices, SEO

T6.8 Accessibility (axe-playwright)
  - axe.run() en cada test E2E
  - Falla si encuentra serious/critical

T6.9 Smoke post-deploy
  - scripts/smoke.sh: curl /health, login, /api/auth/me, /api/dashboard
  - Exit 0 = OK; usar en deploy CI

T6.10 CI workflow (.github/workflows/ci.yml o gitea equivalente)
  jobs:
    lint: ruff + prettier + eslint
    test-backend: pytest unit + integration + security
    test-frontend: vitest + lighthouse
    test-e2e: playwright (chromium)
    security-scan: gitleaks + trivy + pip-audit + npm audit
    build: docker compose build
    sbom: syft → sbom.spdx.json
  Trigger: push, PR; required for merge

CRITERIOS:
  ✅ make test pasa
  ✅ Cobertura backend ≥80%, frontend ≥70%
  ✅ Lighthouse ≥90 en 4 dimensiones
  ✅ axe 0 violaciones serious
  ✅ CI verde en main

ENTREGABLE: PR test/phase-6-automated-tests
```

---

## 📦 FASE 7 — DevOps + Documentación final

```
FASE: 7 — DevOps + Doc final + Release v1.0.0
RAMA: chore/phase-7-release
DEPENDENCIAS: Fase 6 mergeada

TAREAS:

T7.1 — Healthchecks completos en docker-compose.yml
  Cada servicio con healthcheck + depends_on.condition:service_healthy

T7.2 — Trivy + Grype scan de imágenes Docker
  En CI: trivy image valhalla-backend, valhalla-frontend
  Fail si critical/high

T7.3 — SBOM con syft
  syft packages dir:. -o spdx-json=sbom.spdx.json
  Adjuntar a release

T7.4 — Política de retención Cowrie en OpenSearch (ILM)
  Crear política wazuh-alerts-cowrie:
    hot 30 días → warm 60 días → cold 90 días → delete
  Aplicar a alias wazuh-alerts-*

T7.5 — Backup PG cifrado
  Script scripts/backup.sh: pg_dump | age -e -r $RECIPIENT > backup_$(date +%F).sql.age
  Cron diario, retención 30 días, off-site recomendado

T7.6 — Meta-runbook "comprometen el SOC"
  docs/RUNBOOK_SOC_INCIDENT.md:
    - Detectar (logs FastAPI en Wazuh con honeytokens)
    - Aislar (docker compose stop, revocar tokens)
    - Contener (cambiar SECRET_KEY, regenerar todos los JWT, rotar credenciales DB/Wazuh)
    - Erradicar (review git history, rollback al último commit limpio)
    - Recuperar (restore DB, redeploy, smoke tests)
    - Lecciones aprendidas

T7.7 — README v1.0.0
  Actualizar capturas, troubleshooting ampliado, sección "What's new in v1.0.0"

T7.8 — CHANGELOG.md con SemVer
  v1.0.0 con todas las fases

T7.9 — SECURITY.md
  Cómo reportar vulnerabilidades (correo PGP, formato, SLA respuesta 7 días)

T7.10 — CONTRIBUTING.md
  Branches, commits convencionales, PR template

T7.11 — Tag v1.0.0 + release notes
  git tag -a v1.0.0 -m "Valhalla SOC v1.0.0 — production ready"
  GitHub Release con artefactos: sbom.spdx.json, INFORME_PENTEST.md, instalador Electron .exe firmado

CRITERIOS:
  ✅ docker compose ps muestra healthy en todo
  ✅ Trivy 0 critical/high
  ✅ Backup restaura en sandbox correctamente
  ✅ Tag v1.0.0 publicado

ENTREGABLE: Tag v1.0.0 + release notes públicas.
```

---

## 🎬 BLOQUE FINAL — Verificación de cierre

```
FASE: VERIFICACIÓN — Definition of Done global
RAMA: main
DEPENDENCIAS: todas las fases mergeadas

CHECKLIST FINAL (debe estar 10/10):

  [ ] make test pasa con 0 fallos
  [ ] make security-scan reporta 0 critical/high
  [ ] docs/INFORME_PENTEST_2026-05-XX.md tiene 0 findings critical/high abiertos
  [ ] Lighthouse ≥90 en Performance/A11y/Best Practices/SEO en TODAS las vistas
  [ ] Las 14 vistas del menú son alcanzables, cargan datos reales, manejan loading/empty/error
  [ ] Login no revela credenciales por defecto
  [ ] Backup restaura en sandbox correctamente
  [ ] Wazuh detecta intentos de ataque contra el propio dashboard (honeytokens activos)
  [ ] README + MANUAL + CHANGELOG actualizados con v1.0.0
  [ ] Demo de 5 min grabada: login → overview → SIEM → workspace → ejecutar runbook → exportar reporte → audit log → logout

Si cualquiera de los 10 falla: NO mergear a main, abrir issue, corregir, repetir.

REPORTE FINAL al usuario:
  - Resumen de cada fase (qué se hizo, qué tests, qué quedó fuera de scope si algo)
  - Link al tag v1.0.0
  - Link al informe de pentest
  - Link a la demo
  - Métricas: LOC añadidas, tests nuevos, cobertura, dependencias, vulns cerradas
  - Sugerencias de mejoras futuras (v1.1.0+) — sin compromiso
```

---

## 📌 NOTAS PARA YOANDY

1. **Cómo usar este prompt:** copia el bloque de la fase actual (CONTEXTO + FASE X) en una sesión nueva de Antigravity. Cada fase es autocontenida.
2. **Orden estricto:** F0 → F1 → F2 → F3 → F4 → F5 → F6 → F7. No saltar.
3. **Validación humana:** después de cada fase, revisa el PR antes de mergear. No automerge.
4. **Si Antigravity se atasca:** consulta `docs/PLAN_MAESTRO_CIERRE_2026-05-01.md` para el contexto estratégico de la fase.
5. **Backup antes de empezar:** `git tag baseline-2026-05-01` y `pg_dump > backup_pre_v1.sql` por si hay que volver atrás.
6. **Tu rol:** revisor + product owner. Antigravity hace, tú decides si se acepta.

---

*Documento operativo. Cada fase es un commit pegable. Cero ambigüedad.*
