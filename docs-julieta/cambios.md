# Registro de cambios - Julieta

## 2026-05-25 (rediseño header PDF ejecutivo y técnico: logo izquierda + título al lado)

### Problema
El logo se posicionaba en la esquina superior derecha del header, encima de los textos de metadata (Ref, Fecha, Período, Analista). No había separación visual clara entre logo, título y metadata.

### Nuevo layout del header (ambos PDFs)
Diseño en dos bloques dentro del band navy:
- **Bloque izquierdo:** logo (16×16mm ejecutivo / 18×18mm técnico) + línea divisoria vertical blanca fina (0.3px) + título en bold + subtítulo(s)
- **Bloque derecho:** metadata (Ref, Fecha, Período, Analista, Cliente) right-aligned en x=W-M=190, sin cambios

Cuando no hay logo subido: layout original conservado (título a x=M, fuente 16pt).

### Coordenadas ejecutivo (band=45mm)
- Logo: x=M, y=7, 16×16mm
- Divider: x=M+18, y=8 a y=23
- Título "INFORME EJECUTIVO...": x=M+21, y=17, bold 12pt, blanco
- Subtítulo "Security Operations Center...": x=M+21, y=24, normal 8pt, blanco

### Coordenadas técnico (band=52mm)
- Logo: x=M, y=10, 18×18mm
- Divider: x=M+20, y=11 a y=27
- Título "INFORME TÉCNICO...": x=M+23, y=20, bold 13pt, blanco
- Subtítulo 1 "Security Operations Center...": x=M+23, y=28, normal 8pt, blanco
- Subtítulo 2 "Orientado a CISO...": x=M+23, y=35, italic 7.5pt, blanco

### Archivos modificados
- `frontend/app/src/ui/ExecutiveReport.tsx` — bloque header en `exportToPDF` y `exportTechnicalPDF`

---

## 2026-05-25 (fix coordenadas logo en portadas PDF ejecutivo y técnico)

### Problema
El logo aparecía demasiado grande y se superponía con el texto del header en `exportTechnicalPDF` (y potencialmente en `exportToPDF`). Las coordenadas anteriores `W-M-22, 4, 20, 14` generaban un área de 20×14mm que invadía la zona de texto.

### Solución
- `doc.addImage` en `exportToPDF`: coordenadas cambiadas a `W - M - 16, 6, 12, 12`.
- `doc.addImage` en `exportTechnicalPDF`: mismas coordenadas `W - M - 16, 6, 12, 12`.
- El logo queda como un cuadrado de 12×12mm, ligeramente más a la izquierda y más abajo dentro del band navy, sin pisar los textos del header.

### Archivos modificados
- `frontend/app/src/ui/ExecutiveReport.tsx` — coordenadas de `doc.addImage` en `exportToPDF` y `exportTechnicalPDF`

---

## 2026-05-25 (fix botones barra superior + fix logo en PDF)

### Problema 1 — Botones cambiaron de tamaño visual
El `alignItems="center"` agregado al Stack en el commit anterior hizo que los botones dejaran de estirarse (`stretch`) y adoptaran solo su altura natural, quedando visualmente más pequeños.

### Solución
- Se quitó únicamente `alignItems="center"` del Stack de la barra superior.
- El `Chip` de fuente de datos se mantiene sin cambios.

### Problema 2 — Logo no aparecía en los PDFs
El `doc.addImage(logo, fmt, ...)` fallaba silenciosamente porque jsPDF necesita detectar el formato desde el propio data URL cuando el primer argumento es un data URL, y la lógica de extracción del tipo MIME era frágil (podía producir un `fmt` incorrecto para ciertos tipos).

### Solución
- Se reemplazó el bloque `if (logo)` en **ambas** funciones (`exportToPDF` y `exportTechnicalPDF`) por una versión con `try/catch` y detección directa del formato: `logo.startsWith('data:image/png')` → `'PNG'`, cualquier otro → `'JPEG'`.
- Si `addImage` lanza un error (formato no soportado, data URL corrupto), se captura y se loguea como `console.warn` sin interrumpir la generación del PDF.
- Coordenadas ajustadas: `x = W - M - 22`, `y = 4`, `w = 20`, `h = 14` (ligeramente mayor que el bloque anterior, más visible).

### Archivos modificados
- `frontend/app/src/ui/ExecutiveReport.tsx` — Stack barra superior + bloques `if (logo)` en `exportToPDF` y `exportTechnicalPDF`

---

## 2026-05-25 (datos reales del backend: fallback key_finding + indicador de fuente)

### Problema
Dos gaps en el uso de datos reales:
1. En `reportApi.ts`, `backendKeyFinding` se llenaba **solo** desde `data.executive_summary?.key_finding`. Si ese campo era null (e.g. el backend devuelve el resumen IA únicamente en `executiveSummary` y no en el objeto anidado `executive_summary`), el `key_finding` del PDF caía al texto hardcodeado aunque hubiera un resumen IA disponible.
2. En `ExecutiveReport.tsx` no había ningún indicador visual que le dijera al analista si los datos del dashboard y los PDFs provienen del backend real (OpenSearch + Ollama + DB) o del modo fallback (datos simulados).

### Solución aplicada en `reportApi.ts`
- `backendKeyFinding` ahora usa `data.executive_summary?.key_finding ?? data.executiveSummary`: si el objeto `executive_summary` no tiene `key_finding`, toma el campo de nivel superior `executiveSummary` (ambos contienen el resumen generado por Ollama en el backend actual).

