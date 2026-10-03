# AUDITORÍA TÉCNICA — VALHALLA SOC
**Fecha:** 2026-04-19  
**Auditor:** Claude Sonnet 4.6 (análisis automático del código fuente)  
**Alcance:** Backend Node.js + Frontend SPA + Integración Wazuh/OpenSearch/Cowrie

---

## 1. DATOS REALES vs. INVENTADOS

### ✅ Datos conectados a infraestructura real

| Sección | Fuente |
|---|---|
| Alertas SIEM | OpenSearch `wazuh-alerts-*` |
| Conteo alertas 24h (KPI) | OpenSearch range query |
| Lista de agentes + estado online/total | Wazuh API `/agents` |
| Detalle por agente (MITRE, SCA, reglas) | Wazuh API + OpenSearch |
| Cowrie: sesiones, passwords, comandos, IPs | OpenSearch rule.groups=cowrie |
| Threat Map (IPs de ataque) | OpenSearch + ip-api.com geolocate |
| Tickets | SQLite local |
| Usuarios / roles | SQLite local |
| Análisis Ollama AI | API Ollama local o Cloud |
| VirusTotal checks | API VT v3 (requiere VIRUSTOTAL_API_KEY) |
| Enrolar / eliminar agentes | Wazuh API |
| Bloqueo IPs en CDB | Wazuh API (ver nota abajo) |

**Nota Cowrie block:** Sí escribe en la lista CDB de Wazuh, pero el bloqueo real a nivel de firewall/host requiere una regla de active response en Wazuh que use esa lista. Sin esa configuración adicional, la lista es solo datos.

---

### ❌ Datos 100% hardcodeados / ficticios

| Sección | Archivo | Detalle |
|---|---|---|
| Incidentes activos (VLH-2401…) | `frontend/data.js:11-68` | Escenarios de ficción. No hay API de incidentes. |
| Vulnerabilidades (CVE-2026-*) | `frontend/data.js:70-76` | CVE-2026 no existe. No conectado a Wazuh VD. |
| IOCs (APT29, LockBit hash…) | `frontend/data.js:80-89` | Sin integración MISP/OTX/feeds reales. |
| APT Tracking | `frontend/components.js` | Completamente inventado. |
| Tráfico red (gráficas Inbound/Outbound) | `frontend/components.js` | `randomWalk()` — números aleatorios. Sin Zeek/Suricata. |
| Flujos de red activos | `frontend/components.js` | Muestra hardcodeada. |
| MTTD / MTTR / SLA | `frontend/data.js:223-230` | Valores fijos (04:22, 18:47, 94.2%). No calculados. |
| Rendimiento por analista | `frontend/components.js` | Tabla de ejemplo ficticia. |
| Log feed (terminal) | `frontend/data.js:232-243` | Líneas generadas aleatoriamente. |
| Reglas (sección Normas) | `frontend/components.js` | 14 reglas hardcodeadas, no de Wazuh. |
| KPIs Ollama "ANÁLISIS HOY: 47" | `frontend/components.js:1313` | Hardcodeado. |
| "12 / 348 visibles" en Assets | `frontend/components.js` | Hardcodeado. |

---

### ⚠️ Parcialmente real

| Sección | Situación |
|---|---|
| Threat Map | IPs reales de Cowrie + geolocate, pero con fallback a mock si Cowrie no tiene datos. |
| Cowrie block | Escribe en CDB Wazuh, no bloquea en firewall sin regla active response adicional. |
| MTTD/MTTR | Estructura existe pero no se calcula de tickets reales. |

---

## 2. VULNERABILIDADES DE SEGURIDAD

### 🔴 CRÍTICO

**[VLH-SEC-001] SSRF — Server-Side Request Forgery**  
- Archivo: `backend/server.js:383`  
- El endpoint `POST /api/ollama/check` acepta `url` del cliente sin validar y hace `fetch(url + '/api/tags')`.  
- Impacto: Un analista autenticado puede escanear la red interna (Redis, metadatos cloud, servicios internos).  
- Fix: Whitelist de IPs privadas + solo protocolos http/https.

