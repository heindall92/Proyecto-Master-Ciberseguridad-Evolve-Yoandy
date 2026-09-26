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
            {"text": "Correlacionar la IP de origen en Inteligencia › Mapa e Inteligencia › IOCs (VirusTotal, AbuseIPDB)."},
            {"text": "Revisar sesiones Cowrie: comandos, credenciales probadas, geo."},
        ],
        "containment_steps": [
            {"text": "Marcar la IP como bloqueada en Inteligencia › IOCs.", "command": "POST /api/ioc status=blocked"},
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
            {"text": "Consultar el hash en Inteligencia › IOCs (VirusTotal).", "command": "GET /api/virustotal/hash/{hash}"},
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
            {"text": "Correlacionar las IPs en Inteligencia › Mapa."},
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
            {"text": "Verificar el origen en Inteligencia › Mapa."},
        ],
        "containment_steps": [
            {"text": "Poner la IP en vigilancia en Inteligencia › IOCs."},
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
        "description": "Fallos repetidos en Inteligencia (IOCs) o uso indebido de claves API.",
        "severity_applicable": "low",
        "identification_steps": [
            {"text": "Errores 401/429 en consultas VirusTotal."},
            {"text": "Revisar audit log de cambios en settings."},
        ],
        "containment_steps": [
            {"text": "Rotar API key del operador afectado."},
        ],
        "eradication_steps": [
            {"text": "Configurar la clave de VirusTotal del usuario en Inteligencia › IOCs (botón de la llave)."},
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
            {"text": "Revisar Activos › Hardening Windows (LSA) y las alertas mimikatz/procdump en SIEM."},
            {"text": "Correlacionar host en agentes Wazuh."},
        ],
        "containment_steps": [
            {"text": "Aislar endpoint Windows de la red."},
            {"text": "Deshabilitar cuenta comprometida."},
        ],
        "eradication_steps": [
            {"text": "Aplicar hardening LSA vía playbook (RunAsPPL)."},
            {"text": "Revisar las vulnerabilidades del equipo en Activos (inventario de Wazuh) y las CVE explotadas en Inteligencia."},
        ],
        "recovery_steps": [
            {"text": "Reimagen o restauración limpia del endpoint."},
        ],
        "post_mortem_steps": [
            {"text": "Desplegar Sysmon uniforme en flota Windows."},
        ],
    },
]