### Solución aplicada en `ExecutiveReport.tsx`
- Se agrega estado `dataSource: "api" | "fallback"` (default `"fallback"`).
- En `load()`, después de `setReportData(structured)`, se llama `setDataSource(raw.source)` para registrar la fuente real del dato.
- En la barra superior de la UI se agrega un `Chip` con variante `outlined` que muestra:
  - `"● DATOS REALES"` en verde (`var(--signal)`) cuando `dataSource === "api"`
  - `"○ SIMULACIÓN"` en ámbar (`var(--amber)`) cuando `dataSource === "fallback"`
- El chip se ubica al inicio del grupo de botones (antes de PREVIEW UI), alineado verticalmente al centro del stack.

### Nota sobre los PDFs
Los PDFs ya usan los datos reales vía `reportData` (que viene de `load()`), por lo que no requieren cambios adicionales para este fix.

### Archivos modificados
- `frontend/app/src/lib/reportApi.ts` — línea `backendKeyFinding` en `fetchExecutiveReportData()`
- `frontend/app/src/ui/ExecutiveReport.tsx` — estado `dataSource`, `load()`, barra de botones

---

## 2026-05-25 (fix recuadro ISO 27001 página 4 PDF ejecutivo)

### Problema
En la página 4 del PDF ejecutivo (`exportToPDF`), el recuadro gris de "Nivel de cumplimiento global estimado:" tenía altura fija de 14mm. Si `remY2` acumula espacio suficiente antes de llegar a esa sección (muchas recomendaciones + acciones), el recuadro puede quedar cortado por el footer en y=285, truncando el texto visible.

### Solución aplicada en `ExecutiveReport.tsx`
- Se eliminan las dos líneas que dibujaban el fondo del recuadro:
  - `doc.setFillColor(240, 243, 247);`
  - `doc.roundedRect(M, remY2, col, 14, 2, 2, "F");`
- El texto "Nivel de cumplimiento global estimado:" y el porcentaje `${isoScore2}%` se mantienen idénticos pero ahora se renderizan directamente sobre el fondo blanco, sin caja detrás.
- La posición Y del texto se ajusta de `remY2 + 9` a `remY2 + 5` (ya no hay caja que centre verticalmente).
- `remY2 += 18` se reduce a `remY2 += 12` para compensar el espacio que ocupaba la caja eliminada.
- Los recuadros individuales de cada control ISO (en el `forEach` siguiente) no se tocan — esos son elementos independientes y no estaban causando el problema.

### Archivos modificados
- `frontend/app/src/ui/ExecutiveReport.tsx` — función `exportToPDF`, sección 9 ISO 27001

---

## 2026-05-25 (fix logo en portada PDF ejecutivo y PDF técnico)

### Problema
El logo subido por el usuario (campo "UPLOAD COMPANY LOGO") se cargaba correctamente en el estado `logo` (base64 data URL) pero ninguna de las dos funciones de exportación lo usaba. Ambos PDFs generaban portadas sin logo.

### Solución aplicada en `ExecutiveReport.tsx`
- En `exportToPDF()`: se inserta `doc.addImage()` inmediatamente después de dibujar el rectángulo del encabezado navy (`doc.rect(0, 0, W, 45, "F")`), antes de cualquier texto.
- En `exportTechnicalPDF()`: misma inserción después de `doc.rect(0, 0, W, 52, "F")` de la portada.
- Posición del logo: `x = W - M - 20 = 170mm`, `y = 5mm`, `w = 18mm`, `h = 12mm` — extremo superior derecho del encabezado navy, fuera del área de cualquier texto (los textos del lado derecho empiezan en `y=18`, el logo termina en `y=17`).
- Detección de formato: se extrae el tipo MIME del data URL (`data:image/TYPE;base64,...`) para pasar `'JPEG'` o `'PNG'` a jsPDF. Solo se dibuja si `logo !== null`.

### Comportamiento
- Si no se subió logo: los PDFs se generan igual que antes (sin cambios).
- Si se subió logo: aparece en la esquina superior derecha del encabezado de la portada en ambos PDFs.

### Archivos modificados
- `frontend/app/src/ui/ExecutiveReport.tsx` — funciones `exportToPDF` y `exportTechnicalPDF`

---

## 2026-05-22 (date range picker visual estilo Airbnb — React puro)

### Cambio
- Los campos DATE START / DATE END (inputs nativos `type="date"`) fueron reemplazados por un componente `DateRangePicker` custom en React puro, sin librerías externas.
- El componente vive en `ExecutiveReport.tsx` como función `DateRangePicker` antes del export default.

### Comportamiento
- Click en el trigger (muestra `DD/MM/YYYY → DD/MM/YYYY`) abre el calendario popup.
- Primer clic en una fecha → inicio del rango (estado `► INICIO`).
- Segundo clic → fin del rango, calendario se cierra (estado `► FIN`).
- Si ambas fechas estaban seleccionadas, el próximo clic reinicia la selección.
- Hover sobre días mientras se elige el fin muestra la preview del rango.
- Click fuera del popup (backdrop fijo) cierra sin cambios.

### Resaltado del rango
- Fechas de inicio y fin: círculo verde `var(--signal)` con texto negro.
- Fechas intermedias: fondo `rgba(60,255,158,0.13)` ancho completo.
- Inicio/fin del strip: `linear-gradient` de medio celda para cortar la franja limpiamente.
- Hover preview: mismo gradiente usando `hoverDate` como `re` efectivo.

### Fecha de hoy
- Si el día coincide con la fecha actual y no está seleccionado, se muestra con `border: 1px solid rgba(60,255,158,0.4)` y texto en `var(--signal)`.

### Navegación
- Botones `‹` y `›` para moverse entre meses.
- Título del mes/año en mono verde terminal.
- Al cargarse datos (`load()`), el calendario sincroniza `viewYear/viewMonth` vía `useEffect([dateStart])`.

