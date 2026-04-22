/* ======================================================
   VALHALLA SOC — mock data
   ====================================================== */

window.DATA = {

  // SIEM alerts (Wazuh-like)
  alerts: [
    { sev: 'CRIT', time: '22:46:58', msg: 'Multiple failed SSH — posible <em>brute-force</em>', rule: '5763', src: 'srv-db-03',  status: 'NUEVA' },
    { sev: 'CRIT', time: '22:46:41', msg: 'Ejecución de <em>mimikatz.exe</em> detectada', rule: '92213', src: 'wks-fin-12', status: 'NUEVA' },
    { sev: 'HIGH', time: '22:45:22', msg: 'Conexión saliente a C2 conocido (<em>185.220.101.47</em>)', rule: '100221', src: 'wks-rrhh-04', status: 'TRIAGE' },
    { sev: 'HIGH', time: '22:44:15', msg: 'Modificación de archivo crítico <em>/etc/shadow</em>', rule: '550',   src: 'srv-web-01',  status: 'TRIAGE' },
    { sev: 'MED',  time: '22:43:02', msg: 'Escaneo de puertos detectado desde <em>10.12.4.88</em>',  rule: '40101', src: 'fw-perim-01',  status: 'NUEVA' },
    { sev: 'HIGH', time: '22:41:50', msg: 'PowerShell codificado en base64 (<em>T1059.001</em>)', rule: '91520', src: 'wks-dev-22',  status: 'CONTENIDO' },
    { sev: 'MED',  time: '22:40:37', msg: 'Nuevo servicio instalado: <em>svchost_helper</em>',   rule: '18148', src: 'srv-ad-02',   status: 'TRIAGE' },
    { sev: 'LOW',  time: '22:39:14', msg: 'Usuario añadido al grupo <em>Domain Admins</em>',     rule: '4728',  src: 'srv-ad-01',   status: 'INFO' },
    { sev: 'CRIT', time: '22:38:02', msg: 'Posible <em>ransomware</em>: cifrado masivo detectado', rule: '87105', src: 'wks-fin-07',  status: 'CONTENIDO' },
    { sev: 'MED',  time: '22:37:21', msg: 'Conexión VPN anómala desde <em>RU · 95.142.*</em>',    rule: '60204', src: 'vpn-gw-01',    status: 'TRIAGE' },
    { sev: 'HIGH', time: '22:36:44', msg: 'Inyección SQL bloqueada en <em>/api/login</em>',       rule: '31516', src: 'waf-ext-01',   status: 'BLOQUEADA' },
    { sev: 'LOW',  time: '22:35:09', msg: 'Actualización de firma AV completada',                 rule: '101',   src: 'edr-cloud',    status: 'OK' },
  ],

  // Active incidents
  incidents: [
    { id: 'VLH-2401', sev: 'CRIT', title: 'Ransomware — wks-fin-07',            assignee: 'T.STARK',   status: 'open',     age: '02:14', mitre: 'T1486'     },
    { id: 'VLH-2400', sev: 'CRIT', title: 'Credenciales comprometidas · RRHH',  assignee: 'N.ROMANOV', status: 'progress', age: '04:22', mitre: 'T1078'     },
    { id: 'VLH-2399', sev: 'HIGH', title: 'C2 beacon — 185.220.101.47',          assignee: 'B.BANNER',  status: 'progress', age: '05:08', mitre: 'T1071.001' },
    { id: 'VLH-2398', sev: 'HIGH', title: 'Escalada de privilegios en srv-ad-02', assignee: 'S.ROGERS',  status: 'progress', age: '07:51', mitre: 'T1068'     },
    { id: 'VLH-2397', sev: 'MED',  title: 'Phishing dirigido — dpto. finanzas',  assignee: 'C.BARTON',  status: 'open',     age: '11:02', mitre: 'T1566.001' },
    { id: 'VLH-2396', sev: 'MED',  title: 'Exfiltración DNS sospechosa',         assignee: 'T.STARK',   status: 'progress', age: '18:47', mitre: 'T1048.003' },
    { id: 'VLH-2395', sev: 'LOW',  title: 'Shadow IT — Dropbox sin autorizar',   assignee: 'W.MAXIMOFF', status: 'open',    age: '1d 04h', mitre: 'T1567'    },
    { id: 'VLH-2394', sev: 'HIGH', title: 'Lateral movement via SMB',            assignee: 'N.ROMANOV', status: 'resolved', age: '2d 08h', mitre: 'T1021.002' },
    { id: 'VLH-2393', sev: 'CRIT', title: 'Webshell en srv-web-01',              assignee: 'B.BANNER',  status: 'resolved', age: '3d 12h', mitre: 'T1505.003' },
  ],

  // Vulnerabilities
  vulns: [
    { cve: 'CVE-2026-1847', desc: 'Apache Log4j2 RCE', component: 'Apache · log4j 2.14.1', cvss: 10.0, affected: 14, patch: 'pendiente' },
    { cve: 'CVE-2026-0442', desc: 'OpenSSH privilege escalation', component: 'OpenSSH 8.4p1', cvss: 9.8, affected: 41, patch: 'parcheando' },
    { cve: 'CVE-2025-9901', desc: 'Windows SMBv3 RCE (EternalBlue v2)', component: 'Windows Server 2019', cvss: 9.3, affected: 8,  patch: 'pendiente' },
    { cve: 'CVE-2026-1102', desc: 'PostgreSQL injection in JSON parser', component: 'PostgreSQL 13.4', cvss: 8.6, affected: 3, patch: 'pendiente' },
    { cve: 'CVE-2025-7812', desc: 'Chrome V8 use-after-free', component: 'Google Chrome 119', cvss: 8.1, affected: 212, patch: 'parcheando' },
    { cve: 'CVE-2026-0119', desc: 'NGINX buffer overflow in mod_proxy', component: 'nginx 1.22.0', cvss: 7.5, affected: 5, patch: 'parcheando' },
    { cve: 'CVE-2025-8844', desc: 'Docker containerd escape', component: 'containerd 1.6.2', cvss: 7.3, affected: 22, patch: 'pendiente' },
  ],

  // Assets
  assets: [
    { name: 'SRV-AD-01',    ip: '10.0.0.11',   os: 'Win Server 2022', status: 'up',   agent: 'Wazuh 4.8',   type: 'controller' },
    { name: 'SRV-AD-02',    ip: '10.0.0.12',   os: 'Win Server 2022', status: 'warn', agent: 'Wazuh 4.8',   type: 'controller' },
    { name: 'SRV-DB-03',    ip: '10.0.1.23',   os: 'Ubuntu 22.04',    status: 'up',   agent: 'Wazuh 4.8',   type: 'database'   },
    { name: 'SRV-WEB-01',   ip: '10.0.2.5',    os: 'Debian 12',       status: 'warn', agent: 'Wazuh 4.8',   type: 'web'        },
    { name: 'SRV-MAIL-02',  ip: '10.0.2.14',   os: 'RHEL 9',          status: 'up',   agent: 'Wazuh 4.8',   type: 'mail'       },
    { name: 'FW-PERIM-01',  ip: '10.0.0.1',    os: 'pfSense 2.7',     status: 'up',   agent: 'syslog',      type: 'firewall'   },
    { name: 'WKS-FIN-07',   ip: '10.12.3.17',  os: 'Win 11 Pro',      status: 'down', agent: 'aislado',     type: 'workstation'},
    { name: 'WKS-FIN-12',   ip: '10.12.3.22',  os: 'Win 11 Pro',      status: 'warn', agent: 'Wazuh 4.7',   type: 'workstation'},
    { name: 'WKS-RRHH-04',  ip: '10.12.4.14',  os: 'Win 11 Pro',      status: 'warn', agent: 'Wazuh 4.8',   type: 'workstation'},
    { name: 'WKS-DEV-22',   ip: '10.12.8.44',  os: 'Ubuntu 24.04',    status: 'up',   agent: 'Wazuh 4.8',   type: 'workstation'},
    { name: 'VPN-GW-01',    ip: '10.0.0.2',    os: 'OpenVPN AS',      status: 'up',   agent: 'syslog',      type: 'vpn'        },
    { name: 'WAF-EXT-01',   ip: '172.16.0.5',  os: 'ModSecurity',     status: 'up',   agent: 'syslog',      type: 'waf'        },
  ],

  // Threat Intel / IOCs
  iocs: [
    { type: 'IP',     val: '185.220.101.47',       score: 98, source: 'AlienVault OTX',  tags: 'C2 · Cobalt Strike' },
    { type: 'IP',     val: '95.142.78.104',        score: 92, source: 'MISP',            tags: 'APT29 · VPN abuse'  },
    { type: 'DOMAIN', val: 'secure-login-msft.co', score: 95, source: 'PhishTank',       tags: 'phishing · O365'    },
    { type: 'HASH',   val: 'a1b2...f7c9 · SHA256',  score: 99, source: 'VirusTotal',      tags: 'LockBit 3.0'        },
    { type: 'URL',    val: 'hxxp://cdn-upd8.ru/x.bin', score: 88, source: 'MISP',        tags: 'dropper · loader'   },
    { type: 'HASH',   val: '5f3a...91c2 · MD5',     score: 87, source: 'AbuseCH',         tags: 'Emotet'             },
    { type: 'DOMAIN', val: 'cdn-update.cloud',     score: 82, source: 'Spamhaus',        tags: 'C2 · malvertising'  },
    { type: 'IP',     val: '109.248.6.143',        score: 76, source: 'AlienVault OTX',  tags: 'scanner · ToR'      },
  ],

  // Playbooks
  playbooks: [
    { name: 'Ransomware Response', steps: 8, done: 5, meta: 'MITRE T1486 · SLA 15m · SOAR' },
    { name: 'Phishing Triage',     steps: 6, done: 6, meta: 'MITRE T1566 · SLA 30m' },
    { name: 'C2 Beacon Contain',   steps: 7, done: 3, meta: 'MITRE T1071 · SLA 10m · SOAR' },
    { name: 'Lateral Movement',    steps: 9, done: 0, meta: 'MITRE T1021 · SLA 20m' },
    { name: 'Data Exfiltration',   steps: 7, done: 2, meta: 'MITRE T1048 · SLA 15m · SOAR' },
    { name: 'Credential Theft',    steps: 6, done: 4, meta: 'MITRE T1003 · SLA 25m' },
    { name: 'Privilege Escalation', steps: 8, done: 1, meta: 'MITRE T1068 · SLA 20m' },
    { name: 'Insider Threat',      steps: 10, done: 0, meta: 'CERT · SLA 1h' },
  ],

  // Attack origins (real lat/lng)
  attacks: [
    { city: 'Moscow',    cc: 'RU', lat: 55.75, lng: 37.62, ip: '95.142.78.104',  count: 847, type: 'brute-force' },
    { city: 'Beijing',   cc: 'CN', lat: 39.90, lng: 116.40, ip: '114.114.114.42', count: 621, type: 'scan'       },
    { city: 'Tehran',    cc: 'IR', lat: 35.69, lng: 51.39, ip: '5.63.15.92',     count: 412, type: 'phishing'    },
    { city: 'Kyiv',      cc: 'UA', lat: 50.45, lng: 30.52, ip: '185.220.101.47', count: 389, type: 'C2'          },
    { city: 'São Paulo', cc: 'BR', lat:-23.55, lng:-46.63, ip: '200.17.4.211',   count: 201, type: 'ddos'        },
    { city: 'Lagos',     cc: 'NG', lat: 6.52,  lng: 3.38,  ip: '41.58.12.8',     count: 178, type: 'phishing'    },
    { city: 'Seoul',     cc: 'KR', lat: 37.57, lng: 126.98, ip: '121.174.5.44',  count: 92,  type: 'scan'        },
    { city: 'Mumbai',    cc: 'IN', lat: 19.08, lng: 72.88, ip: '103.57.82.9',    count: 67,  type: 'brute-force' },
    { city: 'Pyongyang', cc: 'KP', lat: 39.02, lng: 125.75, ip: '175.45.176.3',  count: 54,  type: 'apt'         },
    { city: 'St Petersburg', cc: 'RU', lat: 59.93, lng: 30.32, ip: '46.161.27.1', count: 312, type: 'C2'         },
  ],
  // SOC HQ location (for drawing attack lines)
  hq: { lat: 40.42, lng: -3.70, city: 'Madrid' },

  // Metrics
  metrics: {
    mttd: '04:22',
    mttr: '18:47',
    slaMet: 94.2,
    resolved24h: 41,
    falsePositive: 12.4,
    coverage: 96.8,
  },

  // Log stream templates
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
