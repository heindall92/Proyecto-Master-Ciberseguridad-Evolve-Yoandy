"""Preparación previa a servir peticiones: esquema, ajustes, usuarios de sistema y datos semilla."""
from __future__ import annotations

import secrets

from sqlalchemy import select

from app.auth import get_password_hash, purge_expired_revoked_tokens
from app.db import SessionLocal, engine
from app.logger import logger
from app.migrations import _migrate_added_columns, _migrate_tickets_resolved_at, _migrate_users_rank_column
from app.models import Base, Monitor, User
from app.runbooks_seed import seed_runbooks_if_empty
from app.security import InputValidator
from app.services.incidents import _auto_sync_loop
from app.services.runtime_settings import _load_runtime_settings
from app.services.tasks import _spawn
from app.settings import settings


async def _startup() -> None:
    """Preparación previa a servir peticiones (la invoca `lifespan`)."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(_migrate_users_rank_column)
        await conn.run_sync(_migrate_tickets_resolved_at)
        await conn.run_sync(_migrate_added_columns)
    await _load_runtime_settings()
    
    # Bootstrap admin solo si ADMIN_PASSWORD está definido (nunca hardcodeado)
    async with SessionLocal() as db:
        if not (await db.execute(select(User).where(User.username == "admin"))).scalar_one_or_none():
            if settings.admin_password:
                InputValidator.validate_password(settings.admin_password)
                db.add(User(
                    username="admin",
                    password_hash=get_password_hash(settings.admin_password),
                    role="admin",
                    security_rank="Commander",
                ))
                logger.info("Usuario admin creado desde ADMIN_PASSWORD")
            elif settings.env.lower() == "production":
                raise RuntimeError(
                    "CRITICAL: No existe usuario admin y ADMIN_PASSWORD vacío con ENV=production."
                )
            else:
                logger.warning(
                    "Sin usuario admin y ADMIN_PASSWORD vacío — cree un admin con scripts/reset_admin.py"
                )
        
        # Usuario de sistema para el asistente IA del chat (VALHALLA-IA)
        if not (await db.execute(select(User).where(User.username == "valhalla-ia"))).scalar_one_or_none():
            db.add(User(
                username="valhalla-ia",
                password_hash=get_password_hash(secrets.token_urlsafe(32)),
                role="viewer",
                security_rank="AI",
            ))
            logger.info("Usuario de sistema VALHALLA-IA creado")

        if not (await db.execute(select(Monitor))).scalars().first():
            defaults = [
                ("SSH Bruteforce", "Intentos masivos SSH — reglas 5710/5712", 5, "high", "5710,5712"),
                ("Cowrie Honeypot", "Eventos en señuelo Cowrie", 10, "medium", "cowrie"),
                ("Web Attack", "Inyección SQL/XSS en aplicaciones", 1, "high", "31103,31106"),
                ("Privilege Escalation", "Escalada de privilegios", 3, "critical", "550,551"),
                ("Malware Detection", "Ejecutables o scripts sospechosos", 1, "critical", "554,750"),
            ]
            for name, desc, thr, sev, pat in defaults:
                db.add(Monitor(
                    name=name, description=desc, threshold=thr,
                    severity_floor=sev, rule_id_pattern=pat, enabled=True,
                ))
        await seed_runbooks_if_empty(db)
        await purge_expired_revoked_tokens(db)
        await db.commit()
    
    if settings.auto_sync_wazuh_tickets:
        _spawn(_auto_sync_loop(), loop=True)
    logger.info("Valhalla SOC API Started")
