"""Runbooks SOC por defecto — seed en startup."""
from __future__ import annotations

from app.models import Runbook

DEFAULT_RUNBOOKS: list[dict] = [
    {
        "name": "Brute Force SSH/Telnet (Cowrie)",
        "category": "intrusion",
        "description": "Respuesta ante intentos masivos de autenticación contra el honeypot Cowrie.",
        "severity_applicable": "high",
        "identification_steps": [
            {"text": "Verificar alertas Wazuh reglas 5710/5712 o grupo cowrie en SIEM.", "command": "GET /api/wazuh/recent-alerts?hours=24"},
            {"text": "Correlacionar IP origen en Threat Map y Threat Intel (VirusTotal)."},
            {"text": "Revisar sesiones Cowrie: comandos, credenciales probadas, geo."},
        ],
        "containment_steps": [
            {"text": "Añadir IP a IOC con estado blocked desde Threat Intel.", "command": "POST /api/ioc status=blocked"},
            {"text": "Escalar a ticket en Workspace si supera umbral del monitor."},
            {"text": "Notificar al canal SOC vía chat interno."},
        ],
        "eradication_steps": [
            {"text": "Confirmar que no hay pivot hacia red interna (solo honeypot)."},
            {"text": "Revisar logs Cowrie en Wazuh Indexer últimas 24h."},
        ],
        "recovery_steps": [
            {"text": "Mantener Cowrie activo para inteligencia continua."},
            {"text": "Documentar TTPs en notas del ticket."},
        ],
        "post_mortem_steps": [
            {"text": "Actualizar reglas de monitor si falsos positivos."},
            {"text": "Exportar IOCs bloqueados para firewall perimetral."},
        ],
    },
    {
        "name": "Malware / Payload en Honeypot",
        "category": "malware",
        "description": "Descarga o ejecución de scripts maliciosos detectados en sesión Cowrie.",
        "severity_applicable": "critical",
        "identification_steps": [
            {"text": "Identificar comando wget/curl/bash en sesión Cowrie."},
            {"text": "Extraer hash del artefacto si está en logs."},
            {"text": "Consultar hash en Threat Intel (VirusTotal).", "command": "GET /api/virustotal/hash/{hash}"},
        ],
        "containment_steps": [
            {"text": "Bloquear IP atacante en IOC."},
            {"text": "Aislar muestra en entorno sandbox (no ejecutar en SOC)."},
            {"text": "Crear ticket crítico en Workspace."},
        ],
        "eradication_steps": [
            {"text": "Verificar que ningún endpoint real ejecutó el mismo hash."},
            {"text": "Buscar IOC en agentes Wazuh (syscheck/vuln)."},
        ],
        "recovery_steps": [
            {"text": "Rotar credenciales si hubo intento de exfiltración simulada."},
        ],
        "post_mortem_steps": [
            {"text": "Añadir hash a watchlist permanente."},
        ],
    },
    {
        "name": "Phishing / Credenciales Comprometidas",
        "category": "phishing",
        "description": "Sospecha de robo de credenciales o acceso no autorizado a cuentas.",
        "severity_applicable": "high",
        "identification_steps": [
            {"text": "Revisar alertas de autenticación anómala en SIEM."},
            {"text": "Validar con usuario afectado (canal seguro)."},
        ],
        "containment_steps": [
            {"text": "Forzar cierre de sesión: POST /api/auth/logout en cuentas afectadas."},
            {"text": "Deshabilitar usuario temporalmente en gestión de usuarios (admin)."},
        ],
        "eradication_steps": [
            {"text": "Reset de contraseña desde perfil o admin."},
            {"text": "Revocar tokens/sesiones activas."},
        ],
        "recovery_steps": [
            {"text": "Habilitar MFA si está disponible en IdP."},
            {"text": "Monitoreo 72h en SIEM para la cuenta."},
        ],
        "post_mortem_steps": [
            {"text": "Awareness al departamento afectado."},
        ],
    },
    {
        "name": "Ransomware — Contención Inicial",
        "category": "ransomware",
        "description": "Indicadores de cifrado masivo o extorsión (reglas Wazuh ransomware).",
        "severity_applicable": "critical",
        "identification_steps": [
            {"text": "Confirmar alertas nivel ≥12 y grupos ransomware en SIEM."},
            {"text": "Identificar host/agente Wazuh origen."},
        ],
        "containment_steps": [
            {"text": "Aislar host de red (VLAN cuarentena / desconectar NIC)."},
            {"text": "Detener servicios de escritura compartida."},
            {"text": "Escalar ticket P1 en Workspace."},
        ],
        "eradication_steps": [
            {"text": "Identificar vector inicial (email, RDP, vuln)."},
            {"text": "Eliminar persistencia según EDR/Wazuh."},
        ],
        "recovery_steps": [
            {"text": "Restaurar desde backup offline verificado."},
            {"text": "Validar integridad antes de reconectar."},
        ],
        "post_mortem_steps": [
            {"text": "Timeline forense y lecciones aprendidas."},
        ],
    },
    {
        "name": "DDoS / Saturación Perimetral",
        "category": "ddos",
        "description": "Picos anómalos de tráfico o denegación de servicio.",
        "severity_applicable": "high",
        "identification_steps": [
            {"text": "Revisar volumen de alertas en dashboard (chart-vol)."},
            {"text": "Correlacionar IPs en Threat Map."},
        ],
        "containment_steps": [
            {"text": "Activar mitigación en firewall/WAF (proveedor)."},
            {"text": "Rate-limit en nginx/gateway si aplica."},
        ],
        "eradication_steps": [
            {"text": "Filtrar rangos ASN maliciosos."},
        ],
        "recovery_steps": [
            {"text": "Monitorizar SLA de servicios críticos."},
        ],
        "post_mortem_steps": [
            {"text": "Actualizar playbook con umbrales medidos."},
        ],
    },
    {
        "name": "Exfiltración de Datos",
        "category": "data_breach",
        "description": "Transferencia sospechosa de volumen alto hacia destinos externos.",
        "severity_applicable": "critical",
        "identification_steps": [
            {"text": "Alertas de firewall/DLP en SIEM."},
            {"text": "Revisar conexiones salientes del activo afectado."},
        ],
        "containment_steps": [
            {"text": "Bloquear IP/destino en IOC."},
            {"text": "Cortar sesión del usuario/host involucrado."},
        ],
        "eradication_steps": [
            {"text": "Preservar evidencia (pcap, logs) en ticket."},
        ],
        "recovery_steps": [
            {"text": "Evaluar notificación legal/compliance."},
        ],
        "post_mortem_steps": [
            {"text": "Clasificar datos afectados (PII, IP, etc.)."},
        ],
    },
    {
        "name": "Amenaza Interna (Insider)",
        "category": "insider_threat",
        "description": "Actividad anómala de usuario privilegiado o acceso fuera de horario.",
        "severity_applicable": "high",
        "identification_steps": [
            {"text": "Revisar audit log: GET /api/audit (admin)."},
            {"text": "Correlacionar con tickets y acciones en Workspace."},
        ],
        "containment_steps": [
            {"text": "Suspender cuenta en panel de usuarios."},
            {"text": "Revocar sesiones activas."},
        ],
        "eradication_steps": [
            {"text": "Investigar rutas API y evidencias adjuntas."},
        ],
        "recovery_steps": [
            {"text": "Restaurar acceso con mínimo privilegio."},
        ],
        "post_mortem_steps": [
            {"text": "Refuerzo de segregación de funciones."},
        ],
    },
    {
        "name": "Escaneo de Puertos / Reconocimiento",
        "category": "intrusion",
        "description": "Actividad de reconocimiento (nmap, masscan) contra honeypot o perímetro.",
        "severity_applicable": "medium",
        "identification_steps": [
            {"text": "Alertas Cowrie o IDS de escaneo en SIEM."},
            {"text": "Verificar origen en Threat Map."},
        ],
        "containment_steps": [
            {"text": "Watchlist IP en Threat Intel."},
        ],
        "eradication_steps": [
            {"text": "No bloquear prematuramente si es tráfico de lab (attacker)."},
        ],
        "recovery_steps": [
            {"text": "Ajustar sensibilidad de monitores."},
        ],
        "post_mortem_steps": [
            {"text": "Documentar si fue ejercicio autorizado (Kali Valhalla)."},
        ],
    },
    {
        "name": "Abuso de API / Credenciales VT",
        "category": "other",
        "description": "Fallos repetidos en Threat Intel o uso indebido de claves API.",
        "severity_applicable": "low",
        "identification_steps": [
            {"text": "Errores 401/429 en consultas VirusTotal."},
            {"text": "Revisar audit log de cambios en settings."},
        ],
        "containment_steps": [
            {"text": "Rotar API key del operador afectado."},
        ],
        "eradication_steps": [
            {"text": "Configurar clave por usuario en perfil Threat Intel."},
        ],
        "recovery_steps": [
            {"text": "Validar cuota VT con check-key."},
        ],
        "post_mortem_steps": [
            {"text": "Capacitación sobre almacenamiento seguro de keys."},
        ],
    },
    {
        "name": "Respuesta LSA / Credential Dumping (Windows)",
        "category": "intrusion",
        "description": "Acceso sospechoso a lsass.exe o herramientas de dumping (Sysmon 10).",
        "severity_applicable": "critical",
        "identification_steps": [
            {"text": "Revisar LSA Monitor y alertas mimikatz/procdump en SIEM."},
            {"text": "Correlacionar host en agentes Wazuh."},
        ],
        "containment_steps": [
            {"text": "Aislar endpoint Windows de la red."},
            {"text": "Deshabilitar cuenta comprometida."},
        ],
        "eradication_steps": [
            {"text": "Aplicar hardening LSA vía playbook (RunAsPPL)."},
            {"text": "Escanear con Wazuh vulnerability scan."},
        ],
        "recovery_steps": [
            {"text": "Reimagen o restauración limpia del endpoint."},
        ],
        "post_mortem_steps": [
            {"text": "Desplegar Sysmon uniforme en flota Windows."},
        ],
    },
]


async def seed_runbooks_if_empty(db) -> int:
    from sqlalchemy import select

    existing = (await db.execute(select(Runbook))).scalars().first()
    if existing:
        return 0
    for rb in DEFAULT_RUNBOOKS:
        db.add(Runbook(**rb, is_active=True))
    return len(DEFAULT_RUNBOOKS)