### Diseño terminal
- Fondo del popup: `rgba(5, 14, 10, 0.98)` con `backdropFilter: blur(20px)`.
- Borde: `rgba(60,255,158,0.25)`.
- Cabeceras de días (Lu–Do) en `var(--text-dim)`.
- Footer de estado: muestra `► INICIO` o `► FIN` y el rango confirmado.

### Sin librerías nuevas
- Solo `useState`, `useEffect`, `Box`, `Typography` (ya en el proyecto).
- No se instaló ningún paquete adicional.

### Archivos modificados
- `frontend/app/src/ui/ExecutiveReport.tsx` — constantes `MONTH_NAMES_ES`/`DAY_ABBR`, función `DateRangePicker`, reemplazo en config form

---

## 2026-05-22 (date range picker reemplaza campo PERIOD)

### Cambio
- El campo de texto libre "PERIOD" en el formulario de configuración de `ExecutiveReport.tsx` fue reemplazado por dos date pickers nativos: **DATE START** y **DATE END**.
- El período mostrado en el PDF se genera automáticamente a partir del rango seleccionado (formato `DD/MM/YYYY – DD/MM/YYYY`).

### Comportamiento nuevo
- Al cargar datos (`load()`), `dateStart` y `dateEnd` se inicializan al primer y último día del mes derivado de `raw.generatedAt`.
- `period` pasa a ser un `useMemo` computado desde `dateStart`/`dateEnd`; ya no es estado editable directo.
- El usuario puede cambiar las fechas con el calendario nativo del browser; el período del PDF se actualiza en tiempo real.

### Diseño
- Inputs tipo `date` con `colorScheme: dark` para que el calendario del browser respete el fondo oscuro.
- Icono del calendario tintado en verde terminal con `filter: invert + sepia + hue-rotate`.
- Dos grid items `md=4` cada uno (el formulario pasa de 5 a 6 campos, reorganizados en 2 filas de 3).

### Archivos modificados
- `frontend/app/src/ui/ExecutiveReport.tsx` — estado, `load()`, `useMemo period`, config form

---

## 2026-05-13 (acortar strings mitreConclusion e incidentAnalysis - max 90 chars/línea)

### Problema
jsPDF no hace clip del texto: aunque `splitTextToSize` está configurado, si los strings son demasiado largos el texto visualmente desborda el recuadro. La solución real es reducir el contenido.

### Cambios
- `mitreConclusion` — las tres ramas del ternario reescritas para quedar ≤ 90 caracteres cada una:
  - Credential Access: `"Activar MFA. Revisar contraseñas. Alertas de acceso anómalo. Ref: ISO 27001 A.9.4."` (83 chars)
  - Initial Access: `"Revisar firewall e IDS/IPS. Threat hunting en sistemas expuestos. Ref: ISO 27001 A.13.1."` (90 chars)
  - Default: `` `Revisar mitigaciones para "${táctica}" en MITRE ATT&CK. Ref: ISO 27001 A.12.4.` `` (≤ 87 chars)
- `incidentAnalysis` — simplificado a una sola línea de métricas clave (≤ 90 chars con datos reales):
  `` `MTTR: ${mttr} min. Cierre: ${closureRate}%. Tickets abiertos: ${pendingTickets}. Ref: ISO 27001 A.16.1, NIST SP 800-61.` ``

### Archivos modificados
- `frontend/app/src/ui/ExecutiveReport.tsx` — líneas 947–951 y 1043

---

## 2026-05-13 (fix desbordamiento en boxes MITRE e incidentes - col-18)

### Problema
Dos recuadros con borde izquierdo azul en `exportTechnicalPDF` mostraban texto desbordando hacia la derecha:
1. Box de RECOMENDACIÓN post tabla MITRE (`mitreConclusion`)
2. Box de análisis bajo KPIs de gestión de incidentes (`incidentAnalysis`)

Causa: el helper `analysisBox` tenía `col - 10` como ancho máximo fijo. Estos dos boxes requieren `col - 18` para compensar los +8mm de margen izquierdo visual del borde azul.

### Solución
- `analysisBox` ahora acepta un tercer parámetro `maxW` (default `col - 10`) para permitir anchos personalizados sin afectar otros boxes.
- `analysisBox(mitreConclusion, y2, col - 18)` — box MITRE
- `analysisBox(incidentAnalysis, y3, col - 18)` — box incidentes
- Los otros dos boxes (`execAnalysis`, `honeypotConclusion`) conservan el default `col - 10`.

### Archivos modificados
- `frontend/app/src/ui/ExecutiveReport.tsx` — helper `analysisBox` (firma) y dos llamadas

---

## 2026-05-11 (nueva exportación: PDF técnico narrativo)

### Objetivo
Añadir un segundo botón de exportación **"EXPORT PDF TÉCNICO"** en `ExecutiveReport.tsx` que genere un informe PDF orientado a perfiles técnicos (CISO, responsable de seguridad). A diferencia del PDF ejecutivo (visual, KPIs, gráficos de barras), el PDF técnico prioriza texto narrativo que explica el significado de los datos.

### Plan de implementación

**Archivo único:** `frontend/app/src/ui/ExecutiveReport.tsx`

Se añade la función `exportTechnicalPDF()` y un nuevo botón en la barra superior. La función genera un PDF de 4–5 páginas con las siguientes secciones:

