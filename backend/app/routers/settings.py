"""Endpoints de ajustes globales, ajustes de IA y registro de auditoría."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import opensearch_client as osc
from app.auth import get_current_user, require_admin
from app.crypto import encrypt_secret
from app.db import get_db
from app.logger import logger
from app.models import AuditLog, SystemSetting, User
from app.schemas import AiSettingsUpdate, SystemSettingIn, SystemSettingOut
from app.services.runtime_settings import _apply_ai_runtime, _validate_setting
from app.settings import settings

router = APIRouter()


@router.get("/api/settings", response_model=list[SystemSettingOut])
async def get_settings(db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    if current.role != "admin": raise HTTPException(403, "Forbidden")
    rows = (await db.execute(select(SystemSetting))).scalars().all()
    out = [SystemSettingOut(key=r.key, value="********" if r.is_sensitive else r.value, is_sensitive=r.is_sensitive, updated_at=r.updated_at) for r in rows]
    # Valores efectivos del .env para lo que no se ha personalizado (antes la UI mostraba valores inventados)
    effective = {
        "ollama_url": settings.ollama_base_url,
        "ollama_model": settings.ollama_model,
        "ollama_temperature": str(settings.ollama_temperature),
        "max_upload_mb": str(settings.max_upload_size_mb),
        "ollama_min_alert_level": "high",
        "retention_days": "",  # vacío = sin política: las alertas se conservan indefinidamente
    }
    stored = {r.key for r in rows}
    out += [SystemSettingOut(key=k, value=v, is_sensitive=False, source="env") for k, v in effective.items() if k not in stored]
    return out


@router.put("/api/settings")
async def update_settings(payload: list[SystemSettingIn], db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    if current.role != "admin": raise HTTPException(403, "Forbidden")
    applied: dict[str, str] = {}
    for s in payload:
        # Clave enmascarada o vacía: no sobrescribir el secreto guardado
        if s.is_sensitive and (s.value == "********" or not s.value.strip()): continue
        # Campo opcional vacío (p. ej. retención sin configurar): no se guarda
        if not s.is_sensitive and not s.value.strip() and s.key == "retention_days": continue
        value = _validate_setting(s.key, s.value)
        existing = (await db.execute(select(SystemSetting).where(SystemSetting.key == s.key))).scalar_one_or_none()
        if not s.is_sensitive and existing and existing.value == value:
            continue
        val = encrypt_secret(value) if s.is_sensitive else value
        if existing:
            existing.value = val; existing.is_sensitive = s.is_sensitive
        else:
            db.add(SystemSetting(key=s.key, value=val, is_sensitive=s.is_sensitive))
        applied[s.key] = "***" if s.is_sensitive else value
    await db.commit()

    for key, value in applied.items():
        _apply_ai_runtime(key, value)
    retention = None
    if "retention_days" in applied:
        try:
            retention = await osc.apply_retention_policy(int(applied["retention_days"]))
        except Exception as e:
            logger.warning(f"No se pudo aplicar la política de retención: {e}")
            raise HTTPException(502, "Ajustes guardados, pero el Wazuh Indexer no aceptó la política de retención")
    return {"status": "ok", "changed": sorted(applied), "retention": retention}


# AUDIT
@router.get("/api/audit")
async def list_audit(
    page: int = 1,
    size: int = 50,
    user: str | None = None,
    action: str | None = None,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
):
    if current.role != "admin":
        raise HTTPException(403)
    q = select(AuditLog).order_by(desc(AuditLog.timestamp))
    if user:
        q = q.where(AuditLog.username.ilike(f"%{user}%"))
    if action:
        q = q.where(AuditLog.action.ilike(f"%{action}%"))
    offset = max(0, (page - 1) * size)
    q = q.offset(offset).limit(min(size, 200))
    return (await db.execute(q)).scalars().all()


# SETTINGS
@router.get("/api/settings/ai")
async def get_ai_settings(db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    """Obtiene la configuracion de IA de la base de datos o env."""
    model = (await db.execute(select(SystemSetting).where(SystemSetting.key == "ollama_model"))).scalar_one_or_none()
    temp = (await db.execute(select(SystemSetting).where(SystemSetting.key == "ollama_temperature"))).scalar_one_or_none()
    
    return {
        "model": model.value if model else settings.ollama_model,
        "temperature": float(temp.value) if temp else settings.ollama_temperature
    }


@router.post("/api/settings/ai")
async def update_ai_settings(
    data: AiSettingsUpdate,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(require_admin),
):
    """Actualiza la configuracion de IA."""
    payload = data.model_dump(exclude_unset=True)
    for key, val in payload.items():
        s = (await db.execute(select(SystemSetting).where(SystemSetting.key == key))).scalar_one_or_none()
        if not s:
            s = SystemSetting(key=key, value=str(val))
            db.add(s)
        else:
            s.value = str(val)
    await db.commit()
    return {"status": "updated"}
