# 🛡️ Valhalla SOC - Manual de Acceso y Operaciones

Bienvenido a la plataforma Valhalla SOC. Este documento detalla los procedimientos estándar para el acceso y la gestión del sistema.

## 1. Acceso Inicial
Por seguridad, las credenciales por defecto se han movido a este manual.
- **Usuario:** `admin`
- **Contraseña:** `Valhalla2026!`

> [!IMPORTANT]
> Se recomienda encarecidamente cambiar la contraseña del administrador inmediatamente después del primer acceso desde el perfil de usuario.

## 2. Roles y Permisos
- **Admin (L3 Blue Team):** Acceso total. Gestión de usuarios, auditoría, configuración global del sistema y ajuste de monitores SIEM.
- **Analyst (L2/L1):** Gestión de incidentes, visualización de telemetría, ejecución de runbooks y consulta de Threat Intel.

## 3. Configuración del Sistema
El módulo de **System Settings** (Ajustes Globales) permite configurar:
- **IA/LLM:** URL de Ollama y modelo (default: `llama3`).
- **Threat Intel:** API Keys para VirusTotal y AlienVault OTX. Los valores se almacenan cifrados mediante AES-256-GCM.
- **Retención:** Días de permanencia de logs y límites de subida de evidencias.

## 4. Monitor de Seguridad LSA (Windows)
El sistema permite monitorear y mitigar ataques de volcado de credenciales (Credential Dumping).
- **Checks SCA:** El SOC consulta periódicamente el estado de `RunAsPPL` y `LSA Protection` vía Wazuh.
- **Hardening:** Si un endpoint se detecta como vulnerable, el analista puede ejecutar "Harden LSA", lo cual dispara una respuesta activa que configura el registro de Windows para proteger el proceso `lsass.exe`.

## 5. Auditoría
Todas las acciones administrativas (cambios de configuración, borrado de incidentes, gestión de usuarios) quedan registradas en el **Audit Log**, incluyendo:
- Usuario y Rol.
- Acción (POST/PUT/DELETE).
- Dirección IP de origen.
- Timestamp preciso.

---
*Valhalla SOC v3.41.2 - "Protecting the digital realm."*
