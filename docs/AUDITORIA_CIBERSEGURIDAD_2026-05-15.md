# AUDITORÍA DE CIBERSEGURIDAD — VALHALLA SOC

**Fecha:** 2026-05-15  
**Alcance:** Backend FastAPI, frontend React/TypeScript, Docker Compose, nginx, integraciones Wazuh / Cowrie / OpenSearch / Ollama  
**Metodología:** Revisión estática de código, configuración de despliegue, modelo de amenazas (OWASP API Security Top 10, ASVS v4)  
**Estado del código auditado:** Rama `fix/dashboard-soc-cierre` (pre-remediación de hallazgos críticos)

---

## 1. Resumen ejecutivo

| Severidad | Cantidad | Riesgo |
|-----------|----------|--------|
| **CRÍTICO** | 7 | Compromiso total del SOC |
| **ALTO** | 9 | Exfiltración, abuso de infraestructura, escalada |
| **MEDIO** | 8 | XSS/CSRF, cumplimiento, degradación |
| **BAJO** | 6 | Hardening y buenas prácticas |

**Veredicto:** La plataforma **no debe exponerse a Internet en producción** sin remediar los hallazgos críticos. Existen controles parciales bien diseñados (CSRF double-submit, JWT en cookie httpOnly, validación de evidencias, bcrypt, audit middleware), pero varios endpoints y flujos de integración quedaron abiertos o con credenciales por defecto.

**Puntuación estimada de madurez:** ~4,5 / 10

| Dominio | Nota |
|---------|------|
| Autenticación | 4/10 |
| Autorización | 3/10 |
| Protección de datos | 5/10 |
| Configuración | 4/10 |
| Logging / auditoría | 7/10 |
| Rate limiting | 4/10 |
| Frontend | 4/10 |
| Infraestructura | 5/10 |

---

## 2. Controles positivos identificados

| Control | Ubicación | Observación |
|---------|-----------|-------------|
| Hash de contraseñas | `backend/app/auth.py` | bcrypt |
| JWT en cookie httpOnly | `main.py` login | No solo Authorization header |
| CSRF double-submit | `backend/app/security.py` | POST/PUT/DELETE/PATCH |
| Validación de evidencias | `main.py` upload_evidence | Extensión, tamaño, `realpath` |
| Rate limit en login | `@limiter.limit("5/minute")` | slowapi |
| Registro intentos fallidos | `rate_limiter.record_failed_login` | Parcial (sin bloqueo activo en login) |
| Headers de seguridad | `SecurityMiddleware`, nginx | CSP, HSTS, X-Frame-Options |
| Cifrado secretos sistema | `backend/app/crypto.py` | AES-GCM (salt estático — ver M15) |
| Audit log | `AuditMiddleware` | Trazabilidad operaciones |
| `.env.example` | Raíz | Documenta variables sin secretos reales |

---

## 3. Hallazgos CRÍTICOS

### VLH-SEC-2026-001 — Usuario admin con contraseña por defecto

- **Archivo:** `backend/app/main.py` (aprox. L191-192), `scripts/reset_admin.py`
- **Detalle:** Se crea `admin` / `Valhalla2026!` si no existe.
- **Impacto:** Control total del SOC en despliegues nuevos o tras reset.
- **Remediación:** `ADMIN_PASSWORD` obligatorio en `.env`; bootstrap one-time; forzar cambio en primer login; eliminar contraseña del código.

### VLH-SEC-2026-002 — Webhook Wazuh sin autenticación

- **Archivo:** `backend/app/main.py` — `POST /api/webhook/wazuh`
- **CSRF:** Bypass en `security.py` (`bypass_paths`)
- **Impacto:** Creación masiva de tickets falsos, consumo Ollama, broadcast WebSocket.
- **Remediación:** HMAC (`X-Wazuh-Signature`), token compartido, IP allowlist del manager, rate limit.

### VLH-SEC-2026-003 — API LSA sin autenticación