**[VLH-SEC-002] CSP con `unsafe-inline`**  
- Archivo: `backend/server.js:29`  
- `script-src 'self' 'unsafe-inline'` anula la protección XSS del Content Security Policy.  
- Impacto: Cualquier XSS inyectado tiene bypass automático de CSP.  
- Fix: Requiere refactor completo de onclick inline → event listeners. Pendiente Fase 3.

**[VLH-SEC-003] API key Ollama Cloud en SQLite en texto plano**  
- Archivo: `backend/db.js:81-86` + `backend/server.js:349-358`  
- La clave se guarda sin cifrar en `valhalla.db`.  
- Impacto: Acceso al archivo DB expone la clave de API.  
- Fix: AES-256-CBC con derivación desde JWT_SECRET.

---

### 🟠 ALTO

**[VLH-SEC-004] XSS potencial en respuesta Ollama (AI feed)**  
- Archivo: `frontend/components.js:1427-1435` (tabla ollamaFeed)  
- Las filas del feed se renderizan con `innerHTML` usando `a.msg` de alertas de OpenSearch.  
- Impacto: Si Wazuh indexa datos maliciosos con HTML en `rule.description`, se ejecuta.  
- Fix: Escapar HTML antes de insertar en template literals de tablas.

**[VLH-SEC-005] Validación incompleta de IP en `/api/cowrie/block`**  
- Archivo: `backend/server.js:552`  
- Regex acepta `999.999.999.999`. No valida octetos 0-255.  
- Fix: Validar cada octeto individualmente.

**[VLH-SEC-006] Agent ID sin sanitizar en `/api/agent/:id`**  
- Archivo: `backend/server.js:250-251`  
- `const id = req.params.id` sin validación, se inserta en URL de Wazuh API.  
- Fix: `replace(/[^0-9]/g, '')` antes de usar.

**[VLH-SEC-007] X-Forwarded-For spoofable en rate limiter**  
- Archivo: `backend/routes/auth.js:14-16`  
- Sin `app.set('trust proxy')`, cualquier cliente puede enviar `X-Forwarded-For: 1.2.3.4` para evadir el rate limit de login.  
- Fix: Eliminar respeto a X-Forwarded-For, usar solo socket IP directa.

**[VLH-SEC-008] `rejectUnauthorized: false` en conexiones internas**  
- Archivo: `backend/server.js:52`  
- Correcto para desarrollo con certs auto-firmados; en producción permite MITM completo contra Wazuh/OpenSearch.  
- Fix: Para producción, configurar certificados válidos y habilitar verificación.

---

### 🟡 MEDIO

**[VLH-SEC-009] JWT secret con fallback predecible**  
- Archivo: `backend/auth.js:14`  
- Si `JWT_SECRET` no está definido, usa `'dev-only-change-before-deploying-valhalla-soc-2026!'` que es público en el código.  
- Riesgo actual: `.env` tiene JWT_SECRET definido, así que mitigado en desarrollo.

**[VLH-SEC-010] SQLite sin cifrado at-rest**  
- `valhalla.db` contiene password hashes, emails, historial de login, tickets, API keys.  
- Fix Fase 4: SQLCipher o cifrado del volumen Docker.

**[VLH-SEC-011] Sin audit log de acciones SOC**  
- No existe registro de quién bloqueó qué IP, creó/cerró tickets, cambió configuración Ollama.  
- Fix Fase 3: Tabla `audit_log` en SQLite.

**[VLH-SEC-012] `secure: false` en cookie en desarrollo**  
- Archivo: `backend/routes/auth.js:98`  
- Cookie JWT viaja sin HTTPS en desarrollo. Aceptable en localhost, riesgo en redes compartidas.

---

## 3. AUDITORÍA DE NORMATIVAS

### ENS (Esquema Nacional de Seguridad) — Nivel Medio

