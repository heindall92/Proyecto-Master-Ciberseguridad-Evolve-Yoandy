/* ======================================================
   VALHALLA SOC — data layer
   Mock data is shown instantly; real Wazuh data loads
   in the background and triggers a view refresh.
   ====================================================== */

window.DATA = {

  alerts: [],

  incidents: [
    {
      id: 'VLH-2401', sev: 'CRIT', title: '[SIMULADO] Ransomware — wks-fin-07', assignee: 'T.STARK', status: 'open', age: '02:14', mitre: 'T1486',
      tactic: 'Impact', affected: ['wks-fin-07','srv-nas-01'], ioc: 'hash: a1b2…f7c9',
      description: 'Ransomware LockBit 3.0 detectado en la estación de trabajo wks-fin-07 del departamento de finanzas. Se han cifrado 847 archivos. El malware intenta propagarse por SMB a los recursos compartidos de red.',
      timeline: ['06:14 — Wazuh detecta escritura masiva de archivos .locked', '06:18 — Regla 87702 activa: ransomware pattern match', '06:22 — Alerta enviada al analista on-call', '06:31 — Agente aislado de la red vía política Wazuh'],
      mitigations: ['1. AISLAR inmediatamente wks-fin-07 de la red (cortar switch port)', '2. Preservar imagen forense antes de cualquier acción', '3. Verificar backup más reciente en srv-nas-01 (comprobar integridad)', '4. Analizar hash del binario en VirusTotal y MalwareBazaar', '5. Buscar IOCs en todos los endpoints: hash a1b2…f7c9', '6. Revisar cuentas con acceso a SMB activo en las últimas 4h', '7. Activar playbook Ransomware Response paso 1'],
      playbook: 'Ransomware Response',
    },
    {
      id: 'VLH-2400', sev: 'CRIT', title: '[SIMULADO] Credenciales comprometidas · RRHH', assignee: 'N.ROMANOV', status: 'progress', age: '04:22', mitre: 'T1078',
      tactic: 'Initial Access', affected: ['wks-rrhh-04','srv-ad-01'], ioc: 'user: maria.garcia',
      description: 'Cuenta de dominio maria.garcia comprometida — acceso desde IP externa 95.142.78.104 (RU, IOC activo APT29) fuera del horario laboral. Se detectaron 3 intentos de movimiento lateral hacia srv-ad-01.',
      timeline: ['02:07 — Login correcto desde 95.142.78.104 (horario inusual)', '02:09 — Acceso a carpeta RRHH/confidencial (183 archivos leídos)', '02:14 — Intento de conexión RDP a srv-ad-01 desde wks-rrhh-04', '02:22 — Alerta SIEM: credencial usada desde 2 IPs simultáneas'],
      mitigations: ['1. DESHABILITAR cuenta maria.garcia inmediatamente en AD', '2. Forzar reset de contraseña + revisar grupos de AD', '3. Bloquear IP 95.142.78.104 en firewall perimetral', '4. Auditar todos los accesos desde esa IP en las últimas 72h', '5. Revisar archivos accedidos: posible exfiltración de datos RRHH', '6. Activar MFA obligatorio para accesos desde IPs externas', '7. Notificar al DPO — posible brecha RGPD'],
      playbook: 'Credential Theft',
    },
    {
      id: 'VLH-2399', sev: 'HIGH', title: '[SIMULADO] C2 beacon — 185.220.101.47', assignee: 'B.BANNER', status: 'progress', age: '05:08', mitre: 'T1071.001',
      tactic: 'Command & Control', affected: ['wks-dev-22'], ioc: 'ip: 185.220.101.47',
      description: 'Comunicación periódica cada 120s (beacon) detectada desde wks-dev-22 hacia 185.220.101.47 (Tor exit node, Cobalt Strike C2 conocido). Patrón consistente con implante post-compromiso.',
      timeline: ['01:00 — Primer beacon detectado por Suricata', '03:08 — Frecuencia regular confirmada (×12 en 24min)', '05:08 — Correlación con IOC VirusTotal score 98/100', '05:15 — Regla Wazuh 100200 (Ollama) clasifica: C2 activo'],
      mitigations: ['1. Bloquear 185.220.101.47 en firewall + DNS sinkhole', '2. Aislar wks-dev-22 de la red preservando memoria RAM', '3. Ejecutar análisis forense de procesos activos (volatility3)', '4. Buscar persistencia: scheduled tasks, registry run keys, crontab', '5. Revisar credenciales del usuario en wks-dev-22', '6. Comprobar si hay otros beacons similares en la red', '7. Activar playbook C2 Beacon Contain'],
      playbook: 'C2 Beacon Contain',
    },
    {
      id: 'VLH-2398', sev: 'HIGH', title: '[SIMULADO] Escalada de privilegios en srv-ad-02', assignee: 'S.ROGERS', status: 'progress', age: '07:51', mitre: 'T1068',
      tactic: 'Privilege Escalation', affected: ['srv-ad-02'], ioc: 'CVE-2021-34527 (PrintNightmare)',
      description: 'Explotación de PrintNightmare (CVE-2021-34527) en srv-ad-02 — un proceso no privilegiado ejecutó código arbitrario como SYSTEM. Se detectó la creación de un usuario local admin oculto.',
      timeline: ['00:00 — Proceso spoolsv.exe ejecuta DLL desde ruta no estándar', '00:03 — Creación de usuario "svc_backup_" con privilegios de admin local', '00:07 — Modificación de grupo Administradores de dominio', '07:51 — Wazuh regla 60128 activa: privilege escalation via print spooler'],
      mitigations: ['1. PARCHEAR inmediatamente CVE-2021-34527 en srv-ad-02', '2. Deshabilitar Print Spooler en todos los Domain Controllers: Stop-Service Spooler', '3. Eliminar usuario "svc_backup_" y revisar todos los admins locales', '4. Auditar cambios en grupos privilegiados AD en las últimas 8h', '5. Revisar qué sistemas se conectaron a srv-ad-02 recientemente', '6. Buscar evidencias de Golden Ticket / Pass-the-Hash', '7. Activar playbook Privilege Escalation'],
      playbook: 'Privilege Escalation',
    },
    {
      id: 'VLH-2397', sev: 'MED', title: '[SIMULADO] Phishing dirigido — dpto. finanzas', assignee: 'C.BARTON', status: 'open', age: '11:02', mitre: 'T1566.001',
      tactic: 'Initial Access', affected: ['wks-fin-02','wks-fin-05'], ioc: 'domain: secure-login-msft.co',
      description: 'Campaña de spear phishing detectada dirigida al departamento de finanzas. Emails suplantando a Microsoft con adjunto .docx macro-enabled. 2 usuarios han abierto el archivo.',
      timeline: ['11:00 — Email recibido por 6 usuarios de finanzas', '11:02 — Wazuh detecta macro execution en wks-fin-02 y wks-fin-05', '11:05 — Conexión saliente a secure-login-msft.co (IOC score 95)'],
      mitigations: ['1. Bloquear dominio secure-login-msft.co en proxy y DNS', '2. Cuarentena inmediata de wks-fin-02 y wks-fin-05', '3. Escanear adjunto .docx con VirusTotal y sandbox', '4. Identificar todos los destinatarios del email', '5. Reportar email a Microsoft MSRC y PhishTank', '6. Activar playbook Phishing Triage'],
      playbook: 'Phishing Triage',
    },
    {
      id: 'VLH-2396', sev: 'MED', title: '[SIMULADO] Exfiltración DNS sospechosa', assignee: 'T.STARK', status: 'progress', age: '18:47', mitre: 'T1048.003',
      tactic: 'Exfiltration', affected: ['wks-dev-08'], ioc: 'domain: cdn-update.cloud',
      description: 'Patrón de exfiltración vía DNS tunneling detectado en wks-dev-08. Volumen inusual de peticiones TXT a cdn-update.cloud con subdominios de longitud > 60 caracteres (datos codificados en base64).',
      timeline: ['18:47 — Zeek detecta 847 peticiones DNS en 10 minutos', '18:50 — Longitud media de subdominios: 68 chars (anómalo)', '18:52 — Correlación con IOC cdn-update.cloud (Spamhaus score 82)'],
      mitigations: ['1. Bloquear cdn-update.cloud en DNS resolver y firewall', '2. Capturar tráfico DNS de wks-dev-08 para análisis forense', '3. Analizar qué datos se han exfiltrado (entropía en subdominios)', '4. Revisar todos los procesos con acceso DNS en el host', '5. Activar playbook Data Exfiltration'],
      playbook: 'Data Exfiltration',
    },
    {
      id: 'VLH-2395', sev: 'LOW', title: '[SIMULADO] Shadow IT — Dropbox sin autorizar', assignee: 'W.MAXIMOFF', status: 'open', age: '1d 04h', mitre: 'T1567',
      tactic: 'Exfiltration', affected: ['wks-mktg-11'], ioc: 'app: Dropbox Desktop Client',
      description: 'Instalación y uso de Dropbox Desktop no autorizado en wks-mktg-11. Se han subido 2.3 GB de archivos corporativos a un almacenamiento cloud personal fuera del perímetro de seguridad.',
      timeline: ['1d 04h — Instalación de Dropbox detectada por FIM', '1d 02h — Primera sincronización: 847 archivos subidos', '12h — Sincronización continua activa'],
      mitigations: ['1. Bloquear Dropbox en proxy y mediante AppLocker/GPO', '2. Identificar qué archivos han sido sincronizados', '3. Evaluar si los datos contienen información sensible (RGPD)', '4. Convocar reunión de awareness con el usuario', '5. Reforzar política de uso aceptable (AUP)'],
      playbook: 'Data Exfiltration',
    },
  ],

  vulns: [],  // populated by /api/vulns from Wazuh Vulnerability Detection

  assets: [],

  iocs: [
    { type: 'IP',     val: '185.220.101.47',       score: 98, source: 'AlienVault OTX',  tags: 'C2 · Cobalt Strike' },
    { type: 'IP',     val: '95.142.78.104',        score: 92, source: 'MISP',            tags: 'APT29 · VPN abuse'  },
    { type: 'DOMAIN', val: 'secure-login-msft.co', score: 95, source: 'PhishTank',       tags: 'phishing · O365'    },
    { type: 'HASH',   val: 'a1b2…f7c9 · SHA256',   score: 99, source: 'VirusTotal',      tags: 'LockBit 3.0'        },
    { type: 'URL',    val: 'hxxp://cdn-upd8.ru/x.bin', score: 88, source: 'MISP',        tags: 'dropper · loader'   },
    { type: 'HASH',   val: '5f3a…91c2 · MD5',      score: 87, source: 'AbuseCH',         tags: 'Emotet'             },
    { type: 'DOMAIN', val: 'cdn-update.cloud',     score: 82, source: 'Spamhaus',        tags: 'C2 · malvertising'  },
    { type: 'IP',     val: '109.248.6.143',        score: 76, source: 'AlienVault OTX',  tags: 'scanner · ToR'      },
  ],

  playbooks: [
    {
      name: 'Ransomware Response', steps: 8, done: 5, meta: 'MITRE T1486 · SLA 15m · SOAR',
      severity: 'CRIT', category: 'Malware',
      description: 'Procedimiento de respuesta ante infección por ransomware. El objetivo es contener la propagación, preservar evidencias y recuperar la operativa minimizando el impacto.',
      runbook: [
        { step: 1, title: 'Detección y verificación', done: true, cmd: null, detail: 'Confirmar la alerta de Wazuh. Verificar en el agente afectado si existe el proceso de cifrado activo. Buscar extensiones inusuales en directorios compartidos.' },
        { step: 2, title: 'Contención — Aislar el host', done: true, cmd: 'wazuh-agent --disconnect <agent_id>  # o cortar el puerto de switch', detail: 'Aislar inmediatamente el host de la red corporativa. Si es posible, desactivar el puerto de switch. Mantener el equipo encendido para análisis forense.' },
        { step: 3, title: 'Preservar evidencias forenses', done: true, cmd: 'volatility3 -f memory.raw windows.pslist  # listar procesos en memoria', detail: 'Obtener imagen de memoria RAM antes de apagar. Exportar logs de eventos Windows (Security, System, Application). Capturar listado de procesos y conexiones de red.' },
        { step: 4, title: 'Identificar vector de entrada', done: true, cmd: null, detail: 'Revisar logs de acceso (VPN, RDP, email). Analizar el primer archivo cifrado para obtener timestamp de infección. Correlacionar con alertas SIEM en ventana de ±30min.' },
        { step: 5, title: 'Analizar la muestra maliciosa', done: true, cmd: null, detail: 'Obtener hash SHA256 del binario. Consultar VirusTotal, MalwareBazaar y Any.run. Identificar familia de ransomware (ID-Ransomware: id-ransomware.malwarehunterteam.com).' },
        { step: 6, title: 'Búsqueda de IOCs en la red', done: false, cmd: 'grep -r "a1b2f7c9" /var/ossec/logs/ # buscar hash en logs Wazuh', detail: 'Distribuir IOCs (hash, IPs, dominios C2) a todos los sensores. Verificar si otros hosts han contactado con el C2. Revisar reglas de firewall para bloquear comunicaciones.' },
        { step: 7, title: 'Recuperación desde backup', done: false, cmd: null, detail: 'Verificar integridad del backup más reciente (comprobar que no está cifrado). Restaurar en entorno aislado primero. Validar funcionamiento antes de reconectar a producción.' },
        { step: 8, title: 'Lecciones aprendidas y hardening', done: false, cmd: null, detail: 'Documentar el incidente en el IRM. Identificar el control que falló. Implementar mejoras: parcheo, segmentación de red, backup inmutable, reglas EDR adicionales. Briefing al CISO.' },
      ],
    },
    {
      name: 'Phishing Triage', steps: 6, done: 6, meta: 'MITRE T1566 · SLA 30m',
      severity: 'HIGH', category: 'Email Security',
      description: 'Triaje de campañas de phishing. Objetivo: contener el impacto, identificar todos los afectados y evitar que el payload se ejecute.',
      runbook: [
        { step: 1, title: 'Analizar el email malicioso', done: true, cmd: null, detail: 'Extraer cabeceras completas (Return-Path, Received, X-Originating-IP). Analizar la URL/dominio del remitente. Verificar registros SPF, DKIM, DMARC del dominio origen.' },
        { step: 2, title: 'Escanear adjuntos e IOCs', done: true, cmd: null, detail: 'Subir adjuntos a VirusTotal (hash SHA256). Analizar URLs en URLScan.io y VirusTotal. Ejecutar en sandbox: Any.run, Cuckoo, Joe Sandbox.' },
        { step: 3, title: 'Identificar todos los receptores', done: true, cmd: null, detail: 'Consultar el gateway de email (Exchange/Google Workspace) para obtener la lista completa de destinatarios. Identificar quién lo ha abierto vs solo recibido.' },
        { step: 4, title: 'Cuarentena y bloqueo', done: true, cmd: null, detail: 'Retirar el email de todas las bandejas via API del gateway. Bloquear el dominio/IP remitente en el gateway y proxy. Añadir IOCs al MISP y al feed de Wazuh.' },
        { step: 5, title: 'Investigar hosts afectados', done: true, cmd: 'ps aux | grep -i "macro\|powershell\|wscript" # buscar procesos de payload', detail: 'En hosts donde se abrió el adjunto: buscar procesos hijos de Word/Excel. Revisar conexiones de red salientes anómalas. Comprobar tareas programadas y persistencia.' },
        { step: 6, title: 'Notificación y cierre', done: true, cmd: null, detail: 'Notificar a los usuarios afectados. Reportar a Google Safe Browsing y Microsoft SmartScreen. Actualizar reglas de detección. Cerrar incidente con lecciones aprendidas.' },
      ],
    },
    {
      name: 'C2 Beacon Contain', steps: 7, done: 3, meta: 'MITRE T1071 · SLA 10m · SOAR',
      severity: 'HIGH', category: 'Network',
      description: 'Respuesta ante comunicación activa con servidor de Command & Control. El tiempo de respuesta es crítico para evitar exfiltración de datos o ejecución de payloads secundarios.',
      runbook: [
        { step: 1, title: 'Confirmar el beacon', done: true, cmd: 'tcpdump -i any host 185.220.101.47 -w beacon.pcap', detail: 'Verificar la frecuencia del beacon (típico: 30s-5min). Analizar el payload HTTP/HTTPS. Confirmar el C2 en bases de datos: Shodan, VirusTotal Graph, MalwareBazaar.' },
        { step: 2, title: 'Bloqueo de red inmediato', done: true, cmd: null, detail: 'Bloquear la IP del C2 en firewall perimetral y en todos los segmentos. Crear regla de DNS sinkhole para el dominio. Activar IDS/IPS rule para detectar intentos adicionales.' },
        { step: 3, title: 'Aislar el host comprometido', done: true, cmd: null, detail: 'Desconectar el host de la red manteniendo la alimentación. Capturar imagen de memoria RAM para análisis del implante.' },
        { step: 4, title: 'Análisis del implante', done: false, cmd: 'volatility3 -f mem.raw windows.netscan  # ver conexiones en memoria\nstrings -n 8 malware.bin | grep -E "http|https|cmd|powershell"', detail: 'Identificar el proceso del implante (Cobalt Strike beacon, Meterpreter, etc.). Extraer configuración del C2 (IPs alternativas, sleep time, jitter). Buscar persistencia en el sistema.' },
        { step: 5, title: 'Búsqueda lateral de compromisos', done: false, cmd: null, detail: 'Comprobar si el mismo implante está presente en otros hosts. Revisar conexiones de red similares en toda la red. Buscar en SIEM el mismo beacon hash o patrón de tráfico.' },
        { step: 6, title: 'Erradicación y limpieza', done: false, cmd: null, detail: 'Eliminar el implante y todos sus componentes de persistencia. Reimaginar el host si hay dudas sobre la integridad. Cambiar todas las credenciales que hayan pasado por el host.' },
        { step: 7, title: 'Monitorización post-incidente', done: false, cmd: null, detail: 'Activar reglas de detección específicas para este C2. Monitorizar el host durante 72h tras la limpieza. Verificar que no hay reinfección ni canales alternativos activos.' },
      ],
    },
    {
      name: 'Lateral Movement', steps: 9, done: 0, meta: 'MITRE T1021 · SLA 20m',
      severity: 'HIGH', category: 'Network',
      description: 'Detección y contención de movimiento lateral dentro de la red interna. El atacante intenta pivotar desde el punto de entrada inicial hacia sistemas de mayor valor.',
      runbook: [
        { step: 1, title: 'Mapear el alcance del movimiento', done: false, cmd: 'grep "lateral\|smb\|wmi\|psexec\|rdp" /var/ossec/logs/alerts.json', detail: 'Identificar todos los sistemas visitados por el atacante. Construir un grafo de movimiento: origen → destinos. Determinar qué credenciales se han usado.' },
        { step: 2, title: 'Identificar técnica utilizada', done: false, cmd: null, detail: 'Pass-the-Hash (T1550.002), Pass-the-Ticket (T1550.003), PsExec (T1569.002), WMI (T1047), RDP (T1021.001). Cada técnica tiene IOCs específicos en los logs de eventos Windows (4648, 4624, 4625).' },
        { step: 3, title: 'Contención dinámica de segmentos', done: false, cmd: null, detail: 'Aislar los segmentos afectados con ACLs dinámicas. Desactivar cuentas comprometidas. Revocar tickets Kerberos activos si aplica.' },
        { step: 4, title: 'Identificar el sistema paciente cero', done: false, cmd: null, detail: 'Remontar la cadena de eventos hacia el vector de entrada original. Examinar el primer sistema comprometido exhaustivamente.' },
        { step: 5, title: 'Auditar credenciales expuestas', done: false, cmd: 'mimikatz (en forense): sekurlsa::logonpasswords  # solo en análisis offline', detail: 'Identificar qué credenciales han sido accedidas en memoria. Forzar reset de contraseñas afectadas. Evaluar exposición de cuentas de servicio.' },
        { step: 6, title: 'Aplicar segmentación de emergencia', done: false, cmd: null, detail: 'Implementar micro-segmentación temporal entre los segmentos afectados. Activar reglas de firewall internas más restrictivas.' },
        { step: 7, title: 'Erradicación en todos los sistemas', done: false, cmd: null, detail: 'Limpiar o reimaginar todos los sistemas comprometidos. No asumir que un sistema está limpio sin análisis forense.' },
        { step: 8, title: 'Reconstruir Active Directory', done: false, cmd: null, detail: 'Si el AD está comprometido: rotar el password de krbtgt dos veces. Revisar GPOs modificadas. Auditar todos los Domain Admins.' },
        { step: 9, title: 'Hardening post-incidente', done: false, cmd: null, detail: 'Implementar Tiering model en AD. Activar Protected Users security group. Deshabilitar NTLM donde sea posible. Deployar LAPS.' },
      ],
    },
    {
      name: 'Data Exfiltration', steps: 7, done: 2, meta: 'MITRE T1048 · SLA 15m · SOAR',
      severity: 'HIGH', category: 'Data Loss',
      description: 'Respuesta ante exfiltración de datos confirmada o sospechada. Objetivo: cuantificar el daño, contener el canal y cumplir obligaciones legales (RGPD 72h).',
      runbook: [
        { step: 1, title: 'Confirmar y cuantificar la exfiltración', done: true, cmd: 'zeek: cat dns.log | awk \'length($9)>60\' | head -50  # DNS tunneling', detail: 'Determinar el canal de exfiltración (DNS, HTTPS, cloud storage). Estimar el volumen de datos transferidos. Identificar qué datos específicos se han exfiltrado.' },
        { step: 2, title: 'Bloquear el canal de exfiltración', done: true, cmd: null, detail: 'Bloquear el dominio/IP destino en firewall y DNS. Para DNS tunneling: rate-limiting en el resolver. Para HTTPS: inspección SSL en proxy.' },
        { step: 3, title: 'Análisis forense del host origen', done: false, cmd: null, detail: 'Identificar el proceso responsable de la exfiltración. Revisar historial de comandos, scripts y herramientas usadas. Capturar evidencias para posible acción legal.' },
        { step: 4, title: 'Clasificar los datos afectados', done: false, cmd: null, detail: 'Determinar si los datos son: PII, datos financieros, secretos comerciales, datos de salud. Evaluar el impacto regulatorio (RGPD, PCI-DSS, HIPAA).' },
        { step: 5, title: 'Notificación legal (RGPD 72h)', done: false, cmd: null, detail: 'Si hay datos personales afectados: notificar a la AEPD en menos de 72h. Preparar notificación a los afectados si es necesario. Documentar todo el proceso de respuesta.' },
        { step: 6, title: 'Revocar accesos y credenciales', done: false, cmd: null, detail: 'Revocar todos los tokens y credenciales del usuario/proceso implicado. Revisar permisos excesivos que facilitaron el acceso.' },
        { step: 7, title: 'Implementar DLP y monitorización', done: false, cmd: null, detail: 'Activar reglas DLP específicas para patrones similares. Aumentar el nivel de logging en sistemas de datos sensibles. Revisar política de clasificación de datos.' },
      ],
    },
    {
      name: 'Credential Theft', steps: 6, done: 4, meta: 'MITRE T1003 · SLA 25m',
      severity: 'HIGH', category: 'Identity',
      description: 'Respuesta ante robo de credenciales. Incluye ataques de volcado de memoria (LSASS), kerberoasting, credential stuffing y pass-the-hash.',
      runbook: [
        { step: 1, title: 'Identificar el vector de robo', done: true, cmd: null, detail: 'Volcado LSASS (T1003.001): proceso accede a lsass.exe. Kerberoasting (T1558.003): solicitudes de tickets para cuentas de servicio. Credential Stuffing: múltiples intentos fallidos desde IPs externas.' },
        { step: 2, title: 'Resetear credenciales comprometidas', done: true, cmd: 'net user <username> /passwordreq:yes /domain\nSet-ADAccountPassword -Identity <user> -Reset', detail: 'Resetear INMEDIATAMENTE todas las credenciales comprometidas. Priorizar cuentas con privilegios elevados. Forzar MFA donde sea posible.' },
        { step: 3, title: 'Revocar sesiones activas', done: true, cmd: null, detail: 'Invalidar todos los tokens de sesión activos. Si Kerberos: rotación doble del hash krbtgt (T1558 Golden Ticket). Cerrar todas las sesiones RDP y VPN activas.' },
        { step: 4, title: 'Auditar uso de las credenciales', done: true, cmd: 'Get-WinEvent -FilterHashtable @{LogName="Security"; Id=4624,4648} | Where-Object {$_.Message -like "*<username>*"}', detail: 'Trazar todos los accesos realizados con las credenciales comprometidas. Identificar qué sistemas han sido accedidos. Evaluar qué información ha podido ser comprometida.' },
        { step: 5, title: 'Eliminar la herramienta de volcado', done: false, cmd: null, detail: 'Localizar y eliminar la herramienta usada (Mimikatz, ProcDump, etc.). Limpiar persistencia en el host comprometido. Verificar que no hay otros agentes.' },
        { step: 6, title: 'Hardening de credenciales', done: false, cmd: null, detail: 'Activar Windows Credential Guard en endpoints. Implementar Protected Users security group en AD. Configurar Fine-Grained Password Policies. Revisar cuentas de servicio (LAPS, gMSA).' },
      ],
    },
    {
      name: 'Privilege Escalation', steps: 8, done: 1, meta: 'MITRE T1068 · SLA 20m',
      severity: 'HIGH', category: 'Endpoint',
      description: 'Respuesta ante escalada de privilegios detectada. Un proceso o usuario sin privilegios elevados ha obtenido o intenta obtener permisos de administrador/root/SYSTEM.',
      runbook: [
        { step: 1, title: 'Confirmar la escalada', done: true, cmd: null, detail: 'Verificar el evento Wazuh (regla 60128 o similar). Confirmar en logs de Windows Event ID 4672 (Special privileges assigned). En Linux: buscar en /var/log/auth.log entradas "sudo\\ gained".' },
        { step: 2, title: 'Identificar la vulnerabilidad explotada', done: false, cmd: null, detail: 'Revisar el CVE asociado. Comprobar si el sistema tiene el parche aplicado. Identificar qué exploit se ha utilizado (kernel exploit, SUID abuse, service misconfiguration).' },
        { step: 3, title: 'Revocar privilegios obtenidos', done: false, cmd: 'net localgroup Administrators <user> /delete  # Windows\ngpasswd -d <user> sudo  # Linux', detail: 'Eliminar inmediatamente los privilegios obtenidos de forma ilegítima. Revisar grupos de administradores locales y de dominio.' },
        { step: 4, title: 'Aislar el sistema afectado', done: false, cmd: null, detail: 'Si la escalada es parte de un ataque activo: aislar el host. Preservar evidencias antes de aplicar el parche.' },
        { step: 5, title: 'Aplicar parche de seguridad', done: false, cmd: null, detail: 'Aplicar el parche del CVE explotado inmediatamente. Si no hay parche disponible: aplicar mitigaciones temporales (deshabilitar el servicio vulnerable).' },
        { step: 6, title: 'Analizar el uso de privilegios obtenidos', done: false, cmd: null, detail: 'Auditar qué acciones se han realizado con los privilegios elevados. Revisar archivos accedidos, comandos ejecutados, cuentas modificadas.' },
        { step: 7, title: 'Buscar escaladas similares en la red', done: false, cmd: null, detail: 'Comprobar si el mismo exploit se ha intentado en otros sistemas. Buscar el mismo CVE en el inventario de vulnerabilidades de Wazuh.' },
        { step: 8, title: 'Hardening y verificación', done: false, cmd: null, detail: 'Implementar el principio de mínimo privilegio. Activar auditoría de cambios de privilegios. Configurar reglas de detección específicas para este vector.' },
      ],
    },
    {
      name: 'Insider Threat', steps: 10, done: 0, meta: 'CERT · SLA 1h',
      severity: 'MED', category: 'Insider',
      description: 'Investigación de amenaza interna (empleado o contratista con acceso legítimo que abusa de sus privilegios). Requiere coordinación con RRHH y Legal.',
      runbook: [
        { step: 1, title: 'Evaluación inicial discreta', done: false, cmd: null, detail: 'NO alertar al sospechoso. Activar monitorización silenciosa reforzada. Documentar todas las evidencias desde el inicio.' },
        { step: 2, title: 'Recopilar evidencias forenses', done: false, cmd: null, detail: 'Exportar logs de acceso a sistemas (AD, VPN, aplicaciones). Revisar actividad en DLP y proxies. Preservar registros de email. Toda la cadena de custodia debe ser documentada.' },
        { step: 3, title: 'Análisis de comportamiento', done: false, cmd: null, detail: 'Comparar el comportamiento actual vs baseline del usuario (UEBA). Identificar anomalías: accesos fuera de horario, volumen inusual de descargas, acceso a datos no relacionados con su función.' },
        { step: 4, title: 'Evaluar el daño potencial', done: false, cmd: null, detail: 'Determinar qué datos o sistemas han sido accedidos de forma anómala. Clasificar la información comprometida. Evaluar si hay motivación económica, competencia desleal o sabotaje.' },
        { step: 5, title: 'Notificación al CISO y Legal', done: false, cmd: null, detail: 'Escalar al CISO con un informe ejecutivo. Involucrar al departamento legal desde el inicio. Coordinar con RRHH sobre los pasos a seguir.' },
        { step: 6, title: 'Coordinación con RRHH', done: false, cmd: null, detail: 'RRHH lidera la parte disciplinaria/contractual. El equipo SOC proporciona evidencias técnicas. NO tomar medidas disciplinarias sin coordinación.' },
        { step: 7, title: 'Contención controlada', done: false, cmd: null, detail: 'Revocar accesos según instrucciones de RRHH/Legal. Cambiar contraseñas de cuentas de servicio a las que el empleado tenía acceso. Revocar tokens y certificados.' },
        { step: 8, title: 'Preservación de evidencias legales', done: false, cmd: null, detail: 'Seguir el estándar de cadena de custodia. Obtener imágenes forenses certificadas. Documentar cada acción con timestamp y firma del investigador.' },
        { step: 9, title: 'Evaluación de impacto completo', done: false, cmd: null, detail: 'Completar el análisis de qué información ha salido de la organización. Evaluar posibles obligaciones legales (notificación RGPD, clientes, socios).' },
        { step: 10, title: 'Reforzar controles preventivos', done: false, cmd: null, detail: 'Implementar principio de mínimo privilegio estricto. Mejorar los controles UEBA. Revisar el proceso de onboarding/offboarding de empleados. Formación en concienciación de seguridad.' },
      ],
    },
  ],

  attacks: [
    { city: 'Moscow',    cc: 'RU', lat: 55.75,  lng:  37.62, ip: '95.142.78.104',  count: 847, type: 'brute-force' },
    { city: 'Beijing',   cc: 'CN', lat: 39.90,  lng: 116.40, ip: '114.114.114.42', count: 621, type: 'scan'        },
    { city: 'Tehran',    cc: 'IR', lat: 35.69,  lng:  51.39, ip: '5.63.15.92',     count: 412, type: 'phishing'    },
    { city: 'Kyiv',      cc: 'UA', lat: 50.45,  lng:  30.52, ip: '185.220.101.47', count: 389, type: 'C2'          },
    { city: 'São Paulo', cc: 'BR', lat:-23.55,  lng: -46.63, ip: '200.17.4.211',   count: 201, type: 'ddos'        },
    { city: 'Lagos',     cc: 'NG', lat:  6.52,  lng:   3.38, ip: '41.58.12.8',     count: 178, type: 'phishing'    },
    { city: 'Seoul',     cc: 'KR', lat: 37.57,  lng: 126.98, ip: '121.174.5.44',   count:  92, type: 'scan'        },
    { city: 'Mumbai',    cc: 'IN', lat: 19.08,  lng:  72.88, ip: '103.57.82.9',    count:  67, type: 'brute-force' },
  ],
  hq: { lat: 40.42, lng: -3.70, city: 'Madrid' },

  metrics: {
    mttd: '04:22',
    mttr: '18:47',
    slaMet: 94.2,
    resolved24h: 41,
    falsePositive: 12.4,
    coverage: 96.8,
  },

  logTemplates: [
    { t: 'ok',   m: '[wazuh-manager] rule 18148 triggered · agent={agent}' },
    { t: 'dim',  m: '[ossec] {ip} · accepted publickey for analyst' },
    { t: 'warn', m: '[suricata] ET SCAN Suspicious inbound to mysqld · src={ip}' },
    { t: 'err',  m: '[EDR] threat.detect · hash={hash} · action=quarantine' },
    { t: 'ok',   m: '[soar] playbook=phish-triage · step 4/6 completed' },
    { t: 'dim',  m: '[filebeat] harvester started · path=/var/log/auth.log' },
    { t: 'warn', m: '[misp] feed update · {n} new IOCs · score≥80' },
    { t: 'err',  m: '[falco] Sensitive file opened · file=/etc/shadow' },
    { t: 'ok',   m: '[vuln-scan] nessus · asset={agent} · cvss_max=9.8' },
    { t: 'dim',  m: '[zeek] connection established · {ip}:{port}' },
  ],
};

