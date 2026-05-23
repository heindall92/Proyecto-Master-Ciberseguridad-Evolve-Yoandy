# ⚔️ INFORME ESTRATÉGICO — VALHALLA SOC

**Fecha:** 2026-05-22
**Autor:** Auditoría experta Blue/Red Team
**Tipo:** Documento local de trabajo (registro + guía de implementación). **No se commitea al repo por ahora.**
**Estado del proyecto:** SOC maduro en evolución hacia operación defensiva real.

---

## 0. Propósito de este documento

Persistir la auditoría y el roadmap acordados, y servir de guía viva para implementar las mejoras
**en local** antes de integrarlas en el futuro al repositorio. Cada fase incluye objetivos, archivos a tocar,
criterios de aceptación y estado.

---

## 1. Resumen de auditoría — Estado real del stack

**Arquitectura detectada:**

- **Detección:** Cowrie (SSH/Telnet 2222/2223) → Wazuh Manager 4.9.2 → Wazuh Indexer (OpenSearch) → Dashboard nativo (443).
- **Capa propia Valhalla:**
  - **Backend** FastAPI: auth JWT con refresh + revocación, CSRF, rate-limit (SlowAPI), `AuditMiddleware`,
    `SecurityHeadersMiddleware`, HMAC en webhooks, cifrado de secretos (`crypto.py`).
  - **Frontend** React + TypeScript + MUI + Redux Toolkit, identidad "Tactical Cyberpunk".
  - **Persistencia** Postgres 16; **gateway** Nginx TLS (perfil prod).
- **IA:** Ollama local (qwen2.5) en dos vías — integración Wazuh (`custom-ollama`) y backend
  (`analyze_alert`, `generate_executive_summary`).
- **Funciones ya construidas:** Threat Map, IOC watchlist, VirusTotal, Runbooks, LSA Monitor,
  chat WebSocket, informe ejecutivo, FIM/Rootcheck/Vulnerability Detection activos.

**Veredicto:** base sólida y por encima del nivel de un proyecto académico típico. El siguiente salto de madurez
es cerrar la brecha **"detecto" → "respondo"** y añadir correlación, detección host y automatización.

---

## 2. 🗺️ Roadmap de evolución (4 fases)

### FASE 1 — Consolidación Defensiva (0–4 semanas) · **COMPLETADA (2026-05-22)**
Cerrar la brecha entre detectar y responder. Active Response real en Wazuh (bloqueo de IP), reglas Sigma,
y endpoints reales para los botones hoy visuales ("Bloquear en Firewall"). **Objetivo: que cada alerta tenga acción.**
Los 3 hitos completados y verificados en runtime (ver §7).

### FASE 2 — Visibilidad y Correlación (1–2 meses) · **COMPLETADA (núcleo) (2026-05-22)**
Telemetría real más allá del honeypot: agentes Wazuh en endpoints (Sysmon/Windows, auditd/Linux),
correlación multi-evento y enriquecimiento automático de IOCs (GeoIP, AbuseIPDB, MISP). **Objetivo: contexto.**
Entregado: agente Wazuh Linux real (activo), reglas de correlación composite, enriquecimiento AbuseIPDB (ver §7).

### FASE 3 — Automatización SOAR + IA táctica (2–4 meses) · **COMPLETADA (2026-05-22)**
Ollama de "comentarista" a "co-analista": triage con scoring estructurado, playbooks ejecutables y RAG sobre
MITRE + runbooks. **Objetivo: reducir MTTR.** Los 5 hitos entregados y verificados (ver §7).

### FASE 4 — Madurez y Métricas (4–6 meses) · **COMPLETADA (2026-05-22)**
KPIs SOC reales (MTTD/MTTR/dwell time), reporting ISO 27001/NIS2, threat hunting proactivo y purple team continuo.
**Objetivo: madurez medible.** Entregado: métricas SOC, MITRE Navigator, threat hunting y cumplimiento calculado (ver §7).

