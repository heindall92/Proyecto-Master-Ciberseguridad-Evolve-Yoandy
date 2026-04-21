# Informe de Mejoras — Dashboard Overview
## Valhalla SOC · Rama `feature/dashboard-mejoras`

| Campo           | Detalle                                              |
|-----------------|------------------------------------------------------|
| **Fecha**       | 2026-04-21                                           |
| **Autor**       | Yoandy                                               |
| **Rama Git**    | `feature/dashboard-mejoras`                          |
| **Commit**      | `4d2dc3b`                                            |
| **Archivos**    | `backend/server.js` · `frontend/components.js` · `frontend/app.js` · `frontend/data.js` |
| **Revisión PR** | https://github.com/saantiidp/Valhalla-SOC/pull/new/feature/dashboard-mejoras |

---

## Contexto

La sección **Overview** del dashboard Valhalla SOC mostraba hasta ahora datos
completamente ficticios («mock»): contadores hardcodeados, gráficas generadas
con `randomWalk()` y técnicas MITRE inventadas. El objetivo de esta iteración
es reemplazar todos esos valores por datos reales provenientes del stack
desplegado (Wazuh OpenSearch + Wazuh Manager API + SQLite backend).

---

## Mejoras implementadas

### Mejora 1 — Datos reales de Wazuh en los KPIs principales

**Problema anterior:**
```js
Kpi('ALERTAS / 24H', '2,481', ...)   // hardcodeado
Kpi('INCIDENTES',    '07', ...)       // hardcodeado
```

**Solución:**
- Se creó el endpoint `/api/overview` en `backend/server.js` que realiza una
  consulta de rango a OpenSearch (`wazuh-alerts-*`) para las últimas 24 horas.
- Los incidentes activos se obtienen contando tickets en estado `open` /
  `in_progress` directamente desde la base de datos SQLite.
- Los valores en pantalla se actualizan via DOM (`document.getElementById`)
  sin reconstruir la vista entera.
- El KPI del topbar (`#kpi-alerts`) también se sincroniza con el mismo dato.

**IDs DOM asignados:**
| KPI                | ID DOM              | Fuente de datos          |
|--------------------|---------------------|--------------------------|
| Alertas / 24h      | `kpi-ov-alerts24h`  | OpenSearch aggregation   |
| Incidentes activos | `kpi-ov-incidents`  | SQLite tickets table     |
| MTTD promedio      | `kpi-ov-mttd`       | `/api/metrics` (SQLite)  |
| MTTR promedio      | `kpi-ov-mttr`       | `/api/metrics` (SQLite)  |

---

### Mejora 2 — KPIs de severidad y estado de agentes

**Problema anterior:** No había visibilidad de la distribución de severidad ni
del estado de los agentes Wazuh directamente en el Overview.

**Solución:** Se añadió una segunda fila de 4 KPIs:

| KPI                | ID DOM              | Fuente de datos                          |
|--------------------|---------------------|------------------------------------------|
| Críticas / HIGH    | `kpi-ov-crit`       | OpenSearch range agg. (`rule.level ≥ 7`) |
| Med / Low          | `kpi-ov-med`        | OpenSearch range agg. (`rule.level 4–6`) |
| Agentes online     | `kpi-ov-online`     | Wazuh Manager API `/agents`              |
| Agentes offline    | `kpi-ov-offline`    | Wazuh Manager API `/agents` disconnected |

La consulta de severidad usa un `range` aggregation con los umbrales
equivalentes a las etiquetas del sistema:

```
LOW  → level 0–3
MED  → level 4–6
HIGH → level 7–9
CRIT → level 10–15
```

---

### Mejora 3 — Gráfico de eventos interactivo con datos reales

**Problema anterior:** El gráfico Sparkline de "Volumen eventos · 24h" usaba
`randomWalk()` — números aleatorios sin ninguna relación con los eventos reales.

**Solución:**
- El endpoint `/api/overview` realiza un `date_histogram` en OpenSearch con
  `fixed_interval: '30m'` sobre el campo `timestamp`, produciendo **48 buckets
  de 30 minutos** para las últimas 24 horas.
- Los datos se almacenan en `window.__histFull[]` y la función
  `window.__filterHist(hours)` recorta el array desde el final para mostrar las
  últimas N horas.
- Se añadieron **tres botones de filtro** `6H / 12H / 24H` que redibujan el
  sparkline y actualizan el eje de tiempo y el contador total de eventos.
- Si Wazuh no está disponible, se mantiene el `randomWalk()` como fallback
  para que la UI no quede en blanco.

**Flujo de datos:**
```
OpenSearch date_histogram (30m buckets)
  → /api/overview { histogram: [n0, n1, ... n47] }
  → window.__histFull = histogram
  → window.__filterHist(24) → redibuja SVG sparkline
```

---

### Mejora 4 — Widget Cowrie Honeypot en el Overview

**Problema anterior:** Las estadísticas de Cowrie sólo eran visibles entrando
en la sección específica "Honeypot". El Overview no daba ninguna señal de la
actividad del honeypot.

**Solución:** Se añadió un widget compacto 2×2 en la columna derecha del
Overview, sustituyendo el panel de "Tráfico red · mbps" (que era ficticio):