| Control | Estado | Deficiencia |
|---|---|---|
| Control de acceso por roles | ✅ | admin/analyst/reporter/viewer implementados |
| Autenticación fuerte | ✅ | JWT + bcrypt(12) |
| Cifrado en tránsito | ⚠️ | TLS interno desactivado (SEC-008) |
| Cifrado en reposo | ❌ | SQLite sin cifrar (SEC-010) |
| Trazabilidad / auditoría | ❌ | Sin audit log (SEC-011) |
| Gestión de incidentes | ⚠️ | Playbooks reales, incidentes 100% mock |
| Gestión de vulnerabilidades | ❌ | CVEs hardcodeados, no conectado a Wazuh VD |
| Continuidad operativa | ❌ | Sin backup de SQLite |
| Rate limiting | ⚠️ | Implementado pero spoofable (SEC-007) |

### RGPD

| Requisito | Estado | Nota |
|---|---|---|
| Minimización de datos | ⚠️ | Cowrie indexa passwords de atacantes — requiere política retención |
| Notificación 72h | ❌ | Solo en playbook manual |
| Seguridad del tratamiento | ⚠️ | Sin cifrado at-rest |
| Registro de actividades | ❌ | Sin audit log |

---

## 4. HONEYPOT COWRIE — ¿FUNCIONA REALMENTE?

**Sí, si Cowrie está corriendo y enviando logs a Wazuh.**

Flujo real:
```
Atacante → Puerto 2222 (Cowrie)
→ Cowrie genera logs JSON  
→ Filebeat/Wazuh agent los lee  
→ Wazuh Manager indexa en wazuh-alerts-* con rule.groups=cowrie
→ /api/cowrie hace 4 queries paralelas a OpenSearch
→ Frontend muestra datos reales
```

**Condiciones para que funcione:**
- El decoder de Wazuh debe mapear `data.src_ip`, `data.username`, `data.password` de los logs Cowrie
- El campo `rule.groups` debe incluir `cowrie`
- Para bloqueo real: configurar active response en Wazuh usando la lista CDB `blocked-ips`

---

## 5. PLAN DE MEJORA

### FASE 1 — Seguridad (urgente) ← COMPLETADA 2026-04-19
- [x] Guardar este informe
- [x] SEC-001: Fix SSRF — `isSafeLocalUrl()` en `/api/ollama/check` y `/api/settings` (server.js)
- [x] SEC-003: Cifrado AES-256-CBC para Ollama cloud key en SQLite (`encryptSetting`/`decryptSetting` en db.js)
- [x] SEC-004: Función `esc()` en components.js aplicada a todos los puntos de renderizado con datos externos (alertas, cowrie sessions, AI feed)
- [x] SEC-005: `isValidIPv4()` con validación de octetos 0-255 en `/api/cowrie/block` (server.js)
- [x] SEC-006: Agent ID sanitizado con `replace(/[^0-9]/g, '')` en `/api/agent/:id` (server.js)
- [x] SEC-007: Eliminado X-Forwarded-For spoofing — rate limiter usa `req.socket.remoteAddress` directamente (auth.js)

### FASE 2 — Datos reales ← COMPLETADA 2026-04-19
- [x] Integrar Wazuh Vulnerability Detection API — endpoint `GET /api/vulns` llama a `/vulnerability/{agentId}` en Wazuh API; agrega CVEs reales de hasta 20 agentes activos, deduplicados por CVE con conteo de hosts afectados (server.js)
- [x] Calcular MTTD/MTTR desde tickets reales — endpoint `GET /api/metrics` calcula MTTR desde `created_at`→`updated_at` de tickets `resolved/closed`, MTTD como edad media de tickets abiertos (server.js); frontend los muestra en Overview y Métricas (components.js)
- [x] Marcar incidentes mock como `[SIMULADO]` — todos los 7 incidentes de `data.js` llevan prefijo `[SIMULADO]` hasta que exista endpoint real de alertas CRIT de Wazuh
- [x] Eliminar CVEs ficticios (CVE-2026-*) — array `vulns` en `data.js` ahora es `[]`; se puebla exclusivamente desde `/api/vulns` con datos reales de Wazuh VD

