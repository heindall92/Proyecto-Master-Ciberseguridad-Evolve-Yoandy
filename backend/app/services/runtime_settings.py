"""Ajustes editables en caliente (umbrales de IA, etc.) con validación por clave."""
from __future__ import annotations

import re as _re

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import SessionLocal
from app.models import SystemSetting
from app.settings import settings

# SETTINGS
# Ajustes editables desde "Ajustes globales": clave -> validación. Cualquier otra clave se rechaza.
AI_LEVEL_THRESHOLDS = {"low": 3, "medium": 5, "high": 7, "critical": 12}


def _validate_setting(key: str, value: str) -> str:
    v = (value or "").strip()
    if key == "ollama_url":
        if not _re.match(r"^https?://[\w.\-]+(:\d{1,5})?/?$", v):
            raise HTTPException(422, "URL de Ollama no válida (http(s)://host:puerto)")
        return v.rstrip("/")
    if key == "ollama_model":
        if not _re.match(r"^[\w.\-/]+(:[\w.\-]+)?$", v):
            raise HTTPException(422, "Nombre de modelo no válido")
        return v
    if key == "ollama_temperature":
        try:
            f = float(v)
        except ValueError:
            raise HTTPException(422, "Temperatura no válida")
        if not 0 <= f <= 1:
            raise HTTPException(422, "La temperatura debe estar entre 0 y 1")
        return str(f)
    if key == "ollama_min_alert_level":
        if v not in AI_LEVEL_THRESHOLDS:
            raise HTTPException(422, "Nivel mínimo no válido")
        return v
    if key == "max_upload_mb":
        if not v.isdigit() or not 1 <= int(v) <= 50:
            raise HTTPException(422, "El límite de subida debe estar entre 1 y 50 MB")
        return v
    if key == "retention_days":
        if not v.isdigit() or not 7 <= int(v) <= 365:
            raise HTTPException(422, "La retención debe estar entre 7 y 365 días")
        return v
    if key in ("vt_api_key", "otx_api_key", "abuseipdb_api_key"):
        return v
    raise HTTPException(422, f"Ajuste no reconocido: {key}")


async def _get_setting(db: AsyncSession, key: str, default: str) -> str:
    row = (await db.execute(select(SystemSetting).where(SystemSetting.key == key))).scalar_one_or_none()
    return row.value if row and not row.is_sensitive and row.value else default


def _apply_ai_runtime(key: str, value: str) -> None:
    """Aplica al momento los ajustes de IA (el cliente de Ollama lee `settings`)."""
    if key == "ollama_url":
        settings.ollama_base_url = value
    elif key == "ollama_model":
        settings.ollama_model = value
    elif key == "ollama_temperature":
        settings.ollama_temperature = float(value)


async def _load_runtime_settings() -> None:
    async with SessionLocal() as db:
        for key in ("ollama_url", "ollama_model", "ollama_temperature"):
            val = await _get_setting(db, key, "")
            if val:
                _apply_ai_runtime(key, val)