# ─── Ampliación a 20 runbooks (25/09/2026) ─────────────────────────────────
EXTRA_RUNBOOKS: list[dict] = [
    {
        "name": "Movimiento Lateral (RDP/SMB/SSH interno)",
        "category": "intrusion",
        "description": "Un equipo comprometido se conecta a otros de la red interna con credenciales válidas (MITRE TA0008).",
        "severity_applicable": "critical",
        "identification_steps": [
            {"text": "Buscar inicios de sesión de red y RDP inusuales en Windows (tipos 3 y 10).", "command": "Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4624} | Where-Object { $_.Properties[8].Value -in 3,10 }"},
            {"text": "En Linux, revisar accesos SSH entre servidores internos.", "command": "last -a | head -50; journalctl -u ssh --since '24 hours ago' | grep Accepted"},
            {"text": "Trazar el camino: origen, cuentas usadas y equipos alcanzados en el SIEM de Valhalla."},
        ],
        "containment_steps": [
            {"text": "Aislar de la red los equipos origen y destino (Wazuh active response o switch)."},
            {"text": "Deshabilitar y rotar las cuentas usadas en los saltos."},
            {"text": "Bloquear el tráfico este-oeste afectado (SMB 445, RDP 3389, SSH 22) entre segmentos."},
        ],
        "eradication_steps": [
            {"text": "Buscar persistencia en cada equipo alcanzado: servicios, tareas programadas, claves Run, authorized_keys.", "command": "crontab -l; ls -la ~/.ssh/authorized_keys; systemctl list-timers"},
            {"text": "Eliminar herramientas del atacante (PsExec, Impacket, túneles) y restablecer contraseñas de administradores locales."},
        ],
        "recovery_steps": [
            {"text": "Reincorporar los equipos por fases vigilando nuevas alertas en el SIEM durante 72 h."},
            {"text": "Confirmar que las cuentas afectadas solo acceden desde sus equipos habituales."},
        ],
        "post_mortem_steps": [
            {"text": "Revisar segmentación de red y el uso de cuentas de administrador compartidas (LAPS)."},
            {"text": "Añadir regla de correlación para inicios de sesión de un mismo usuario en muchos equipos en poco tiempo."},
        ],
    },
    {
        "name": "Web Shell en Servidor Web",
        "category": "malware",
        "description": "Script malicioso subido a un servidor web que permite ejecutar comandos a distancia (MITRE T1505.003).",
        "severity_applicable": "critical",
        "identification_steps": [
            {"text": "Buscar ficheros web creados o modificados recientemente.", "command": "find /var/www -type f -newermt '-3 days' \\( -name '*.php' -o -name '*.jsp' -o -name '*.aspx' \\)"},
            {"text": "Revisar el log de acceso: peticiones POST a ficheros raros y respuestas 200 desde IPs externas.", "command": "grep POST /var/log/nginx/access.log | awk '{print $1,$7}' | sort | uniq -c | sort -rn | head"},
            {"text": "Comprobar alertas FIM (integridad de ficheros) de Wazuh sobre el directorio web."},
        ],
        "containment_steps": [
            {"text": "Retirar el servidor del balanceador o ponerlo en mantenimiento."},
            {"text": "Bloquear las IPs que usaron la web shell.", "command": "POST /api/firewall/block"},
            {"text": "Guardar copia del fichero malicioso y su hash SHA-256 como evidencia en el incidente."},
        ],
        "eradication_steps": [
            {"text": "Eliminar la web shell y restaurar el código desde el repositorio o una copia limpia."},
            {"text": "Corregir la vulnerabilidad de subida o de ejecución que permitió colocarla."},
        ],
        "recovery_steps": [
            {"text": "Rotar credenciales de base de datos y secretos que la aplicación tuviera en configuración."},
            {"text": "Reactivar el servicio con FIM de Wazuh vigilando el directorio web."},
        ],
        "post_mortem_steps": [
            {"text": "Denegar la escritura en el directorio web y la ejecución en carpetas de subida."},
            {"text": "Añadir el hash y las IPs a los IOCs de Inteligencia."},
        ],
    },
    {
        "name": "Escalada de Privilegios en Linux",
        "category": "intrusion",
        "description": "Un usuario sin privilegios obtiene root mediante sudo mal configurado, binarios SUID o una vulnerabilidad del kernel (MITRE TA0004).",
        "severity_applicable": "high",
        "identification_steps": [
            {"text": "Revisar el uso de sudo y los cambios a root.", "command": "journalctl _COMM=sudo --since '24 hours ago'; grep -i 'session opened for user root' /var/log/auth.log"},
            {"text": "Buscar binarios SUID nuevos o inesperados.", "command": "find / -perm -4000 -type f -newermt '-7 days' 2>/dev/null"},
            {"text": "Comprobar la versión del kernel frente a CVE explotadas (Inteligencia > Vulnerabilidades).", "command": "uname -r"},
        ],
        "containment_steps": [
            {"text": "Bloquear la cuenta implicada y cerrar sus sesiones.", "command": "usermod -L <usuario>; pkill -KILL -u <usuario>"},
            {"text": "Aislar el servidor si hay indicios de acceso root."},
        ],
        "eradication_steps": [
            {"text": "Retirar el bit SUID a binarios no necesarios y corregir /etc/sudoers con visudo."},
            {"text": "Aplicar el parche del kernel o del paquete vulnerable y reiniciar."},
        ],
        "recovery_steps": [
            {"text": "Reinstalar desde imagen limpia si root estuvo comprometido y no se puede garantizar la integridad."},
            {"text": "Vigilar con Wazuh (rootcheck y SCA) las siguientes 72 h."},
        ],
        "post_mortem_steps": [
            {"text": "Revisar la política de sudo con mínimo privilegio y la frecuencia de parcheo."},
        ],
    },
    {
        "name": "Compromiso de Correo Corporativo (BEC)",
        "category": "phishing",
        "description": "Un atacante accede a un buzón y lo usa para fraude: cambios de cuenta bancaria, facturas falsas o nuevos phishing internos.",
        "severity_applicable": "high",
        "identification_steps": [
            {"text": "Revisar inicios de sesión del buzón desde países o IPs inusuales y MFA rechazados."},
            {"text": "Buscar reglas de reenvío o de borrado creadas por el atacante en el buzón."},
            {"text": "Identificar correos enviados por la cuenta a proveedores y clientes en las últimas 72 h."},
        ],
        "containment_steps": [
            {"text": "Cerrar todas las sesiones, restablecer la contraseña y exigir MFA."},
            {"text": "Eliminar reglas de reenvío maliciosas y aplicaciones OAuth no autorizadas."},
            {"text": "Avisar por teléfono (no por correo) a finanzas y a los destinatarios afectados."},
        ],
        "eradication_steps": [
            {"text": "Retirar de todos los buzones los correos maliciosos enviados desde la cuenta."},
            {"text": "Añadir remitentes y dominios de phishing como IOC y bloquearlos en la pasarela de correo."},
        ],
        "recovery_steps": [
            {"text": "Validar con el banco cualquier transferencia pendiente y solicitar su retención si procede."},
        ],
        "post_mortem_steps": [
            {"text": "Valorar notificación a la AEPD (RGPD, 72 h) si hubo acceso a datos personales."},
            {"text": "Reforzar formación sobre fraude del CEO y verificación de cambios de cuenta bancaria."},
        ],
    },
    {
        "name": "Criptominería en Servidores",
        "category": "malware",
        "description": "Uso ilegítimo de CPU/GPU para minar criptomonedas, habitual tras explotar servicios expuestos (MITRE T1496).",
        "severity_applicable": "medium",
        "identification_steps": [
            {"text": "Detectar procesos con CPU sostenida alta y nombres extraños.", "command": "ps -eo pid,user,%cpu,cmd --sort=-%cpu | head -15"},
            {"text": "Buscar conexiones a pools de minería (puertos 3333, 4444, 5555, 14444).", "command": "ss -tunap | grep -E ':(3333|4444|5555|14444)'"},
            {"text": "Revisar el inventario del equipo en Activos (procesos y puertos) y sus alertas en el SIEM."},
        ],
        "containment_steps": [
            {"text": "Terminar el proceso y bloquear las IPs y dominios del pool.", "command": "kill -9 <pid>"},
            {"text": "Aislar el equipo si el minero se relanza (persistencia activa)."},
        ],
        "eradication_steps": [
            {"text": "Eliminar la persistencia: cron, systemd, ~/.bashrc y claves SSH añadidas.", "command": "crontab -l; ls /etc/systemd/system; cat ~/.ssh/authorized_keys"},
            {"text": "Parchear el servicio explotado (buscar su CVE en Inteligencia > Vulnerabilidades)."},
        ],
        "recovery_steps": [
            {"text": "Rotar credenciales del servidor y vigilar el consumo de CPU durante una semana."},
        ],
        "post_mortem_steps": [
            {"text": "Añadir alerta por consumo de CPU sostenido y conexiones a puertos de minería."},
        ],
    },
    {
        "name": "Explotación de Vulnerabilidad Crítica (KEV)",
        "category": "other",
        "description": "Una CVE del catálogo CISA KEV (explotada activamente) afecta a un activo propio.",
        "severity_applicable": "critical",
        "identification_steps": [
            {"text": "Confirmar qué activos tienen la versión vulnerable (Activos > vulnerabilidades por equipo)."},
            {"text": "Revisar la prioridad, el CVSS y si hay exploit público en Inteligencia > Vulnerabilidades."},
            {"text": "Buscar indicios de explotación en el SIEM desde la fecha de publicación de la CVE."},
        ],
        "containment_steps": [
            {"text": "Aplicar la mitigación temporal del fabricante (desactivar módulo, WAF, restringir acceso)."},
            {"text": "Restringir la exposición a internet del servicio hasta parchear."},
        ],
        "eradication_steps": [
            {"text": "Aplicar el parche o actualizar a la versión corregida antes de la fecha límite de CISA."},
            {"text": "Si hubo explotación, tratarlo como intrusión y seguir ese runbook."},
        ],
        "recovery_steps": [
            {"text": "Verificar que Wazuh deja de marcar la vulnerabilidad en el siguiente inventario."},
        ],
        "post_mortem_steps": [
            {"text": "Medir el tiempo desde la publicación hasta el parche y ajustar la política de parcheo."},
        ],
    },
    {
        "name": "Almacenamiento en la Nube Expuesto",
        "category": "data_breach",
        "description": "Un bucket o recurso compartido en la nube queda público y expone datos por una configuración incorrecta.",
        "severity_applicable": "high",
        "identification_steps": [
            {"text": "Identificar el recurso, qué datos contiene y desde cuándo es público."},
            {"text": "Revisar los registros de acceso del proveedor para saber si alguien descargó datos."},
        ],
        "containment_steps": [
            {"text": "Retirar el acceso público y revocar enlaces compartidos y claves de acceso asociadas."},
            {"text": "Conservar los registros de acceso como evidencia antes de que caduquen."},
        ],
        "eradication_steps": [
            {"text": "Corregir la política de acceso y activar el bloqueo de acceso público a nivel de cuenta."},
        ],
        "recovery_steps": [
            {"text": "Rotar cualquier secreto que estuviera almacenado en el recurso."},
        ],
        "post_mortem_steps": [
            {"text": "Valorar la notificación a la AEPD en 72 h y a los afectados (RGPD arts. 33 y 34)."},
            {"text": "Añadir revisión periódica de configuración de la nube (CSPM) al plan de controles."},
        ],
    },
    {
        "name": "Abuso de Cuenta Privilegiada",
        "category": "insider_threat",
        "description": "Un administrador o cuenta de servicio con privilegios se usa fuera de su función o en horario inusual.",
        "severity_applicable": "high",
        "identification_steps": [
            {"text": "Revisar la actividad de la cuenta en Sistema > Auditoría (acciones y resultado).", "command": "GET /api/audit?user=<usuario>"},
            {"text": "Comparar con su patrón habitual: horario, IP de origen y tipo de acciones."},
            {"text": "Buscar cambios de permisos, creación de usuarios o borrado de registros."},
        ],
        "containment_steps": [
            {"text": "Suspender o degradar la cuenta mientras se investiga (con aprobación de dirección)."},
            {"text": "Preservar los registros de auditoría como evidencia con su huella SHA-256."},
        ],
        "eradication_steps": [
            {"text": "Revertir los cambios no autorizados y revisar las cuentas creadas por el usuario."},
        ],
        "recovery_steps": [
            {"text": "Reasignar las tareas críticas y rotar las credenciales compartidas que conociera."},
        ],
        "post_mortem_steps": [
            {"text": "Aplicar doble aprobación para acciones críticas y revisión trimestral de privilegios."},
            {"text": "Coordinar con RR. HH. y el área legal antes de cualquier comunicación."},
        ],
    },
    {
        "name": "Canal C2 y Tunelización DNS",
        "category": "malware",
        "description": "Un equipo infectado se comunica con el servidor de mando del atacante, a veces escondiendo datos en consultas DNS (MITRE T1071, T1071.004).",
        "severity_applicable": "critical",
        "identification_steps": [
            {"text": "Buscar conexiones periódicas (beaconing) a la misma IP o dominio: Bifröst > hunting 'Reincidentes'."},
            {"text": "Detectar consultas DNS con subdominios muy largos o aleatorios hacia un mismo dominio."},
            {"text": "Analizar el dominio o la IP en Inteligencia (VirusTotal, AbuseIPDB)."},
        ],
        "containment_steps": [
            {"text": "Bloquear el dominio en el DNS interno y la IP en el firewall.", "command": "POST /api/firewall/block"},
            {"text": "Aislar el equipo infectado sin apagarlo (conservar la memoria para el análisis)."},
        ],
        "eradication_steps": [
            {"text": "Identificar y eliminar el implante y su persistencia; reinstalar si no hay garantías."},
        ],
        "recovery_steps": [
            {"text": "Vigilar nuevas consultas al mismo dominio desde otros equipos durante una semana."},
        ],
        "post_mortem_steps": [
            {"text": "Forzar el uso del DNS corporativo y registrar las consultas para poder cazarlas."},
        ],
    },
    {
        "name": "Compromiso de la Cadena de Suministro",
        "category": "other",
        "description": "Una dependencia, paquete o actualización de un proveedor llega con código malicioso (MITRE T1195).",
        "severity_applicable": "critical",
        "identification_steps": [
            {"text": "Identificar el paquete o versión afectada y en qué sistemas está instalado (Activos > paquetes)."},
            {"text": "Revisar el aviso del proveedor y los IOCs publicados (hashes, dominios)."},
            {"text": "Buscar esos IOCs en el SIEM desde la fecha de instalación."},
        ],
        "containment_steps": [
            {"text": "Congelar la versión afectada en los repositorios internos y bloquear sus dominios."},
            {"text": "Aislar los sistemas donde se detecten los IOCs."},
        ],
        "eradication_steps": [
            {"text": "Desinstalar o fijar una versión limpia y verificada por firma o hash."},
            {"text": "Rotar los secretos a los que tuvo acceso el componente (tokens de CI/CD, claves)."},
        ],
        "recovery_steps": [
            {"text": "Reconstruir los artefactos desde fuentes verificadas y redesplegar."},
        ],
        "post_mortem_steps": [
            {"text": "Mantener un inventario de dependencias (SBOM) y auditoría automática (pip-audit, npm audit)."},
        ],
    },
]

