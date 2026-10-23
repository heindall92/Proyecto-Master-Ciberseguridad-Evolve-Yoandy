"""Claves de API por usuario (VirusTotal, AbuseIPDB), guardadas cifradas."""
from __future__ import annotations

from fastapi import HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crypto import decrypt_secret
from app.models import SystemSetting, User
from app.settings import settings


async def _resolve_vt_api_key(request: Request, db: AsyncSession, user: User) -> str:
    key = request.headers.get("X-VT-API-Key")
    if key and settings.env.lower() == "development":
        return key
    user_key = (
        await db.execute(
            select(SystemSetting).where(SystemSetting.key == f"vt_api_key_user_{user.id}")
        )
    ).scalar_one_or_none()
    if user_key:
        return decrypt_secret(user_key.value)
    global_key = (await db.execute(select(SystemSetting).where(SystemSetting.key == "vt_api_key"))).scalar_one_or_none()
    if global_key:
        return decrypt_secret(global_key.value)
    if settings.virustotal_api_key:
        return settings.virustotal_api_key
    raise HTTPException(404, "API Key de VirusTotal no configurada. Añádala en Threat Intel.")


async def _resolve_abuseipdb_api_key(request: Request, db: AsyncSession, user: User) -> str:
    header_key = request.headers.get("X-AbuseIPDB-API-Key")
    if header_key and settings.env.lower() == "development":
        return header_key
    user_key = (
        await db.execute(
            select(SystemSetting).where(SystemSetting.key == f"abuseipdb_api_key_user_{user.id}")
        )
    ).scalar_one_or_none()
    if user_key:
        return decrypt_secret(user_key.value)
    global_key = (await db.execute(select(SystemSetting).where(SystemSetting.key == "abuseipdb_api_key"))).scalar_one_or_none()
    if global_key:
        return decrypt_secret(global_key.value)
    if settings.abuseipdb_api_key:
        return settings.abuseipdb_api_key
    raise HTTPException(404, "API Key de AbuseIPDB no configurada. Añádela en Threat Intel.")
