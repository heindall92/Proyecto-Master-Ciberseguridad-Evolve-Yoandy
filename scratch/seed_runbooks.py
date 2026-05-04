import asyncio
import sys
import os

sys.path.insert(0, os.path.abspath("backend"))

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select
from app.models import Runbook
from app.db import DATABASE_URL

import platform
if platform.system() == 'Windows':
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

engine = create_async_engine(DATABASE_URL)
SessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

DEFAULT_RUNBOOKS = [
    {
        "name": "Intrusion Detection",
        "description": "Procedimiento estándar para investigar y contener intrusiones en la red.",
        "steps": [
            "Aislar el activo de la red corporativa.",
            "Capturar dump de memoria y logs de red.",
            "Bloquear IP del atacante en el firewall."
        ],
        "tags": ["intrusion", "network", "critical"]
    },
    {
        "name": "Malware Containment",
        "description": "Pasos para contener la propagación de malware en endpoints.",
        "steps": [
            "Desconectar el host afectado.",
            "Realizar escaneo profundo con Wazuh e identificar IOCs.",
            "Enviar muestras a VirusTotal y Cuckoo Sandbox."
        ],
        "tags": ["malware", "endpoint"]
    },
    {
        "name": "Phishing Response",
        "description": "Respuesta rápida ante correos de phishing confirmados.",
        "steps": [
            "Purgar el correo de todas las bandejas (Exchange/O365).",
            "Bloquear URLs maliciosas en el proxy web.",
            "Resetear credenciales de los usuarios que hicieron clic."
        ],
        "tags": ["phishing", "email"]
    },
    {
        "name": "Ransomware Playbook",
        "description": "Respuesta crítica ante encriptación de datos.",
        "steps": [
            "Apagar inmediatamente los equipos afectados.",
            "Aislar servidores de backup.",
            "Notificar a dirección y equipo legal.",
            "Iniciar análisis forense en equipos congelados."
        ],
        "tags": ["ransomware", "critical"]
    }
]

async def seed():
    async with SessionLocal() as db:
        existing = (await db.execute(select(Runbook))).scalars().all()
        if not existing:
            for rb in DEFAULT_RUNBOOKS:
                db.add(Runbook(**rb))
            await db.commit()
            print("Runbooks seeded!")
        else:
            print("Runbooks already exist.")

if __name__ == '__main__':
    asyncio.run(seed())
