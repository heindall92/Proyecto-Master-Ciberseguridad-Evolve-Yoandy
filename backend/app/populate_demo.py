import asyncio
from datetime import datetime, timedelta, timezone
from sqlalchemy import select, delete
from app.db import SessionLocal
from app.models import Event, Alert, Ticket, AuditLog, Runbook, IOC, Monitor, User
import random

async def populate():
    async with SessionLocal() as db:
        try:
            print("Borrando datos antiguos (excepto usuarios)...")
            await db.execute(delete(Alert))
            await db.execute(delete(Event))
            await db.execute(delete(Ticket))
            await db.execute(delete(AuditLog))
            await db.execute(delete(Runbook))
            await db.execute(delete(IOC))
            await db.execute(delete(Monitor))
            await db.commit()

            result = await db.execute(select(User).where(User.username == "admin"))
            admin = result.scalar_one_or_none()
            if not admin:
                print("No admin user found. Creating dummy admin...")
                admin = User(username="admin", email="admin@valhalla.local", password_hash="dummy", role="admin")
                db.add(admin)
                await db.commit()
                await db.refresh(admin)

            now = datetime.now(timezone.utc)

            print("Creando Eventos y Alertas (SIEM)...")
            event_types = ["SSH Brute Force", "SQL Injection", "XSS Attempt", "Malware Download", "Port Scan"]
            ips = ["192.168.1.100", "8.8.8.8", "45.33.32.156", "10.0.0.5", "114.114.114.114"]
            severities = ["low", "medium", "high", "critical"]
            
            events = []
            for i in range(30):
                event_time = now - timedelta(hours=random.randint(0, 48), minutes=random.randint(0, 60))
                e = Event(
                    timestamp=event_time,
                    source_ip=random.choice(ips),
                    attack_type=random.choice(event_types),
                    payload={"user": "root", "password": "123"},
                    raw_log={"message": f"Detected {random.choice(event_types)}"}
                )
                db.add(e)
                events.append(e)
            await db.commit()
            
            for e in events:
                await db.refresh(e)

            for e in events:
                a = Alert(
                    event_id=e.id,
                    severity=random.choice(severities),
                    rule_id=f"{random.randint(1000, 9999)}",
                    description=f"Wazuh Alert: {e.attack_type}",
                    timestamp=e.timestamp,
                    raw_alert={"rule": {"description": e.attack_type, "level": random.randint(1, 15)}}
                )
                db.add(a)
            await db.commit()

            print("Creando Tickets (Incidentes y Workspace)...")
            statuses = ["open", "investigating", "mitigating", "resolved", "closed"]
            for i in range(15):
                t = Ticket(
                    title=f"Incidente #{i+1} - {random.choice(event_types)}",
                    description="Se ha detectado una actividad anómala en la red que coincide con un patrón conocido.",
                    severity=random.choice(severities),
                    status=random.choice(statuses),
                    category="Intrusion",
                    source_ip=random.choice(ips),
                    affected_asset="Server-Win-01" if random.random() > 0.5 else "Ubuntu-Web-01",
                    ai_summary="El modelo de IA detectó que se trata de un escaneo seguido de intento de login.",
                    ai_recommendation="Bloquear la IP en el firewall perimetral y rotar contraseñas.",
                    mitre_technique="T1110 - Brute Force",
                    assigned_to_id=admin.id if random.random() > 0.5 else None,
                    reporter_id=admin.id
                )
                db.add(t)
            await db.commit()

            print("Creando Runbooks...")
            runbooks = [
                Runbook(name="Ransomware Response", category="Malware", description="Procedimiento estándar para aislar y contener ransomware.", severity_applicable="critical", created_by_id=admin.id),
                Runbook(name="Phishing Investigation", category="Phishing", description="Análisis de correos sospechosos y extracción de IOCs.", severity_applicable="medium", created_by_id=admin.id),
                Runbook(name="SSH Brute Force Mitigation", category="Intrusion", description="Bloqueo de IPs agresivas atacando el puerto 22.", severity_applicable="high", created_by_id=admin.id)
            ]
            for r in runbooks:
                r.identification_steps = [{"step": "Check logs", "command": "grep 'Failed password' /var/log/auth.log"}]
                r.containment_steps = [{"step": "Block IP", "command": "iptables -A INPUT -s {IP} -j DROP"}]
                db.add(r)
            await db.commit()

            print("Creando Monitores...")
            monitors = [
                Monitor(name="Detección de Mimikatz", description="Alerta si se detecta mimikatz.exe", enabled=True, threshold=1, severity_floor="critical", rule_id_pattern="*mimikatz*"),
                Monitor(name="Múltiples Fallos de Login", description="Más de 5 fallos en 1 minuto", enabled=True, threshold=5, severity_floor="high", rule_id_pattern="*5710*")
            ]
            db.add_all(monitors)
            await db.commit()

            print("Creando Logs de Auditoría...")
            actions = ["LOGIN", "UPDATE_TICKET", "CREATE_USER", "DELETE_MONITOR", "LOGOUT"]
            routes = ["/api/auth/login", "/api/tickets/1", "/api/users", "/api/monitors/2", "/api/auth/logout"]
            for i in range(20):
                audit = AuditLog(
                    user_id=admin.id,
                    username=admin.username,
                    action=random.choice(actions),
                    route=random.choice(routes),
                    ip_address="192.168.1.50",
                    timestamp=now - timedelta(hours=random.randint(0, 24))
                )
                db.add(audit)
            await db.commit()

            print("Creando IOCs (Threat Intel)...")
            iocs = [
                IOC(value="45.33.32.156", ioc_type="ip", malicious_score=85, total_engines=90, country="Russia", status="watchlist"),
                IOC(value="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", ioc_type="hash", malicious_score=99, total_engines=90, status="blocked"),
                IOC(value="evil-domain-phishing.com", ioc_type="domain", malicious_score=40, total_engines=90, status="watchlist")
            ]
            db.add_all(iocs)
            await db.commit()

            print("¡Datos de prueba generados exitosamente en la base de datos!")

        except Exception as e:
            print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(populate())
