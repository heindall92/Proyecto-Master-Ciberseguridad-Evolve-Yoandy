# Registro de cambios - Julieta

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