| Página | Sección | Contenido adicional vs. PDF ejecutivo |
|--------|---------|---------------------------------------|
| 1 | Portada + Resumen ejecutivo | Narrativa completa del estado de seguridad; contexto del período |
| 2 | Análisis MITRE ATT&CK | Tabla + párrafo analizando el patrón de ataques detectados y su implicación operativa |
| 2 | Inteligencia Honeypot | Métricas + análisis narrativo de qué revelan las contraseñas capturadas sobre el perfil del atacante |
| 3 | Origen geográfico | Barras + párrafo de contexto geopolítico por región |
| 3 | Gestión de incidentes | KPIs + interpretación del MTTR y tasa de cierre |
| 4 | Remediación detallada | Cada paso con estimación de tiempo, referencia normativa (NIST/ISO) y responsable sugerido |
| 4 | Cumplimiento ISO 27001 | Score + párrafo narrativo por control con estado y gaps detectados |

**Decisiones de diseño:**
- Paleta sobria: fondo blanco, encabezado azul marino, texto negro/gris — mismo esquema que el PDF ejecutivo.
- Fuente de texto de análisis: 9pt, interlineado amplio, ancho `col` con `splitTextToSize`.
- No reutiliza `exportToPDF` — es una función separada para mantener ambos formatos independientes.
- Nombre de archivo descargado: `valhalla-informe-tecnico-YYYY-MM-DD.pdf`.

### Archivos modificados
- `frontend/app/src/ui/ExecutiveReport.tsx` — añadir `exportTechnicalPDF()` y botón "EXPORT PDF TÉCNICO"

---

## 2026-05-12 (fix padding interno recuadros PDF técnico)

### Problema
Texto dentro de recuadros con borde azul en `exportTechnicalPDF` desbordaba visualmente hacia la derecha. La causa: el texto de "Ref + Responsable" dentro del box de remediación usaba `col - 8` como ancho máximo, que es menos restrictivo que la regla de padding interno (`col - 10`).

### Regla aplicada
Todo texto dentro de un recuadro debe usar `col - 10` como ancho máximo en `splitTextToSize` (no `col`), para respetar el padding interno del box.

### Auditoría completa de boxes en `exportTechnicalPDF`
| Línea | Box | Ancho anterior | Estado |
|-------|-----|---------------|--------|
| 802 | `analysisBox` (borde azul) | `col - 10` | ✓ ya correcto |
| 1086 | Remediation step box | `col - 16` | ✓ OK |
| 1093 | Sub-box action_cmd | `col - 16` | ✓ OK |
| **1098** | **Remediation step box** | **`col - 8` → `col - 10`** | fix aplicado |
| 1151 | ISO control box | `col - 30` | ✓ OK |

### Archivos modificados
- `frontend/app/src/ui/ExecutiveReport.tsx` — únicamente la función `exportTechnicalPDF`, línea 1098

---

## 2026-05-12 (fix márgenes PDF técnico - segunda pasada)

### Problema
Audit completo de todos los `doc.text()` sin `splitTextToSize` en `exportTechnicalPDF`. Dos textos podían desbordar el margen derecho (`W-M = 190mm`):
1. `step.action_cmd!` — comando de remediación sin límite de ancho, iniciando en `M+7`. Con `col=170`, el máximo seguro es `col - 16 = 154mm`.
2. `g.country` — nombre de país sin límite de ancho, iniciando en `M=20`. La barra empieza en `bStart=M+28=48`, dejando solo `26mm` disponibles antes de solaparse.

### Solución
1. `doc.text(step.action_cmd!, M+7, ...)` → `doc.text(doc.splitTextToSize(step.action_cmd!, col-16)[0], M+7, ...)` — trunca a 154mm.
2. `doc.text(g.country, M, ...)` → `doc.text(doc.splitTextToSize(g.country, bStart-M-2)[0], M, ...)` — trunca a 26mm (antes de la barra).

### Archivos modificados
- `frontend/app/src/ui/ExecutiveReport.tsx` — únicamente la función `exportTechnicalPDF`

---

## 2026-05-07 (fix visual PDF: título, geo bars, márgenes)

### Problema
Tres defectos visuales en la función `exportToPDF` de `ExecutiveReport.tsx`:
1. El título "INFORME EJECUTIVO DE SEGURIDAD" usaba `setFontSize(22)` — demasiado grande para el header.
2. Página 3 (Geo Intel): las barras de país ocupaban `col - 60 = 110mm` de ancho y el pct/desc se solapaban con ellas o entre sí.
3. La tabla MITRE (página 2) tenía una 4.ª columna "QUÉ SIGNIFICA" iniciando en `M+158 = 178mm`, dejando solo 12mm hasta el margen `W-M = 190mm` — los textos desbordaban la página.

### Solución
1. `setFontSize(22)` → `setFontSize(16)` en el título de página 1.
2. Geo bars: se introduce `barMaxW = 55mm` (barra termina en x=103, antes del centro 105mm). El pct se ubica justo a la derecha (`x=106`) y el desc se limita con `splitTextToSize` dentro del espacio restante hasta `W-M`.
3. MITRE table: se elimina la 4.ª columna del header y de cada fila. La descripción ("qué significa") pasa a ser un subtexto en gris de 6pt debajo del nombre de la táctica. El alto de fila pasa de 14 a 16mm para dar espacio. `tableEndY` actualizado en consecuencia.
4. Fix menor: footer de página 1 decía "1 de 3" en lugar de "1 de 4".

### Archivos modificados
- `frontend/app/src/ui/ExecutiveReport.tsx` — únicamente la función `exportToPDF`

---

## 2026-05-07 (restauración archivos docs-julieta/ + integración real backend implementada)

### Cambios
- Se restauran los archivos de `docs-julieta/` eliminados por el merge de Rosalino: `README.md`, `arquitectura.md`, `componentes.md`, `images/executive1.png`, `images/executive2.png`.
- Se implementa la integración real con el backend en `reportApi.ts` y `ExecutiveReport.tsx` según el plan documentado.

