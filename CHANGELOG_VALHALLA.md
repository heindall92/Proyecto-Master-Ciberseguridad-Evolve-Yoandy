# Informe de Modificaciones - Valhalla SOC Dashboard
**Fecha:** 29 de Abril, 2026
**Estado:** Producción / Hardened

Este documento detalla las mejoras críticas y correcciones aplicadas al ecosistema Valhalla SOC para asegurar su funcionalidad, conectividad y estética profesional.

## 1. Integración de Inteligencia de Amenazas (VirusTotal)
- **Backend Dinámico:** Se modificó el cliente de VirusTotal en el backend para permitir el uso de llaves de API personalizadas enviadas desde el frontend.
- **Seguridad CORS:** Se actualizaron las políticas de CORS en `main.py` para permitir el encabezado personalizado `X-VT-API-Key`.
- **Módulo Frontend:** Implementación de un panel de configuración en `ThreatIntelView.tsx` que permite a los analistas ingresar, guardar (en localStorage) y **comprobar en tiempo real** (Ping Real) la validez de su API Key antes de usarla.
- **Consultas Reales:** Las búsquedas de IPs, Hashes y Dominios ahora utilizan la llave del analista de forma transparente a través de un puente seguro en el backend.

## 2. Refinamiento de Identidad Visual (Branding)
- **Tipografía Alexana:** Integración total de la tipografía personalizada "Alexana" (basada en SVGs poligonales) en la cabecera del Dashboard.
- **Rediseño de Logo:**
    - Se creó un nuevo icono de marca basado en la letra "V" de Alexana.
    - El logo está encapsulado en un marco de diamante (rombo) rotado 45° con efecto neón y resplandor (`signal-glow`).
    - Implementación de este logo tanto en el **Dashboard principal** como en la **Pantalla de Login**, eliminando dependencias de imágenes externas que fallaban al cargar.
- **Ajustes de Topbar:** Optimización del espaciado y jerarquía visual en la barra superior para mostrar "VALHALLA SOC PRO" con la estética solicitada.

## 3. Estabilidad y Resiliencia de Datos (Wazuh SIEM)
- **Datos 100% Reales:** Se eliminó cualquier rastro de datos simulados o "mock" en el Dashboard. Todas las métricas, alertas y gráficos de volumen provienen exclusivamente de la conexión en vivo con Wazuh/OpenSearch.
- **Métricas de Resumen:** Las tarjetas superiores reflejan el estado real de los agentes y las alertas detectadas en la red.

## 4. Gestión de Operadores (Users View)
- **Corrección de Roles:** Se sincronizaron los valores del formulario de creación de usuarios con los roles esperados por la API de FastAPI (`admin`, `analyst`, `viewer`).
- **Traducción de UI:** Se mantuvo la interfaz en español para el usuario mientras se mapean los datos correctamente al backend en inglés, evitando errores `HTTP 400`.

## 5. Gestión de Procedimientos (Runbooks)
- **Limpieza de Simulaciones:** Se eliminaron los procedimientos de ejemplo "hardcodeados". El sistema ahora opera de forma pura sobre los datos persistidos en la base de datos PostgreSQL, garantizando integridad en los flujos de respuesta ante incidentes reales.

---
**Valhalla SOC Team** - *Tactical Blue Team Operations*