- **Archivo:** `backend/app/lsa_monitor.py` — router incluido sin `Depends(get_current_user)`
- **Impacto:** Enumeración de endpoints; `POST /api/lsa/agents/{id}/harden` ejecuta active response Wazuh.
- **Remediación:** Auth + rol `admin` en todo el router; auditar cada acción.

### VLH-SEC-2026-004 — WebSocket `/ws/chat` abierto

- **Archivo:** `backend/app/main.py` L238-245
- **Impacto:** Cualquier cliente recibe alertas y mensajes de chat en tiempo real.
- **Remediación:** Validar JWT/cookie en handshake; cerrar WS en logout.

### VLH-SEC-2026-005 — Avatares públicos y path traversal

- **Archivo:** `backend/app/main.py` — `GET /api/avatars/{filename}`
- **Impacto:** Lectura de archivos fuera de `uploads/avatars` sin auth.
- **Remediación:** `os.path.basename()`, `realpath`, auth, whitelist `.jpg/.png/.webp`.

### VLH-SEC-2026-006 — Modo offline = administrador (frontend)

- **Archivos:** `frontend/app/src/store/authSlice.ts`, `AppCore.tsx`
- **Detalle:** `loginOffline()` → `role: "admin"`, token `offline-mode-token` en localStorage.
- **Impacto:** Bypass de UI de administración sin credenciales válidas.
- **Remediación:** Deshabilitar en producción; solo `VITE_DEMO_MODE` en builds demo.

### VLH-SEC-2026-007 — Secretos y puertos por defecto en infraestructura

- **Archivos:** `docker-compose.yml`, `backend/app/settings.py`, `.env.example`
- **Detalle:** OpenSearch/Postgres con `admin`/`valhalla`; puertos 9200, 5432, 8000 publicados; `SECRET_KEY` DEV por defecto.
- **Impacto:** Compromiso de cadena completa en LAN o Internet mal segmentada.
- **Remediación:** Perfil `prod` solo gateway; secretos rotados; red interna para BD/indexer.

---

## 4. Hallazgos ALTOS

| ID | Hallazgo | Archivo / endpoint | Remediación |
|----|----------|-------------------|-------------|
| VLH-SEC-2026-008 | Rate limit global no registrado | `rate_limit_middleware` importado pero no en `app.middleware()` | Registrar middleware; `check_user_blocked` en login |
| VLH-SEC-2026-009 | Informe ejecutivo opcional | `GET /api/reports/executive` + `get_current_user_optional` | Exigir auth + rol |
| VLH-SEC-2026-010 | IDOR listados | `/api/tickets`, `/api/chat/{id}`, `/api/users` | Filtrar por rol; `list_users` solo admin |
| VLH-SEC-2026-011 | JWT en localStorage | `authSlice.ts`, `setToken` tras login | Solo cookie httpOnly + `/api/auth/me` |
| VLH-SEC-2026-012 | Clave VT en cliente | `ThreatIntelView.tsx`, `X-VT-API-Key` | Solo servidor; eliminar localStorage |
| VLH-SEC-2026-013 | TLS verify=False | `opensearch_client.py`, `wazuh_client.py` | CA interna, `verify=True` |
| VLH-SEC-2026-014 | CORS permisivo | `main.py` CORSMiddleware | Orígenes explícitos; métodos/headers mínimos |
| VLH-SEC-2026-015 | Mass assignment | Tickets/IOC con `dict` | Pydantic estricto (`schemas.py`) |
| VLH-SEC-2026-016 | Avatares sin validación MIME | `upload_my_avatar` | Solo imágenes; python-magic |

---

## 5. Hallazgos MEDIOS