### Implementado en `reportApi.ts`
1. `http()` actualizado: `credentials: "include"` + header `X-CSRF-Token` desde cookie — autenticación idéntica a `api.ts`.
2. Tipos internos `BackendReportResponse` y los campos de backend añadidos.
3. `ExecutiveReportData` ampliado con campos opcionales: `wazuhMetrics?`, `mitreCoverage?`, `honeypotIntel?`, `incidentManagement?`, `remediationSteps?`, `backendKeyFinding?`, `analystNameFromBackend?`.
4. Camino backend en `fetchExecutiveReportData()`: mapea la respuesta completa del backend a `ExecutiveReportData`. Sigue llamando `fetchGeoIntel()` para geo.

### Implementado en `ExecutiveReport.tsx`
5. `load()` reemplaza los 6 valores hardcodeados por datos reales del backend cuando están disponibles:
   - `key_finding` → resumen ejecutivo de Ollama
   - `wazuh_metrics` → alertas reales de OpenSearch
   - `mitre_coverage` → tácticas reales de OpenSearch
   - `honeypot_intel` → datos reales del honeypot Cowrie
   - `incident_management` → tickets reales de la DB
   - `remediation_steps` → pasos reales del backend
   - `analystName` → username real del usuario logueado (actualizado en cada carga como `period`/`reportId`)
6. Fallback local preservado intacto si el backend no responde.

---

## 2026-05-07 (integración real backend - plan confirmado post-actualización de Rosalino)

### Estado
- Merge con `origin/main` completado. Conflicto en `cambios.md` resuelto conservando nuestra versión.
- **Nota:** el merge eliminó `docs-julieta/README.md`, `arquitectura.md`, `componentes.md` e `images/` (limpieza de Rosalino en main). Pendiente decisión de Julieta sobre restaurarlos.

### Respuesta real del backend (confirmada en `backend/app/main.py`)

El endpoint `GET /api/reports/executive` ahora devuelve la estructura completa de `ValhallaReportJSON` más los campos de `ExecutiveReportData`:

```
source, generatedAt, executiveSummary (Ollama), riskScore
metrics (OpenSearch stats)
topThreats, iso27001, recommendations
report_metadata   → report_id, generation_date, analyst_name (username real), period
executive_summary → status, health_score, key_finding (Ollama)
wazuh_metrics     → total_alerts, critical_alerts, top_affected_assets (reales)
mitre_coverage    → tactic, count, level, icon (reales desde OpenSearch)
honeypot_intel    → unique_attackers, top_passwords_captured, malware_samples_collected
incident_management → total_tickets, closed_tickets, avg_resolution_time_min
remediation_steps → lista de tareas reales
```

No incluye `geoIntel` → seguirá viniendo de `fetchGeoIntel()`.

### Plan de implementación

**Archivo 1: `frontend/app/src/lib/reportApi.ts`**
1. Actualizar `http()`: agregar `credentials: "include"` + header `X-CSRF-Token` leído del cookie (igual a `api.ts`).
2. Agregar tipo `BackendReportResponse` con todos los campos que devuelve el backend.
3. Agregar campos opcionales a `ExecutiveReportData` para pasar los campos ricos del backend hacia el componente: `wazuhMetrics?`, `mitreCoverage?`, `honeypotIntel?`, `incidentManagement?`, `remediationSteps?`, `backendKeyFinding?`, `analystNameFromBackend?`.
4. En `fetchExecutiveReportData()` camino backend: mapear `BackendReportResponse` a `ExecutiveReportData` usando los campos reales. Llamar `fetchGeoIntel()` para geo.

**Archivo 2: `frontend/app/src/ui/ExecutiveReport.tsx`**
5. En `load()`, reemplazar los valores hardcodeados del objeto `structured` por los datos reales del backend cuando estén disponibles:
   - `key_finding` → `raw.backendKeyFinding` (resumen Ollama real)
   - `wazuh_metrics` → `raw.wazuhMetrics` (alertas reales de OpenSearch)
   - `mitre_coverage` → `raw.mitreCoverage` (MITRE real de OpenSearch)
   - `honeypot_intel` → `raw.honeypotIntel` (datos reales del honeypot)
   - `incident_management` → `raw.incidentManagement` (tickets reales de DB)
   - `remediation_steps` → `raw.remediationSteps` (pasos reales)
   - `analystName` initial value → `raw.analystNameFromBackend` (username del usuario logueado)

El fallback local permanece intacto si el backend falla.

---

## 2026-05-07 (pausa integración backend - esperando Rosalino)

### Estado
- Integración con el backend real **en pausa**.

### Contexto
- Se analizó el mecanismo de autenticación (`credentials: "include"` + cookie httpOnly de sesión + header `X-CSRF-Token`).
- Se identificó que el endpoint `/api/reports/executive` devuelve `{ generatedAt, executiveSummary, metrics }`, esquema incompleto para las necesidades del módulo.
- El plan de implementación está documentado en la entrada anterior de este archivo.

### Próximo paso
- Rosalino actualizará `/api/reports/executive` para que devuelva los campos necesarios (`riskScore`, `topThreats`, `iso27001`, `recommendations`).
- Cuando esté listo: hacer pull de main, retomar desde el plan documentado arriba.

### Módulo en estado funcional
- El fallback local cubre el 100% de la funcionalidad para la demo mientras se espera la actualización del backend.

---

## 2026-05-07 (integración real backend: auth cookies + adaptación de esquema)

### Cambio
- Se conecta `frontend/app/src/lib/reportApi.ts` al backend real con autenticación correcta y se adapta el esquema de respuesta.

### Problema corregido
- El `http()` interno de `reportApi.ts` no enviaba `credentials: "include"` ni el header `X-CSRF-Token`, por lo que el backend retornaba 401 en todos los casos y el módulo siempre corría en modo fallback.
- El tipo esperado `ExecutiveReportData` no coincidía con la respuesta real del backend (`{ generatedAt, executiveSummary, metrics }`).