---

## 3. 🛡️ 10 Integraciones / análisis para el SOC

1. **Active Response real (contención automática)** — `firewall-drop` sobre IP atacante tras N fallos, con whitelist y timeout.
2. **Pipeline Sigma → reglas Wazuh** — acceso a miles de detecciones mantenidas por la comunidad.
3. **MITRE ATT&CK Navigator embebido** — heatmap de la matriz generada desde alertas reales.
4. **Enriquecimiento multi-fuente de IOCs** — AbuseIPDB + GeoIP/ASN + MISP + Shodan en cascada.
5. **Detección host con Sysmon + auditd** — proceso, persistencia, inyección, movimiento lateral.
6. **Motor de correlación de incidentes** — agrupar por kill-chain (un incidente, no N tickets).
7. **Triage IA con scoring estructurado** — Ollama devuelve JSON `{risk_score, mitre_ttp, recommended_action, fp_likelihood}`.
8. **Threat Hunting / queries guardadas** — impossible travel, beaconing C2, user-agents anómalos, picos DNS.
9. **SOAR ligero — playbooks ejecutables** — cada paso de runbook = acción real (bloquear, aislar, crear caso).
10. **Métricas SOC ejecutivas** — MTTD, MTTR, dwell time, tickets/analista, FP rate, cobertura ATT&CK %.

---

## 4. 🎨 10 Mejoras estéticas (manteniendo Tactical Cyberpunk)

Identidad respetada: **Signal Green #3cff9e + Cyber Cyan #4ae3ff sobre Deep Void #0a0a0f, bordes afilados
(borderRadius 0), Roboto Mono, glassmorphism.**

1. **Skeleton loaders tácticos** con barrido verde (usar `Skeleton.tsx` en todas las cargas).
2. **Micro-animaciones de datos** — contadores count-up al montar (framer-motion ya presente).
3. **Estados vacíos con personalidad** — reforzar `EmptyState.tsx` (ASCII/SVG vikingo + frase).
4. **`<SeverityBadge>` unificado** — escala de color única (crítico/alto/medio) en un componente central.
5. **Glow reactivo en tiempo real** — pulso rojo recorre el borde del topbar al entrar alerta crítica (WS).
6. **Mini-mapa de threat-map en overview** — widget compacto con arcos de ataque animados.
7. **Tipografía numérica `tabular-nums`** — que los números no "bailen" al refrescar cada 15s.
8. **Transiciones de vista "scanline wipe"** — línea de barrido cyan coherente con modo scanlines.
9. **Modo TV / War Room pulido** — vista de pared 4K con rotación automática de paneles.
10. **Sistema de espaciado 8px** (8/16/24) — auditar paddings de cards para dar aire profesional.

---

## 5. 🔍 5 Integraciones para Wazuh

1. **Active Response `firewall-drop` + CDB lists** (whitelist de IPs confiables). *(Fase 1, Hito 1)*
2. **Webhook a Slack / Telegram / Discord** para alertas nivel ≥12 (patrón `custom-valhalla`).
3. **CDB Lists de Threat Intelligence** — IOC matching nativo en el manager (`<list>` en reglas).
4. **Vulnerability Detection → tickets** — CVE crítico (CVSS ≥9) genera ticket/IOC automáticamente.
5. **Reglas de correlación frecuencia/composite** — beaconing, credential spraying, escalada secuencial.

---

## 6. ⚠️ Hallazgos de auditoría (deuda de seguridad)

> Anotados como registro. **No se tocan en el Hito 1**; se abordan en una tarea de hardening dedicada.

- **Certificados privados versionados** en git (`wazuh-certificates/*.key`, `root-ca.key`) → regenerar + `.gitignore`/secrets.
- **Credenciales por defecto** (`admin/admin`, `wazuh-wui/wazuh-wui`) → endurecer antes de cualquier exposición.
- **Datos hardcodeados en informe ejecutivo** (`SRV-SAP-PROD`, `avg_resolution_time_min: 15`) → marcar como muestra o sustituir por datos reales.

