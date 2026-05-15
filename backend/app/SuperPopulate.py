import asyncio
import httpx
import json
from datetime import datetime, timedelta, timezone
import random
import uuid
from sqlalchemy import select, delete
from app.db import SessionLocal
from app.models import (
    User, Ticket, AuditLog, IOC, Monitor, Runbook, 
    SystemSetting, ChatMessage, Evidence
)
from app.auth import get_password_hash

# OpenSearch Configuration
OS_URL = "https://wazuh.indexer:9200"
OS_USER = "admin"
OS_PASS = "admin"
INDEX_NAME = f"wazuh-alerts-4.x-demo-{datetime.now().strftime('%Y.%m.%d')}"

async def populate_postgres():
    print("Populating PostgreSQL with SUPER demo data...")
    async with SessionLocal() as db:
        # 1. Users
        admin_res = await db.execute(select(User).where(User.username == "admin"))
        admin = admin_res.scalar_one_or_none()
        if not admin:
            admin = User(username="admin", email="admin@valhalla.soc", password_hash=get_password_hash("Admin123!"), role="admin", security_rank="Commander")
            db.add(admin)
            await db.commit()
            await db.refresh(admin)

        # 2. Monitors
        await db.execute(delete(Monitor))
        monitors = [
            ("SSH Bruteforce", 5, "high", "5710,5712", "Detecta intentos fallidos de login SSH persistentes."),
            ("Web Attack Detection", 10, "high", "31103,31101,31106", "Detecta SQL Injection, XSS y escaneos de directorios."),
            ("Malware Execution", 1, "critical", "100001,100100", "Alerta inmediata ante ejecucion de binarios sospechosos."),
            ("Lateral Movement", 2, "high", "40001,20015", "Detecta uso inusual de psexec o rdp interno."),
            ("Data Exfiltration", 50, "critical", "200001", "Anomalia en volumen de trafico saliente."),
            ("Account Creation", 1, "medium", "60107", "Creacion de usuarios en el sistema (Auditoria).")
        ]
        for name, threshold, sev, pattern, desc in monitors:
            db.add(Monitor(name=name, threshold=threshold, severity_floor=sev, rule_id_pattern=pattern, description=desc, enabled=True))

        # 3. Audit Logs (Rich History)
        await db.execute(delete(AuditLog))
        actions = ["POST", "PUT", "DELETE", "GET", "PATCH", "LOGIN", "LOGOUT"]
        routes = ["/api/auth/login", "/api/tickets", "/api/monitors", "/api/reports/executive", "/api/ioc", "/api/users"]
        ips = ["192.168.1.100", "192.168.1.105", "10.0.0.50", "172.16.0.12"]
        for _ in range(100):
            db.add(AuditLog(
                user_id=admin.id, 
                username=admin.username, 
                action=random.choice(actions), 
                route=random.choice(routes), 
                ip_address=random.choice(ips),
                timestamp=datetime.now(timezone.utc) - timedelta(minutes=random.randint(1, 10080))
            ))

        # 4. IOCs (Rich Intel)
        await db.execute(delete(IOC))
        iocs = [
            ("45.33.32.156", "ip", 85, 70, "CN", "Known SSH brute forcer. Targeted European financial sector."),
            ("evil-domain.com", "domain", 92, 65, "US", "C2 server for Cobalt Strike payloads. Registered 48h ago."),
            ("5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8", "hash", 100, 55, "RU", "Emotet variant payload. Detected in phishing campaign."),
            ("91.108.4.0", "ip", 95, 80, "NL", "Botnet Controller. High volume of RDP scans."),
            ("185.220.101.12", "ip", 70, 50, "DE", "Tor Exit Node. Associated with anonymous credential stuffing."),
            ("8.8.8.8", "ip", 0, 94, "US", "Google Public DNS. Trusted indicator for testing.")
        ]
        for val, itype, score, eng, country, notes in iocs:
            db.add(IOC(value=val, ioc_type=itype, malicious_score=score, total_engines=eng, country=country, status="active" if score > 50 else "watchlist", analyst_notes=notes))

        # 5. Runbooks (Detailed Procedures)
        await db.execute(delete(Runbook))
        runbooks_data = [
            ("Ransomware Containment", "malware", "Procedimiento critico para aislar activos infectados.", ["Check encryption alerts", "Identify source PID"], ["Isolate network", "Disable compromised accounts"], "critical"),
            ("Phishing Response", "phishing", "Guia para analizar y mitigar campanas de phishing.", ["Extract headers", "Check URL in VT"], ["Delete emails from server", "Reset user password"], "medium"),
            ("DDoS Mitigation", "ddos", "Acciones ante ataques de denegacion de servicio.", ["Identify target IP", "Analyze volume"], ["Enable Cloudflare", "Apply rate limiting"], "high"),
            ("Insider Threat", "insider_threat", "Auditoria para detectar fugas de datos.", ["Review file access", "Check USB events"], ["Revoke access", "Interview suspect"], "medium"),
            ("SQL Injection Analysis", "intrusion", "Analisis forense de ataques a base de datos.", ["Check web logs", "Identify payload"], ["Patch vulnerable code", "Sanitize inputs"], "high")
        ]
        for name, cat, desc, id_steps, cont_steps, sev in runbooks_data:
            db.add(Runbook(name=name, category=cat, description=desc, identification_steps=id_steps, containment_steps=cont_steps, severity_applicable=sev, created_by_id=admin.id))

        # 6. Tickets (Comprehensive Incidents)
        await db.execute(delete(Ticket))
        incidents = [
            ("Deteccion de Ransomware: SRV-DB-PROD", "Se detecto cifrado masivo de archivos. Proceso: powershell.exe -enc ...", "critical", "open", "Malware", "SRV-DB-PROD", "185.220.101.12", "Ataque confirmado por EDR.", "Aislar servidor inmediatamente."),
            ("Fuerza Bruta SSH: Honeypot-01", "5,000+ intentos fallidos detectados.", "high", "in_progress", "Intrusion", "Valhalla-Honey-SSH", "45.33.32.156", "Escaneo masivo seguido de ataque diccionario.", "Bloquear IP perimetralmente."),
            ("Phishing Reportado: CEO Office", "Correo pidiendo credenciales M365.", "high", "open", "Phishing", "WKST-CEO-01", "91.108.4.0", "Spear phishing dirigido.", "Borrar correos y forzar MFA."),
            ("Exfiltracion S3: AWS-Gateway", "Trafico inusual hacia bucket desconocido (4.2GB).", "medium", "open", "Exfiltracion", "AWS-Gateway-01", "10.0.5.122", "Posible fuga de datos.", "Bloquear trafico saliente."),
            ("SQLi Detectado: E-Commerce API", "Payload detectable en query string: ' OR 1=1--", "medium", "closed", "Web", "SRV-WEB-PROD", "192.168.50.40", "Intento de bypass de login.", "Vulnerabilidad parcheada.")
        ]
        for title, desc, sev, status, cat, asset, ip, summary, rec in incidents:
            db.add(Ticket(title=title, description=desc, severity=sev, status=status, category=cat, affected_asset=asset, source_ip=ip, ai_summary=summary, ai_recommendation=rec, reporter_id=admin.id))

        await db.commit()
    print("PostgreSQL SUPER data populated.")