### Mecanismo de autenticación (según `api.ts`)
- El backend usa **cookies httpOnly de sesión** (no JWT en header). Se setean al hacer login.
- Todos los requests autenticados envían las cookies automáticamente con `credentials: "include"`.
- Los requests también envían `X-CSRF-Token` leído del cookie `csrf_token`.
- No hay token manual en `localStorage` — el sistema migró a cookies.

### Solución aplicada en `reportApi.ts`
1. Se actualiza el `http()` interno:
   - Se agrega `credentials: "include"` al `fetch()`.
   - Se agrega lectura del cookie `csrf_token` y envío como `X-CSRF-Token` (idéntico a `api.ts`).
2. Se agrega tipo `BackendReportResponse` para la respuesta real del backend.
3. En `fetchExecutiveReportData()`, cuando el backend responde correctamente:
   - Se usa `executiveSummary` de Ollama directamente.
   - Se extraen campos de `metrics` con acceso defensivo (`??`) dado que la estructura interna de OpenSearch stats no está tipada.
   - `riskScore`, `topThreats`, `iso27001`, `recommendations` se derivan de `metrics` si están disponibles, con fallback a valores computados.
   - Se llama `fetchGeoIntel()` para geo data (que ahora también funciona con auth correcta).
   - `source` se setea a `"api"`.
4. El fallback local permanece intacto si el backend no responde (red caída, backend apagado, etc.).

### Archivos modificados
- `frontend/app/src/lib/reportApi.ts` únicamente.
- Sin cambios en `ExecutiveReport.tsx`, `api.ts` ni archivos del backend.

### Motivo
- Que el módulo use el resumen ejecutivo real generado por Ollama y las métricas reales de OpenSearch cuando el backend esté disponible.

---

## 2026-05-07 (fix corte sección 6 PDF - geo intel a página propia)

### Cambio
- Se corrige el desbordamiento de la sección "6. ORIGEN GEOGRÁFICO DE LOS ATAQUES" en `frontend/app/src/ui/ExecutiveReport.tsx`.

### Problema corregido
- La sección 6 comenzaba en `geoY = 252` sobre una página de 297mm con footer en 285. Con datos dinámicos de hasta 5 países (5 × 18px = 90px de barras + cabeceras), el contenido superaba el footer y China se solapaba con el pie de página.

### Solución aplicada
- Se elimina la sección 6 del final de la página 2.
- Se agrega una nueva página 3 dedicada exclusivamente a la sección 6 (Geo Intel), con `geoY = 30` — espacio amplio para hasta 5 países.
- La antigua página 3 (Remediation + Recomendaciones + ISO 27001) pasa a ser página 4.
- Los footers se actualizan de "X de 3" a "X de 4".

### Motivo
- Con geo data dinámica (hasta 5 países) el contenido no cabe al final de la página 2. La solución más limpia es darle una página propia en lugar de ajustes de espaciado frágiles.

---

## 2026-05-07 (geo data dinámica desde Cowrie honeypot)

### Cambio
- Se reemplaza la geo data hardcodeada (China/Rusia/Países Bajos con porcentajes estáticos) por datos reales del honeypot Cowrie en `frontend/app/src/lib/reportApi.ts` y `frontend/app/src/ui/ExecutiveReport.tsx`.

### Problema corregido
- La card "ATTACK ORIGIN (GEO-INTEL)" y la sección 6 del PDF mostraban siempre China 85%, Rusia 65%, Países Bajos 45% independientemente de los datos reales.

### Solución aplicada en `reportApi.ts`
- Se agrega el tipo exportado `GeoEntry = { country, code, pct, desc }`.
- Se agrega `geoIntel?: GeoEntry[]` al tipo `ExecutiveReportData`.
- Se agregan constantes `GEO_NAMES` (código ISO → nombre en español) y `GEO_DESCS` (código → descripción de amenaza).
- Se agrega `FALLBACK_GEO`: 5 países con distribución realista (China 38%, Rusia 27%, Países Bajos 14%, Singapur 11%, EE.UU. 10%).
- Se agrega `buildGeoIntel(events)`: extrae `raw_log.geo` de eventos Cowrie, agrupa por país, normaliza a porcentajes, devuelve hasta 5 países.
- Se agrega `fetchGeoIntel()`: llama a `GET /events?limit=200`, computa geo real; si falla retorna `FALLBACK_GEO`.
- En `fetchExecutiveReportData()`: camino backend llama `fetchGeoIntel()` y adjunta al resultado. Camino fallback adjunta `FALLBACK_GEO`.

### Solución aplicada en `ExecutiveReport.tsx`
- Se agrega `geo_intel?` a la interfaz `ValhallaReportJSON`.
- En `load()`, se mapea `raw.geoIntel` a `structured.geo_intel`.
- La card "ATTACK ORIGIN" itera `reportData.geo_intel` en lugar del array hardcodeado.
- La sección 6 del PDF usa `reportData.geo_intel` en lugar de `geoData` hardcodeado.

### Motivo
- Mostrar el origen geográfico real de los ataques capturados por el honeypot Cowrie. En modo fallback, presentar una distribución diversa y creíble para demo.

---

## 2026-05-07 (período, analista y report_id dinámicos y editables)

### Cambio
- Se reemplazan los valores hardcodeados de `period`, `analyst_name` y `report_id` en `frontend/app/src/ui/ExecutiveReport.tsx` por estado React editable y generación dinámica desde la API.

### Problema corregido
- `period` fijo como `"ABRIL 2026"`, `analyst_name` fijo como `"Y. RAMIREZ"` y `report_id` fijo como `"VHL-2026-XQ7"` — ninguno reflejaba datos reales ni permitía edición.