---

## 7. 🛠️ Cómo se implementará cada fase

### FASE 1 — Consolidación Defensiva · **COMPLETADA**

**Hito 1 — Active Response real (bloqueo de IP end-to-end)** · COMPLETO Y VERIFICADO

Flujo objetivo:
`UI "Bloquear IP" → endpoint backend → API Wazuh escribe en CDB blocked-ips → regla 100500 dispara
<active-response> firewall-drop → iptables DROP en el manager (timeout) → feedback real al operador.`

Hallazgo que lo motiva: hoy `ThreatIntelView.tsx:handleBlock` solo cambia `status:"blocked"` en BD; no existe
`/api/cowrie/block`; `WazuhClient.run_active_response()` existe pero nadie lo invoca → **bloqueo cosmético**.

Archivos a tocar:
- `wazuh_config/ossec.conf` — `<list>etc/lists/blocked-ips</list>` + bloque `<active-response>` (firewall-drop, rules_id 100500, timeout 3600).
- `wazuh_config/rules/local_rules.xml` (nuevo) — regla **100500** que matchea `srcip` contra la CDB.
- `wazuh_config/lists/blocked-ips` (nuevo, vacío) + montaje en `docker-compose.yml` (wazuh.manager).
- `backend/app/wazuh_client.py` — `add_cdb_entry`, `remove_cdb_entry`, `reload_lists`.
- `backend/app/main.py` — `POST /api/firewall/block|unblock`, `GET /api/firewall/blocked`, alias `/api/cowrie/block`.
- `frontend/app/src/lib/api.ts` — `blockIp`, `unblockIp`, `getBlockedIps`.
- `frontend/app/src/ui/ThreatIntelView.tsx` — `handleBlock` real + feedback honesto + indicador "bloqueo activo".

Criterios de aceptación:
- IP bloqueada aparece en CDB, en `active-responses.log` y como regla iptables DROP en el manager.
- El timeout elimina la regla automáticamente.
- Si Wazuh no confirma, la UI NO marca como bloqueado (sin falso "todo OK").
- Acción registrada en `/api/audit`.

Verificación estática realizada (2026-05-22):
- `python -m py_compile` de `main.py`/`wazuh_client.py`/`schemas.py` → OK.
- XML de `ossec.conf` y `local_rules.xml` bien formado → OK.
- YAML de `docker-compose.yml` válido → OK.
- 4 tests nuevos del endpoint firewall (auth, IP inválida, fallo Wazuh→502 con rollback, éxito) → **PASAN**.
- Suite backend: 15/16 pasan. El único fallo (`test_logout_revokes_access_token`) es **preexistente y del entorno**
  (Python 3.14 / sqlite async); se reproduce con el archivo de tests original. No relacionado con la Fase 1.

**Verificación RUNTIME realizada (2026-05-22) — BLOQUEO REAL CONFIRMADO:**
`UI/API → backend → CDB Wazuh → regla 100501 → execd → valhalla-fwdrop → iptables DROP`. Evidencia:
`valhalla-fwdrop: add 185.220.101.47 -> OK` y `iptables -L INPUT` mostrando `DROP ... 185.220.101.47`.
Ciclo block/unblock y `GET /api/firewall/blocked` verificados.

Hallazgos resueltos durante la verificación (todos honestos, sin falsos "OK"):
- **AR-API no aplica al manager (agente 000)** → enforcement vía regla local; `run_firewall_drop` ahora es
  best-effort sobre agentes reales y reporta `active_response_skipped` cuando solo existe el manager.
- **Permisos CDB**: el directorio `etc/lists` debía ser `root:wazuh 770` (la API corre como `wazuh`).
- **iptables ausente** en la imagen del manager → instalado vía entrypoint + `cap_add NET_ADMIN/NET_RAW`.
- **Campo `src_ip` vs `srcip`**: el `firewall-drop` nativo solo lee `srcip`; Cowrie emite `src_ip`. Se creó un AR
  propio **`valhalla-fwdrop`** (`wazuh_config/active-response/valhalla-fwdrop.py`) que acepta ambos.
