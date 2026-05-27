# Arquitectura - Julieta (Análisis)

## Decisión técnica: introducir enrutamiento con react-router-dom

Fecha: 2026-04-21
Estado: Aprobado para implementación incremental

### Contexto
- El frontend actual monta `App` directamente desde `main.tsx` sin sistema de rutas.
- El nuevo módulo [[Executive Report Generator]] necesita una vista separada para no romper el flujo operativo actual del SOC.
- El proyecto requiere mantener compatibilidad con el dashboard existente mientras se integra el nuevo componente.

### Decisión
- Se usará `react-router-dom` para habilitar navegación por rutas en el frontend.
- Estrategia inicial:
  - Ruta `/` para la vista actual (componente `App` existente).
  - Ruta `/executive-report` para el nuevo componente de análisis ejecutivo.

### Motivos
- Aisla el módulo ejecutivo del dashboard operativo sin modificar su lógica.
- Reduce riesgo de regresión al mantener `App` como pantalla principal.
- Permite crecimiento futuro (más vistas SOC) sin acoplar todo en un solo componente.

### Impacto esperado
- Cambios acotados en el punto de entrada del frontend y dependencias de UI.
- Sin cambios en backend ni en `api.ts` base.
- Integración compatible con el stack actual React + TypeScript + Vite.

### Riesgos y mitigación
- Riesgo: ruptura de montaje en `main.tsx`.
  - Mitigación: migración incremental manteniendo `App` intacto como ruta raíz.
- Riesgo: dependencia nueva no instalada.
  - Mitigación: agregar `react-router-dom` y validar `npm run dev`.

### Referencias internas
- [[README]]
- [[componentes]]
- [[endpoints]]
- [[cambios]]
- [[Executive Report Generator]]