### Solución aplicada
- Se agregan tres nuevos estados: `analystName` (default `"Y. RAMIREZ"`), `period` (string vacío inicial), `reportId` (string vacío inicial).
- En `load()`, se derivan `period` y `reportId` de `raw.generatedAt` devuelto por la API:
  - `period` → nombre del mes en español + año (ej: `"MAYO 2026"`).
  - `reportId` → formato `VHL-YYYY-XXXX` con sufijo aleatorio de 4 caracteres.
  - `analystName` nunca se sobreescribe desde `load()` — respeta la edición del usuario.
- El objeto `report_metadata` dentro de `structured` usa estos valores de estado en lugar de literales.
- En `exportToPDF()`, las líneas que leen `reportData.report_metadata.report_id`, `.period` y `.analyst_name` se reemplazan por las variables de estado correspondientes.
- En el subtítulo del header de la UI se reemplaza `reportData?.report_metadata.report_id` por `reportId`.
- En el formulario de configuración se agregan dos nuevos campos editables: `ANALYST` y `PERIOD`. El selector existente se renombra a `REPORT TYPE` para evitar ambigüedad.
- Sin cambios en `reportApi.ts`.

### Motivo
- Que el reporte refleje el período real de los datos consumidos y permita que el analista personalice nombre y período para cada cliente antes de exportar el PDF.

---

## 2026-05-07 (botón Recargar en la UI)

### Cambio
- Se agrega botón "RECARGAR" visible en la barra superior de `frontend/app/src/ui/ExecutiveReport.tsx`.

### Problema corregido
- No había forma de forzar una nueva carga de datos sin recargar la página entera del navegador. Útil especialmente cuando el backend no estaba disponible al cargar inicialmente.

### Solución aplicada
- Se agrega un tercer botón `RECARGAR` en el grupo de botones superiores (junto a `PREVIEW UI` y `EXPORT PDF`).
- Al hacer clic llama a `load()`, que re-ejecuta la carga de datos y muestra el spinner mientras carga.
- Sin cambios en `reportApi.ts` ni otros archivos.

### Motivo
- Permite recuperarse de un error de carga sin salir de la vista, y fuerza actualización de datos en demo sin recargar el browser.

---

## 2026-05-07 (fix error silencioso en Executive Report)

### Cambio
- Se agrega pantalla de error visible en `frontend/app/src/ui/ExecutiveReport.tsx`.

### Problema corregido
- El estado `error` se seteaba correctamente pero nunca se mostraba en la UI. Si el backend y el fallback fallaban, el componente quedaba en pantalla en blanco sin ningún mensaje para el usuario.

### Solución aplicada
- Se agrega bloque condicional después del spinner de carga: si `error !== null`, se renderiza una `GlassCard` con el mensaje de error y un botón "REINTENTAR" que invoca `load()`.
- Sin cambios en `reportApi.ts` ni otros archivos.

### Motivo
- Evitar pantalla en blanco durante la demo si el backend no está disponible en el momento de la presentación.

---

## 2026-05-07 (verificación de sincronización con main)

### Cambio
- Se ejecutó `git fetch origin` + `git merge origin/main` antes de iniciar nueva sesión de trabajo.

### Resultado
- Rama local `main` ya estaba al día con `origin/main`. Sin cambios nuevos entrantes.
- Commits recientes de compañeros (`b326e0a`, `549d6c5`, `dc04336`) no tocan ningún archivo del módulo Executive Report Generator.

### Motivo
- Buena práctica de sincronización antes de modificar código para evitar conflictos.

## 2026-04-21

### Cambio
- Se documenta la decisión de arquitectura para usar `react-router-dom` antes de modificar código de frontend.

### Detalle
- Se revisó `frontend/app/src/main.tsx`:
  - Montaje actual: `ThemeProvider` + `CssBaseline` + `App`.
  - No hay enrutamiento activo.
- Se definió integración incremental:
  - Mantener `/` con `App` existente.
  - Agregar `/executive-report` para [[Executive Report Generator]].

### Motivo
- Integrar el módulo ejecutivo sin romper la experiencia operativa actual del SOC.

### Documentos relacionados
- [[arquitectura]]
- [[README]]
- [[componentes]]
- [[endpoints]]

## 2026-04-21 (routing mínimo)

### Cambio
- Se aprueba e inicia integración mínima de `react-router-dom` compatible con React 19.

### Detalle
- Se documenta, antes de tocar código, el alcance exacto de esta iteración:
  - Instalar `react-router-dom` en frontend.
  - Configurar enrutamiento base en `main.tsx`.
  - Definir dos rutas:
    - `/` -> `App` existente sin cambios.
    - `/executive-report` -> [[Executive Report Generator]].

### Motivo
- Habilitar navegación entre vista operativa y vista ejecutiva sin alterar la lógica del dashboard actual.

### Riesgo y control
- Riesgo: romper renderizado inicial.
- Control: mantener `App` intacta y limitar cambios al punto de entrada y nuevo componente.

### Documentos relacionados
- [[arquitectura]]
- [[Executive Report Generator]]

## 2026-04-21 (README de módulo)

### Cambio
- Se crea `docs-julieta/README.md` con documentación completa del módulo [[Executive Report Generator]] en formato Markdown para GitHub.

### Contenido agregado
- Título oficial del módulo.
- Badge de estado (`funcionando`).
- Descripción ejecutiva en español.
- Referencia a dos capturas:
  - `images/screenshot-1.png`
  - `images/screenshot-2.png`
- Secciones:
  - Características
  - Stack técnico
  - Endpoints que consume
  - Cómo ejecutar en local
  - Fallback sin Docker
  - Autora (Julieta - Análisis)