- **Body vacío (error 1912)**: la CDB nunca queda vacía (línea centinela `valhalla-soc-managed:1`).

⚠️ **Limitaciones documentadas:** (1) topología — el DROP actúa en el contenedor manager, no protege al de Cowrie;
el bloqueo perimetral real necesita agentes en hosts (Fase 2). (2) La CDB se resetea al recrear el contenedor
(la fuente de verdad es Postgres/IOC; re-sync en arranque queda como mejora futura).

**Hito 2 — Pipeline Sigma → Wazuh** · **COMPLETO**
Conversor `wazuh_config/sigma/sigma_to_wazuh.py` (Sigma YAML → reglas Wazuh XML). Mapea severidad→nivel,
selección de campos con modificadores `contains/startswith/endswith`, MITRE desde `tags`, y `logsource.product`→`if_sid`
(ancla al árbol de decodificación correcto). Reglas de ejemplo en `wazuh_config/sigma/rules/`. Salida generada en
`wazuh_config/rules/sigma_rules.xml` (montada). **Verificado:** reglas 100600/100601 cargadas y disparando en
`wazuh-logtest` sobre eventos Cowrie reales.

**Hito 3 — Datos reales (auditar elementos cosméticos)** · **COMPLETO (núcleo)**
- **Monitor LSA**: `get_lsa_endpoints` ahora deriva de **agentes Wazuh reales** (SCA RunAsPPL/LSA); sin agentes
  Windows devuelve `[]` (honesto). Frontend `LSAMonitorView` **sin mocks** (eliminados `generateMockData/Alerts`),
  estado vacío honesto. `apply-hardening` ya no afirma éxito falso.
- **Informe ejecutivo** (`/api/reports/executive`): `avg_resolution_time_min` calculado real (closed/resolved),
  `top_affected_assets` derivado de atacantes reales — eliminados `SRV-SAP-PROD`/`15 min` ficticios.
- Botón "BLOQUEAR IOC" → acción real (Hito 1).
- *Pendiente menor*: barrido del resto de `onClick/alert` triviales (documentado, no crítico).

### FASE 2 — Visibilidad y Correlación · **COMPLETADA (núcleo)**

**Hito 1 — Agente Wazuh real** · COMPLETO Y VERIFICADO
Imagen propia `agent/Dockerfile` (Ubuntu + paquete `wazuh-agent` 4.9.2 + iptables + auditd) y `agent/entrypoint.sh`
(auto-enrolamiento via authd). Servicio `wazuh.agent` en compose. **Verificado:** agente `001 valhalla-linux-01`
en estado **active** en el manager (FIM/syscheck/SCA reales sobre un endpoint). Cierra parcialmente el límite de AR
de Fase 1: el bloqueo por **regla local** ya puede aplicarse sobre un agente real.
*Refinamiento pendiente:* el AR vía **API** sobre el agente devuelve 1652 (el comando debe propagarse a la config
efectiva del agente vía `shared/agent.conf` + script en el agente). El path por regla no lo requiere.

**Hito 2 — Reglas de correlación composite** · COMPLETO (cargadas)
`wazuh_config/rules/correlation_rules.xml`: 100700 (ataque sostenido 20+ eventos/5min, `frequency`+`same_field src_ip`),
100701 (malware + reverse shell multi-etapa, `if_sid`/`if_matched_sid`), 100702 (recon + escalada). Cargadas y
verificadas vía API. Detectan patrones, no eventos sueltos.