DEFAULT_RUNBOOKS = DEFAULT_RUNBOOKS + EXTRA_RUNBOOKS


# Nombres de pantallas antiguos en textos de runbooks ya sembrados (Threat Map, Threat Intel,
# LSA Monitor…): se sustituyen por la navegación actual en las instalaciones existentes.
UI_RENAMES: list[tuple[str, str]] = [
    ('Correlacionar IP origen en Threat Map y Threat Intel (VirusTotal).',
     'Correlacionar la IP de origen en Inteligencia › Mapa e Inteligencia › IOCs (VirusTotal, AbuseIPDB).'),
    ('Añadir IP a IOC con estado blocked desde Threat Intel.',
     'Marcar la IP como bloqueada en Inteligencia › IOCs.'),
    ('Consultar hash en Threat Intel (VirusTotal).',
     'Consultar el hash en Inteligencia › IOCs (VirusTotal).'),
    ('Correlacionar IPs en Threat Map.',
     'Correlacionar las IPs en Inteligencia › Mapa.'),
    ('Verificar origen en Threat Map.',
     'Verificar el origen en Inteligencia › Mapa.'),
    ('Watchlist IP en Threat Intel.',
     'Poner la IP en vigilancia en Inteligencia › IOCs.'),
    ('Fallos repetidos en Threat Intel o uso indebido de claves API.',
     'Fallos repetidos en Inteligencia (IOCs) o uso indebido de claves API.'),
    ('Configurar clave por usuario en perfil Threat Intel.',
     'Configurar la clave de VirusTotal del usuario en Inteligencia › IOCs (botón de la llave).'),
    ('Revisar LSA Monitor y alertas mimikatz/procdump en SIEM.',
     'Revisar Activos › Hardening Windows (LSA) y las alertas mimikatz/procdump en SIEM.'),
    ('Escanear con Wazuh vulnerability scan.',
     'Revisar las vulnerabilidades del equipo en Activos (inventario de Wazuh) y las CVE explotadas en Inteligencia.'),
]