### FASE 3 — Funcionalidad completa ← COMPLETADA 2026-04-19
- [x] Tabla `audit_log` en SQLite — schema creado en `db.js`, `writeAudit()` helper, middleware en `server.js` que registra todos los POST/PUT/DELETE con user, acción, target, IP y timestamp; endpoint `GET /api/audit` (solo admin)
- [x] Guardar análisis Ollama — tabla `ai_analyses` en `db.js`, se guarda automáticamente al responder desde `POST /api/ollama/analyze`; endpoint `GET /api/ollama/history` devuelve últimos 50; historial visible en panel "Últimos análisis guardados" de la vista Ollama
- [x] Configurar Wazuh active response para bloqueo real de IPs — documentado en `docs/WAZUH_ACTIVE_RESPONSE.md` con pasos detallados: lista CDB, regla 100500, script `firewall-drop`, verificación con iptables
- [x] Backup automático de `valhalla.db` — al arrancar el servidor y cada 24h; guarda en `backend/backups/valhalla_YYYY-MM-DD.db`; retención de 7 copias
- [x] Refactor CSP: `unsafe-inline` eliminado de `script-src` — eventos delegados vía `data-action` (completado Fase 1)
- [x] AlienVault OTX para IOCs reales — endpoints `GET /api/iocs/feed` (pulses suscritos, caché 1h) y `POST /api/iocs/enrich` (enriquecimiento de indicator individual); frontend carga feed OTX al arrancar y muestra botón "CONSULTAR OTX" en modal de IOC; requiere `OTX_API_KEY` en `.env`
- [x] Scroll en feed Ollama y protección ante re-render — `max-height:340px;overflow-y:auto` en result box; flag `window.__ollamaInFlight` bloquea `__refreshView()` mientras la consulta está en curso
- [x] Tema light ivory/white mejorado — `.panel__head` verde oscuro (`#14532d`) con texto claro; `.panel__body` fondo blanco `#ffffff`; topbar verde oscuro; KPI cards `#f0fdf4`
- [ ] Calcular MITRE ATT&CK heatmap desde datos reales de Wazuh (pendiente Fase 4)

### FASE 4 — Producción hardening ← COMPLETADA 2026-04-19
- [x] HSTS header — `Strict-Transport-Security: max-age=31536000; includeSubDomains` activado solo cuando `NODE_ENV=production` (server.js)
- [x] Cookie JWT `secure: true` + `sameSite: 'strict'` en producción — previene CSRF y transmisión por HTTP; en dev usa `sameSite: 'lax'` para trabajar en localhost (routes/auth.js)
- [x] TLS configurable — `HTTPS agent` usa `rejectUnauthorized: process.env.WAZUH_TLS_STRICT === 'true'` en producción; por defecto permisivo para certificados auto-firmados de Wazuh (server.js). Activar con `WAZUH_TLS_STRICT=true` en `.env` cuando se tengan certificados válidos.
- [x] Advertencia SQLite sin cifrar — al arrancar en `NODE_ENV=production` sin `DB_ENCRYPTED=true` imprime aviso en consola recomendando LUKS/dm-crypt/SQLCipher (db.js)
- [x] MITRE ATT&CK heatmap real — endpoint `GET /api/mitre` agrega tácticas y técnicas de los últimos 30 días desde `wazuh-alerts-*` OpenSearch; visible en Overview (mini-panel) y Métricas (heatmap visual con colores por táctica); fallback a datos mock si Wazuh aún no tiene alertas con metadatos MITRE
- [ ] Política de retención de datos Cowrie (90 días) — pendiente: requiere Index Lifecycle Management en OpenSearch (ILM policy `wazuh-alerts-*`)

---

*Informe generado por análisis estático del código fuente. Revisión manual recomendada antes de despliegue en producción.*