### Documentos relacionados
- [[README]]
- [[componentes]]
- [[cambios]]

## 2026-04-29 (resolución de conflictos merge)

### Cambio
- Se resolvieron conflictos de merge en:
  - `frontend/app/src/main.tsx`
  - `frontend/package.json`
  - `frontend/package-lock.json`

### Criterio aplicado
- Base: conservar cambios provenientes de `main`.
- Excepción requerida: mantener ruta `/executive-report` activa en `main.tsx`.
- Dependencias: mantener paquete de `main` y asegurar `react-router-dom` instalado.

### Resultado
- `main.tsx` quedó con `AppCore` como ruta raíz (`/`) y nueva ruta `/executive-report` hacia `ExecutiveReport`.
- `package.json` conserva dependencias de `main` (incluyendo `react-grid-layout` y `react-leaflet`) y añade `react-router-dom`.
- `package-lock.json` fue regenerado sin marcadores de conflicto y contiene `react-router-dom`.

### Verificación
- No quedan marcadores `<<<<<<<`, `=======`, `>>>>>>>` en los 3 archivos.
- `react-router-dom` confirmado en `package.json` y `package-lock.json`.

## 2026-04-29 (alineación visual con AppCore)

### Cambio
- Se analiza `frontend/app/src/ui/AppCore.tsx` y se adapta `frontend/app/src/ui/ExecutiveReport.tsx` para usar el mismo lenguaje visual de la aplicación principal.

### Hallazgos del análisis
- Tema MUI activo: `createTheme({ palette: { mode: "dark" } })` en `main.tsx` y `AppCore.tsx`.
- Diseño base real proviene de `HUD.css`:
  - Variables `--bg-void`, `--bg-panel`, `--signal`, `--text`, `--mono`, `--sans`.
  - Contenedores tipo panel (`.panel`, `.panel__head`, `.panel__title`, `.panel__body`).
  - Glow y líneas con `var(--signal-glow)` y `var(--line)`.

### Resultado aplicado en Executive Report
- Se reemplaza estilo hardcodeado por tokens visuales del HUD (`var(...)`).
- Se reestructura cada card como panel HUD para coincidir con `AppCore`.
- Se ajusta tipografía a `var(--mono)` / `var(--sans)` y botones con bordes y hover del esquema principal.
- Se mantienen componentes MUI (`Button`, `Chip`, `CircularProgress`, `Typography`, `Grid2`) con estilos alineados.

## 2026-04-29 (fix scroll Executive Report)

### Cambio
- Se corrige el contenedor principal de `frontend/app/src/ui/ExecutiveReport.tsx` para permitir desplazamiento vertical.

### Ajuste aplicado
- En el `Box` raíz:
  - Se mantiene `minHeight: "100vh"` (sin `height` fijo).
  - Se agrega `overflow: "auto"` para habilitar scroll cuando el contenido excede la vista.

## 2026-04-29 (fix scroll independiente del body)

### Cambio
- Se corrige `frontend/app/src/ui/ExecutiveReport.tsx` para que tenga un contenedor scrolleable propio, independiente de `body { overflow: hidden; }`.

### Ajuste aplicado
- En el contenedor raíz del componente:
  - `height: "100vh"`
  - `overflowY: "auto"`
  - `overflowX: "hidden"`

### Motivo
- Garantizar scroll funcional en `/executive-report` incluso cuando el layout global bloquea el scroll del `body`.

## 2026-04-21 (implementación Executive Report)

### Cambio
- Se inicia la implementación funcional completa de [[Executive Report Generator]] con consumo API y fallback offline.

### Alcance de esta iteración
- Crear `frontend/app/src/lib/reportApi.ts`.
- Implementar `frontend/app/src/ui/ExecutiveReport.tsx` con:
  - HUD terminal SOC.
  - Score de riesgo con gauge visual.
  - Resumen ejecutivo con apoyo Ollama.
  - Métricas, top amenazas, ISO 27001 y recomendaciones.
  - Exportación PDF.
- Mantener el módulo aislado y tolerante a caída de backend.

### Documentos relacionados
- [[componentes]]
- [[arquitectura]]

### Resultado de implementación
- Se creó `frontend/app/src/lib/reportApi.ts` con:
  - Consumo real de `GET /events` y `GET /alerts`.
  - Intento de resumen por Ollama vía `POST /api/analyze/{alert_id}`.
  - Fallback automático con dataset simulado realista y resumen alternativo.
- Se implementó `frontend/app/src/ui/ExecutiveReport.tsx` con:
  - UI HUD terminal SOC (`#0a0a0a`, `#00ff41`, monospace, glow).
  - Gauge visual de riesgo `0-100`.
  - Resumen ejecutivo, métricas, top amenazas, ISO 27001 y recomendaciones.
  - Botón `Exportar PDF` funcional.
- Validación técnica:
  - `npm run build` en `frontend/` completado con éxito.

## 2026-04-21 (verificación de compilación y rutas)

### Cambio
- Se valida ejecución del frontend con Node actualizado y se comprueba funcionamiento del routing base.

### Detalle
- Entorno verificado: `node v24.15.0`.
- Comando ejecutado en `frontend/`: `npm run dev`.
- Resultado de compilación:
  - Vite inicia correctamente en `http://localhost:3000/`.
  - Sin errores de arranque durante la prueba.
- Validación de rutas por HTTP:
  - `GET /` -> `200 OK`.
  - `GET /executive-report` -> `200 OK`.
  - Ambas respuestas incluyen el contenedor `#root` esperado de la SPA.

### Motivo
- Confirmar que la integración mínima de `react-router-dom` no rompe la app y que ambas rutas quedan operativas.

### Documentos relacionados
- [[arquitectura]]
- [[Executive Report Generator]]
