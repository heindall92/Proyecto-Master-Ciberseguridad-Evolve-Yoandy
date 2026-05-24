# Componentes - Julieta

## [[Executive Report Generator]]

### Estado
- Implementado (iteración funcional inicial).

### Objetivo
- Generar un informe ejecutivo para negocio a partir de eventos y alertas SOC sin depender al 100% del backend.

### Entradas de datos
- `GET /events` para contexto de actividad y tipos de ataque.
- `GET /alerts` para criticidad, severidad y priorización.
- `POST /api/analyze/{alert_id}` para resumen ejecutivo asistido por Ollama sobre alertas críticas.

### Comportamiento esperado
- Estética HUD/terminal SOC (`#0a0a0a`, `#00ff41`, monospace, paneles glow).
- Cálculo de score de riesgo global `0-100`.
- Métricas de severidad y top amenazas.
- Mapeo de cumplimiento ISO/IEC 27001:2022.
- Recomendaciones priorizadas.
- Exportación a PDF desde el navegador.
- Fallback con datos simulados realistas cuando la API no responda.

### Notas técnicas
- Implementación aislada en:
  - `frontend/app/src/ui/ExecutiveReport.tsx`
  - `frontend/app/src/lib/reportApi.ts`
- Sin modificar `App.tsx` ni `api.ts`.
- Exportación PDF implementada con `window.print()` para compatibilidad inmediata en demo.
- Fallback autónomo:
  - Si fallan `GET /events` o `GET /alerts`, se cargan datos simulados realistas.
  - Si falla `POST /api/analyze/{alert_id}`, se usa resumen ejecutivo de respaldo.

### Enlaces internos
- [[arquitectura]]
- [[endpoints]]
- [[cambios]]