async def populate_opensearch():
    print("Populating OpenSearch with RICH mock alerts (Last 7 Days)...")
    now = datetime.now(timezone.utc)
    geo_data = {
        "45.33.32.156": {"country": "CN", "name": "China", "city": "Beijing", "lat": 39.9042, "lon": 116.4074},
        "91.108.4.0": {"country": "NL", "name": "Netherlands", "city": "Amsterdam", "lat": 52.3676, "lon": 4.9041},
        "185.220.101.12": {"country": "DE", "name": "Germany", "city": "Berlin", "lat": 52.5200, "lon": 13.4050},
        "192.168.1.50": {"country": "ES", "name": "Spain", "city": "Madrid", "lat": 40.4168, "lon": -3.7038},
        "82.165.1.1": {"country": "RU", "name": "Russia", "city": "Moscow", "lat": 55.7558, "lon": 37.6173}
    }
    ips = list(geo_data.keys())

    async with httpx.AsyncClient(auth=(OS_USER, OS_PASS), verify=False) as client:
        bulk_data = []
        
        # Cowrie / Honeypot (500 alerts)
        for _ in range(500):
            ip = random.choice(ips)
            geo = geo_data[ip]
            ts = (now - timedelta(minutes=random.randint(1, 10080))).strftime('%Y-%m-%dT%H:%M:%S.%fZ')
            doc = {
                "@timestamp": ts,
                "rule": {"id": "100001", "level": 10, "description": "Cowrie: Command Executed", "groups": ["cowrie", "honeypot"]},
                "decoder": {"name": "cowrie"},
                "data": {
                    "srcip": ip, "session": str(uuid.uuid4())[:8], "input": "cat /etc/shadow",
                    "geoip": {"country_code2": geo["country"], "country_name": geo["name"], "city_name": geo["city"], "latitude": geo["lat"], "longitude": geo["lon"]}
                }
            }
            bulk_data.append(json.dumps({"index": {"_index": INDEX_NAME}}))
            bulk_data.append(json.dumps(doc))

        # MITRE / Attacks (300 alerts)
        mitre_tactics = [("T1566", "Initial Access"), ("T1110", "Credential Access"), ("T1059", "Execution"), ("T1021", "Lateral Movement")]
        for _ in range(300):
            tech_id, tactic = random.choice(mitre_tactics)
            ip = random.choice(ips)
            ts = (now - timedelta(minutes=random.randint(1, 10080))).strftime('%Y-%m-%dT%H:%M:%S.%fZ')
            doc = {
                "@timestamp": ts,
                "rule": {
                    "id": str(random.randint(20000, 30000)), "level": random.choice([10, 12, 15]), 
                    "description": f"MITRE {tech_id} detected", "groups": ["mitre", "attack"],
                    "mitre": {"id": [tech_id], "tactic": [tactic]}
                },
                "agent": {"id": "002", "name": "SRV-APP-01"},
                "data": {"srcip": ip}
            }
            bulk_data.append(json.dumps({"index": {"_index": INDEX_NAME}}))
            bulk_data.append(json.dumps(doc))

        # Send to OpenSearch
        headers = {"Content-Type": "application/x-ndjson"}
        bulk_str = "\n".join(bulk_data) + "\n"
        r = await client.post(f"{OS_URL}/_bulk", content=bulk_str, headers=headers)
        print(f"Injected {len(bulk_data)//2} alerts.")

if __name__ == "__main__":
    asyncio.run(populate_postgres())
    asyncio.run(populate_opensearch())