| Métrica           | ID DOM          | Query OpenSearch                                        |
|-------------------|-----------------|---------------------------------------------------------|
| Sesiones / 24h    | `cow-sessions`  | Total hits `rule.groups: cowrie` últimas 24h            |
| IPs únicas        | `cow-ips`       | Cardinality agg. sobre `data.src_ip`                    |
| Intentos de login | `cow-logins`    | Total hits `rule.description: cowrie.login.failed`      |
| Malware capturado | `cow-malware`   | Total hits `rule.description: *file_download*`          |

Las cuatro consultas se ejecutan en paralelo con `Promise.allSettled()` para
no bloquear el endpoint si alguna falla.

---

### Mejora 5 — Banner de alertas críticas con notificación visual

**Problema anterior:** No había ningún mecanismo visual que destacara
proactivamente la existencia de alertas de alta severidad. El analista tenía
que entrar en la sección SIEM para descubrirlas.

**Solución:** Se añadió un banner colapsable en la parte superior del Overview
que:

1. **Permanece oculto** (`display:none`) si no hay alertas CRIT en las
   últimas 24 horas.
2. **Aparece automáticamente** cuando el endpoint `/api/overview` devuelve
   entradas en `criticalFeed` (alertas de nivel ≥10).
3. Muestra un **indicador pulsante** (animación CSS `pulseDot`) de color rojo.
4. Lista las últimas 5 alertas críticas con: severidad · hora · descripción ·
   técnica MITRE (si disponible) · agente origen.

**Query OpenSearch del feed crítico:**
```json
{
  "size": 5,
  "sort": [{ "timestamp": { "order": "desc" } }],
  "query": {
    "bool": {
      "must": [
        { "range": { "timestamp": { "gte": "now-24h" } } },
        { "range": { "rule.level": { "gte": 10 } } }
      ]
    }
  }
}
```

---

## Arquitectura del nuevo endpoint `/api/overview`

El endpoint realiza **6 operaciones** en paralelo / secuencial optimizado:

```
/api/overview
├── 1. Severity breakdown     → osQuery range agg. (rule.level)
├── 2. Event histogram 24h    → osQuery date_histogram 30min
├── 3. Critical alert feed    → osQuery top 5 level≥10
├── 4. Agents online/offline  → Wazuh Manager API /agents
├── 5. Cowrie mini-stats      → Promise.allSettled([sessRes, loginRes, srcRes, malRes])
└── 6. Open incidents count   → SQLite: SELECT COUNT(*) FROM tickets WHERE status IN (...)
```

**Respuesta JSON:**
```json
{
  "kpis": {
    "alerts24h": 1243,
    "criticalAlerts": 8,
    "incidentsActive": 3,
    "agentsTotal": 4,
    "agentsOnline": 3,
    "agentsOffline": 1
  },
  "severityBreak": [
    { "sev": "LOW",  "count": 892 },
    { "sev": "MED",  "count": 287 },
    { "sev": "HIGH", "count": 56  },
    { "sev": "CRIT", "count": 8   }
  ],
  "criticalFeed": [ /* top 5 alertas nivel ≥10 */ ],
  "cowrieMini": {
    "sessions24h": 341,
    "uniqueIPs": 87,
    "loginAttempts": 2918,
    "malwareDownloads": 4
  },
  "histogram": [0, 12, 45, 23, ... /* 48 valores */]
}
```

---

## Comportamiento con Wazuh no disponible (fallback)

Todos los bloques de datos están envueltos en `try/catch` independientes.
Si Wazuh OpenSearch o la API no responden:

- Los KPIs permanecen en `"…"` (cargando)
- El gráfico mantiene el `randomWalk()` provisional
- El feed SIEM muestra el mensaje *"Conectando con Wazuh OpenSearch…"*
- El banner de críticas no aparece
- Los datos de Cowrie muestran `"—"`

Esto garantiza que la UI nunca quede rota aunque el stack de Wazuh esté
arrancando o temporalmente caído.

---

## Auto-refresco

| Mecanismo                    | Intervalo | Condición                  |
|------------------------------|-----------|----------------------------|
| `__loadOverviewData()`       | 30s       | Solo si `state.view === 'overview'` |
| `data.js` loadRealData loop  | 30s       | Todas las vistas            |
| MITRE update                 | On load   | Dispara también `__loadOverviewData` |

---

## Pruebas recomendadas antes del merge a `main`

- [ ] Verificar que el backend arranca sin errores: `cd backend && npm start`
- [ ] Abrir `http://localhost:3000` y navegar a Overview
- [ ] Confirmar que los KPIs cambian de `"…"` a valores reales (si Wazuh activo)
- [ ] Probar los botones **6H / 12H / 24H** del gráfico
- [ ] Verificar que el widget Cowrie muestra datos (si honeypot activo, puerto 2222)
- [ ] Generar una alerta de nivel ≥10 en Wazuh para testear el banner rojo
- [ ] Comprobar comportamiento sin Wazuh (debe mostrar mensajes de "conectando")
- [ ] Revisar en móvil/tablet que el layout no se rompe con la fila extra de KPIs

---

## Referencias

- Commit: `4d2dc3b` en rama `feature/dashboard-mejoras`
- PR: https://github.com/saantiidp/Valhalla-SOC/pull/new/feature/dashboard-mejoras
- Wazuh OpenSearch API: https://documentation.wazuh.com/current/user-manual/api/reference.html
- OpenSearch Date Histogram: https://opensearch.org/docs/latest/aggregations/bucket/date-histogram/