// ── Load real data from backend proxy, then refresh the view ─────────────────
(async function loadRealData() {
  try {
    const res  = await fetch('/api/dashboard');
    if (!res.ok) return;
    const data = await res.json();

    if (Array.isArray(data.alerts) && data.alerts.length > 0) {
      window.DATA.alerts = data.alerts;
    }
    if (Array.isArray(data.agents) && data.agents.length > 0) {
      window.DATA.assets = data.agents;
    }
    if (Array.isArray(data.attacks) && data.attacks.length > 0) {
      window.DATA.attacks = data.attacks;
    }
    if (data.metrics) {
      window.DATA.metrics = { ...window.DATA.metrics, ...data.metrics };
    }

    // Update topbar KPIs
    if (data.metrics?.alerts24h != null) {
      const el = document.getElementById('kpi-alerts');
      if (el) el.textContent = data.metrics.alerts24h.toLocaleString();
    }
    if (data.agentStats) {
      const el = document.querySelector('.chip.cyan b');
      if (el) el.textContent = `${data.agentStats.online} / ${data.agentStats.total}`;
    }

    // Re-render current view with real data
    if (typeof window.__refreshView === 'function') {
      window.__refreshView();
    }
  } catch (_) {
    // Wazuh unreachable — stay with mock data silently
  }

  // Cowrie data loaded separately (non-blocking)
  try {
    const cr = await fetch('/api/cowrie');
    if (cr.ok) {
      const cd = await cr.json();
      if (!cd.error) {
        window.DATA.cowrie = window.DATA.cowrie || {};
        if (cd.sessions24h  != null) window.DATA.cowrie.sessions24h  = cd.sessions24h;
        if (cd.topPasswords != null) window.DATA.cowrie.topPasswords  = cd.topPasswords;
        if (cd.topCommands  != null) window.DATA.cowrie.topCommands   = cd.topCommands;
        if (cd.topSources   != null) window.DATA.cowrie.topSources    = cd.topSources;
        if (cd.recentSessions != null) window.DATA.cowrie.recentSessions = cd.recentSessions;
      }
    }
  } catch (_) {}

  // Real CVEs from Wazuh Vulnerability Detection (non-blocking)
  try {
    const vr = await fetch('/api/vulns');
    if (vr.ok) {
      const vd = await vr.json();
      if (vd.ok && Array.isArray(vd.vulns) && vd.vulns.length > 0) {
        window.DATA.vulns = vd.vulns;
        if (typeof window.__refreshView === 'function') window.__refreshView();
      }
    }
  } catch (_) {}

  // Real MTTD/MTTR metrics from ticket data (non-blocking)
  try {
    const mr = await fetch('/api/metrics');
    if (mr.ok) {
      const md = await mr.json();
      if (md.ok) {
        window.DATA.teamMetrics = window.DATA.teamMetrics || {};
        window.DATA.teamMetrics.mttr = md.mttr;
        window.DATA.teamMetrics.mttd = md.mttd;
        window.DATA.teamMetrics.resolvedCount = md.resolvedCount;
        window.DATA.teamMetrics.openCount = md.openCount;
      }
    }
  } catch (_) {}

  // AlienVault OTX IOC feed — requires OTX_API_KEY in backend .env (non-blocking)
  try {
    const ir = await fetch('/api/iocs/feed');
    if (ir.ok) {
      const id = await ir.json();
      if (id.ok && Array.isArray(id.iocs) && id.iocs.length > 0) {
        window.DATA.iocs = id.iocs;
        if (typeof window.__refreshView === 'function') window.__refreshView();
      }
    }
  } catch (_) {}

  // MITRE ATT&CK heatmap — táticas y técnicas reales de Wazuh últimos 30 días
  try {
    const mr = await fetch('/api/mitre');
    if (mr.ok) {
      const md = await mr.json();
      if (md.ok) {
        window.DATA.mitre = { tactics: md.tactics, techniques: md.techniques };
        if (typeof window.__refreshView === 'function') window.__refreshView();
      }
    }
  } catch (_) {}
})();

// Refresh real data every 30 seconds
setInterval(async function () {
  try {
    const res  = await fetch('/api/dashboard');
    if (!res.ok) return;
    const data = await res.json();
    if (Array.isArray(data.alerts) && data.alerts.length > 0) window.DATA.alerts = data.alerts;
    if (Array.isArray(data.agents) && data.agents.length > 0) window.DATA.assets = data.agents;
    if (data.metrics?.alerts24h != null) {
      const el = document.getElementById('kpi-alerts');
      if (el) el.textContent = data.metrics.alerts24h.toLocaleString();
    }
    if (typeof window.__refreshView === 'function') window.__refreshView();
  } catch (_) {}
}, 30000);