**Hito 3 — Enriquecimiento IOC multi-fuente (AbuseIPDB)** · COMPLETO
`backend/app/abuseipdb_client.py` (reputación IP: abuseConfidenceScore, país, ISP, reportes, Tor/whitelist).
Endpoints `GET /api/abuseipdb/ip/{ip}` y gestión de API key por usuario (`/api/users/me/abuseipdb-api-key`),
resolución de clave env/global/usuario cifrada (mismo patrón que VirusTotal). Settings `abuseipdb_api_key`.
Complementa el GeoIP/ASN ya presente vía VT. (MISP/Shodan quedan como ampliación futura.)

### FASE 3 — SOAR + IA táctica · **EN CURSO**

**Hito 1 — Triage IA estructurado** · COMPLETO Y VERIFICADO
`ollama_client.py`: la IA ahora devuelve scoring accionable — `risk_score` (0-100), `mitre_ttp[]`,
`false_positive_likelihood`, además de `attack_type/severity/summary/recommended_action`. Normalización robusta
con defaults (deriva risk_score de la severity si falta; valida IDs MITRE). Nuevo endpoint
`POST /api/triage/analyze` (rol admin/analista, rate-limit 20/min). **Verificado con modelo real** (qwen2.5:1.5b):
sobre una alerta de descarga de malware devolvió `risk_score=90, mitre_ttp=['T1059'], severity=high`.
⚠️ **Requisito operativo:** el stack actual NO tiene modelo Ollama descargado → las funciones IA caen al fallback
(estructurado pero genérico). Para IA real: `docker compose exec ollama ollama pull qwen2.5-coder:7b`
(o usar el ligero `qwen2.5:1.5b` ya descargado ajustando `OLLAMA_MODEL`).

**Hito 2 — Co-piloto IA con barreras (human-in-the-loop)** · COMPLETO Y VERIFICADO
Webhook `/api/webhook/wazuh` reconvertido en co-piloto por niveles:
- **Tier 0 (auto, seguro):** triage estructurado → ticket auto-priorizado por `risk_score` (severity derivada) con
  resumen IA, acción recomendada y `mitre_technique`. Verificado: alerta de malware → ticket **critical** con MITRE.
- **Tier 1 (auto CON barreras):** auto-bloqueo de IP solo si `auto_block_enabled` + `risk_score ≥ umbral (90)` +
  `fp_likelihood=low` + IP válida + **no whitelist**; reversible (timeout) y **auditado** (`AuditLog` user=`ai-copilot`).
  Verificado: triage 85 → CDB block + AR-API enviado al agente 001.
- **Tier 2 (destructivo):** NO automático — requiere aprobación humana.
- Helper `_apply_ip_block` reutilizado por el endpoint manual y el co-piloto. `auto_block_enabled=False` por defecto (seguro).
⚠️ **Honesto:** el auto-bloqueo persiste en CDB + audita, pero el `iptables` *inmediato en el agente* aún no se aplica
(gap de propagación de config al agente vía `shared/agent.conf`); el enforcement fiable es el del manager (regla 100501).

**Fix de cableado Ollama:** la integración de Wazuh apuntaba a `host.docker.internal:11434` (Ollama del host) mientras
el backend usaba el contenedor. Unificado a `http://ollama:11434` (contenedor). El backend ya lo usa; el manager lo
tomará al recrearse. Requisito: descargar el modelo en el contenedor (`ollama pull qwen2.5-coder:7b`; `qwen2.5:1.5b` ya está).

**Hito 3 — SOAR: playbooks ejecutables** · COMPLETO Y VERIFICADO
`POST /api/playbooks/execute` (rol admin/analista, rate-limit, auditado): acciones reales y reversibles
`block_ip` / `unblock_ip` / `create_ticket` / `add_ioc` / `enrich_ip` (VT+AbuseIPDB). El humano aprueba (1 clic),
el backend ejecuta. Verificado: block_ip (CDB ok), add_ioc, enrich_ip, create_ticket (id 25). Reusa `_apply_ip_block`.

