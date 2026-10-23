"""Invitaciones de un solo uso: caducidad, hash del enlace y revocación (también en Tailscale)."""
from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app import tailscale as ts
from app.models import User, UserInvite

# --- INVITACIONES (acceso de nuevos usuarios, p. ej. desde el móvil por la VPN) ---
INVITE_TTL = timedelta(hours=24)


def _aware(dt: datetime | None) -> datetime | None:
    """Fechas sin zona horaria (p. ej. SQLite) se interpretan como UTC para poder compararlas."""
    return dt.replace(tzinfo=timezone.utc) if dt is not None and dt.tzinfo is None else dt


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def _pending_invites(db: AsyncSession, user_id: int) -> list[UserInvite]:
    return list((await db.execute(select(UserInvite).where(UserInvite.user_id == user_id, UserInvite.used_at.is_(None)))).scalars())


async def _drop_invites(db: AsyncSession, invites: list[UserInvite]) -> None:
    for inv in invites:
        if inv.ts_invite_id:
            st = await ts.invite_status(inv.ts_invite_id)
            if not (st and st["accepted"]):
                await ts.revoke_invite(inv.ts_invite_id)
        await db.delete(inv)


async def _valid_invite(db: AsyncSession, token: str) -> tuple[UserInvite, User]:
    inv = (await db.execute(select(UserInvite).where(UserInvite.token_hash == _token_hash(token)))).scalar_one_or_none()
    if not inv or inv.used_at or _aware(inv.expires_at) < datetime.now(timezone.utc):
        raise HTTPException(410, "El enlace de invitación no es válido, ya se usó o ha caducado. Pide uno nuevo al administrador.")
    u = (await db.execute(select(User).where(User.id == inv.user_id))).scalar_one()
    return inv, u