def _rename_steps(steps):
    changed = False
    out = []
    for st in steps or []:
        st = dict(st)
        for old, new in UI_RENAMES:
            if st.get("text") == old:
                st["text"] = new
                changed = True
        out.append(st)
    return out, changed


async def seed_runbooks_if_empty(db) -> int:
    """Añade los runbooks por defecto que falten (por nombre).

    Antes solo sembraba con la tabla vacía, así que los nuevos nunca llegaban a una
    instalación existente. Los archivados (is_active=False) existen y no se reactivan.
    """
    from sqlalchemy import select

    existing = {n for (n,) in (await db.execute(select(Runbook.name))).all()}
    # Actualiza los textos con nombres de pantallas antiguos
    for rb in (await db.execute(select(Runbook))).scalars():
        if rb.description in dict(UI_RENAMES):
            rb.description = dict(UI_RENAMES)[rb.description]
        for phase in ("identification_steps", "containment_steps", "eradication_steps", "recovery_steps", "post_mortem_steps"):
            steps, changed = _rename_steps(getattr(rb, phase))
            if changed:
                setattr(rb, phase, steps)
    added = 0
    for rb in DEFAULT_RUNBOOKS:
        if rb["name"] not in existing:
            db.add(Runbook(**rb, is_active=True))
            added += 1
    return added
