# Registro de cambios - Julieta

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