| ID | Hallazgo | Remediación |
|----|----------|-------------|
| VLH-SEC-2026-017 | JWT 8 h sin revocación | Refresh token, denylist, `jti` |
| VLH-SEC-2026-018 | CSRF cookie legible (XSS → CSRF) | CSP estricta; mitigar XSS |
| VLH-SEC-2026-019 | Roles `analista` vs `analyst` | Enum centralizado + migración |
| VLH-SEC-2026-020 | Reset password sin política | `InputValidator.validate_password` |
| VLH-SEC-2026-021 | Ajustes IA sin rol admin | `require_role("admin")` |
| VLH-SEC-2026-022 | Active response para cualquier autenticado | Solo admin |
| VLH-SEC-2026-023 | Errores 500 con `str(e)` | Respuestas genéricas en prod |
| VLH-SEC-2026-024 | XSS en `index.html` | `textContent` en handlers de error |

---

## 6. Hallazgos BAJOS

- OpenAPI `/docs` expuesto en producción.
- Dockerfile backend con `--reload` en desarrollo.
- Dependencias sin uso (`Flask`, etc.) en `requirements.txt`.
- `DOMPurify` instalado pero no utilizado.
- Electron `webSecurity: false`.
- Vite `host: true` en desarrollo.
- CSP nginx con `'unsafe-inline'`.
- Cobertura de tests de seguridad limitada (`tests/test_security.py`).

---

## 7. Matriz OWASP API Security Top 10

| Riesgo | Estado |
|--------|--------|
| Broken Object Level Authorization | **Fallo** |
| Broken Authentication | **Fallo** |
| Broken Object Property Level Authorization | Parcial |
| Unrestricted Resource Consumption | Parcial |
| Broken Function Level Authorization | **Fallo** |
| Unrestricted Access to Sensitive Business Flows | **Fallo** |
| SSRF | Bajo |
| Security Misconfiguration | **Alto** |
| Improper Inventory Management | Medio |
| Unsafe Consumption of APIs | Medio |

---

## 8. Superficie de ataque — Docker (resumen)

```
Internet → Gateway :8443 (recomendado único punto de entrada prod)
         → Cowrie :2222/2223 (honeypot — segmentar)
         → OpenSearch :9200 (NO exponer en prod)
         → PostgreSQL :5432 (NO exponer en prod)
         → Backend :8000 (detrás de gateway)
```

**Recomendaciones:**

1. `docker compose --profile prod up` con solo gateway HTTPS público.
2. Rotar todas las credenciales por defecto del `.env`.
3. Eliminar volumen `./backend:/app` en producción.
4. Segmentar red del honeypot Cowrie.

---

## 9. Plan de remediación priorizado

### Fase 1 — 24–48 h (bloqueantes producción)

1. Eliminar contraseña admin hardcodeada.
2. Autenticar: LSA, webhook, WebSocket, avatares, informe ejecutivo.
3. Desactivar `loginOffline` en builds de producción.
4. Rotar secretos; cerrar puertos 9200/5432 al exterior.
5. Registrar rate limit global + brute-force en login.

### Fase 2 — 1 semana

6. Corregir IDOR en tickets, chat, usuarios.
7. Pydantic estricto en endpoints con `dict`.
8. Eliminar JWT y VT de localStorage.
9. TLS con verificación de certificados.
10. Webhook con HMAC.

### Fase 3 — 2–4 semanas

11. JWT corto + refresh + revocación.
12. CSP sin unsafe-inline; DOMPurify donde aplique.
13. Suite de tests de seguridad automatizados.
14. `pip-audit` / `npm audit` en CI.
15. Deshabilitar `/docs` en producción.

---

## 10. Conclusión

Valhalla SOC muestra **madurez parcial** en logging, CSRF y gestión de evidencias, pero presenta **brechas críticas** en autorización de APIs de integración (LSA, webhook, WebSocket), credenciales por defecto y modelo de confianza del frontend (modo offline). La remediación de la Fase 1 es **prerrequisito** para cualquier exposición en entorno real o demostración académica con datos sensibles.

---

## 11. Referencias

- [OWASP API Security Top 10](https://owasp.org/API-Security/)
- [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/)
- Auditoría técnica previa: `docs/AUDITORIA_2026-04-19.md`
- Variables de entorno: `.env.example`

---

*Documento generado como parte del cierre de ciclo Valhalla SOC — mayo 2026. Los hallazgos deben revisarse tras cada despliegue mayor.*