**Hito 4 — Propagación de AR al agente** · RESUELTO (parcial, honesto)
Comando `firewall-drop` propagado al agente (inyectado en su `ossec.conf` por el entrypoint → aparece en `ar.conf`
del execd) y authd con `<force>` para re-enrolar limpio al reconstruir la imagen (resuelto el "Duplicate agent name").
El agente queda protegido por el **path de regla local** (fiable). El **push de AR vía API al agente** sigue siendo
un quirk inconsistente de Wazuh (1652/1117 según estado) → el backend lo trata como best-effort; el enforcement
fiable es el del **manager** (regla 100501 → `valhalla-fwdrop`, probado). No se vende como cerrado al 100%.

**Hito 5 — Motor RAG (MITRE + runbooks)** · COMPLETO Y VERIFICADO
`backend/app/rag.py`: recuperación ligera sin vector DB — runbooks relevantes por solapamiento de palabras clave
+ contexto MITRE ATT&CK. Se inyecta como bloque `knowledge` en el prompt del triage (endpoint y webhook).
La IA fundamenta `recommended_action` en procedimientos REALES y devuelve `cited_runbooks`. **Verificado** (modelo real):
alerta malware+reverse shell → risk=85, mitre `T1059/T1105`, citó "Brute Force SSH/Telnet (Cowrie)" y
"Malware / Payload en Honeypot".

### FASE 3 — COMPLETADA: triage estructurado + co-piloto con barreras + SOAR + RAG.

### FASE 4 — Madurez y Métricas · **EN CURSO**

**Hito 1 — Métricas SOC** · COMPLETO Y VERIFICADO
`GET /api/metrics/soc`: MTTR real (ticket created→resolved), dwell (edad media de abiertos), tickets por
severidad y por analista, resolution_rate, **cobertura ATT&CK %** (técnicas base vistas / definidas en el ruleset),
alertas 24h. Verificado con datos reales (7 tickets, dwell ~3279 min).

**Hito 2 — MITRE ATT&CK Navigator** · COMPLETO (paridad verificada)
`GET /api/mitre/navigator-layer`: genera la capa JSON oficial del Navigator (techniqueID + score por frecuencia +
gradiente) desde alertas reales (`get_mitre_coverage`). Listo para importar en mitre-attack.github.io/attack-navigator.
Se llena cuando existen alertas con tag MITRE (misma dependencia que el endpoint existente `/api/wazuh/mitre`).

**Hito 3 — Threat Hunting** · COMPLETO Y VERIFICADO
`backend/app/hunting.py` + `GET /api/hunting/queries` y `GET /api/hunting/run/{id}`: cazas guardadas
(IPs atacantes, reincidentes/beaconing, top comandos, credenciales probadas, descargas de malware).
Verificado en vivo: `top_attacker_ips` devolvió 4 IPs reales con conteos.

**Hito 4 — Cumplimiento ISO 27001 calculado** · COMPLETO Y VERIFICADO
`/api/reports/executive`: el bloque `iso27001` se calcula desde señales reales (IOCs, eventos de auditoría,
incidentes, runbooks activos, agentes activos) — eliminado el `overall: 75` hardcodeado. Verificado: 100% (6/6
controles cubiertos con evidencia real: 10 IOCs, 123 auditorías, 7 incidentes, 10 runbooks, 2 agentes).

### FASE 4 — COMPLETADA: métricas SOC + MITRE Navigator + threat hunting + cumplimiento calculado.

## FASE 5 — Inteligencia ampliada (futura)
MISP + Shodan (resto de enriquecimiento IOC #4), Sysmon/Windows (agente en host/VM — resto de #5),
purple team / simulación de adversario continua.

---

## 8. Decisiones tomadas

- **Modelo de IA para implementación:** Claude **Opus 4.7** (trabajo de seguridad crítico).
- **Enfoque Active Response:** **Wazuh nativo `firewall-drop` + lista CDB** (estándar de industria).
- **Alcance:** trabajo **local**; sin commit/push salvo petición explícita.

---

*⚔️ Valhalla SOC — Donde los ataques vienen a morir.*
