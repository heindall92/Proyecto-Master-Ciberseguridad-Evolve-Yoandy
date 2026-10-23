"""Endpoints de usuarios, equipo, avatares e invitaciones (administración)."""
from __future__ import annotations

import os
import secrets
import shutil
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import tailscale as ts
from app.auth import get_current_user, get_password_hash, require_admin, verify_password
from app.client_info import network_of
from app.db import get_db
from app.models import User, UserInvite
from app.schemas import InviteCreate, PasswordReset, UserCreate, UserOut, UserUpdate
from app.security import InputValidator
from app.services.files import ALLOWED_AVATAR_EXT
from app.services.invites import INVITE_TTL, _aware, _drop_invites, _pending_invites, _token_hash

router = APIRouter()


@router.get("/api/users", response_model=list[UserOut])
async def list_users_ep(db: AsyncSession = Depends(get_db), current: User = Depends(require_admin)):
    rows = (await db.execute(select(User))).scalars().all()
    return rows


@router.get("/api/team")
async def team_directory(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """Directorio del equipo para el chat y las asignaciones: cualquier usuario con sesión.

    Antes el chat usaba /api/users (solo admin): un analista o un lector veía la lista de
    contactos vacía. Aquí solo datos de presentación; email y vinculación VPN siguen siendo de admin.
    """
    rows = (await db.execute(select(User).order_by(User.username))).scalars().all()
    return [{"id": u.id, "username": u.username, "role": u.role, "security_rank": u.security_rank,
             "avatar_url": u.avatar_url} for u in rows]


# Roles que entiende el control de acceso (antes el rol era texto libre)
VALID_ROLES = {"admin", "analista", "analyst", "reporter", "viewer"}


SYSTEM_USERS = {"valhalla-ia"}


def _check_role(role: str) -> str:
    r = (role or "").strip().lower()
    if r not in VALID_ROLES:
        raise HTTPException(422, f"Rol no válido. Permitidos: {', '.join(sorted(VALID_ROLES))}")
    return r


async def _admins_left(db: AsyncSession, excluding: int) -> int:
    return (await db.execute(select(func.count(User.id)).where(User.role == "admin", User.id != excluding))).scalar() or 0


@router.post("/api/users", response_model=UserOut)
async def create_user_ep(req: UserCreate, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    if current.role != "admin": raise HTTPException(403, "Forbidden")
    # Antes no se aplicaba la política de contraseñas ni se validaban usuario, email ni rol al crear
    username = InputValidator.validate_username(req.username)
    if req.password:
        InputValidator.validate_password(req.password)
    email = InputValidator.validate_email(req.email)
    role = _check_role(req.role)
    existing = (await db.execute(select(User).where(User.username == username))).scalar_one_or_none()
    if existing: raise HTTPException(409, "Ya existe un usuario con ese nombre")

    new_user = User(
        username=username,
        email=email,
        # Sin contraseña: una aleatoria que nadie conoce hasta que active su invitación
        password_hash=get_password_hash(req.password or secrets.token_urlsafe(32)),
        role=role,
        security_rank=(req.security_rank or "")[:64] or "L1 Analyst",
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    return new_user


@router.put("/api/users/{user_id}", response_model=UserOut)
async def update_user_ep(user_id: int, req: UserUpdate, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    if current.role != "admin" and current.id != user_id: raise HTTPException(403, "Forbidden")
    u = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not u: raise HTTPException(404, "User not found")
    
    is_admin = current.role == "admin"

    # Identidad y privilegios: solo un administrador puede cambiarlos.
    if (req.username or req.role or req.security_rank) and not is_admin:
        raise HTTPException(403, "Solo un administrador puede cambiar usuario, rol o rango")
    if req.username: u.username = InputValidator.validate_username(req.username)
    if req.role:
        new_role = _check_role(req.role)
        # No dejar la plataforma sin ningún administrador
        if u.role == "admin" and new_role != "admin" and await _admins_left(db, u.id) == 0:
            raise HTTPException(409, "No se puede quitar el rol de administrador al último administrador")
        u.role = new_role
    if req.security_rank: u.security_rank = req.security_rank
    if req.email: u.email = InputValidator.validate_email(req.email)

    # El avatar solo puede quitarse ("") o apuntar a una imagen subida al propio servidor.
    if req.avatar_url is not None:
        if req.avatar_url and not req.avatar_url.startswith("/api/avatars/"):
            raise HTTPException(400, "avatar_url no permitido")
        u.avatar_url = req.avatar_url

    if req.password:
        InputValidator.validate_password(req.password)
        # Cambio de la propia contraseña: exige la actual (evita secuestro con una sesión abierta).
        if current.id == u.id and not (req.current_password and verify_password(req.current_password, u.password_hash)):
            raise HTTPException(400, "La contraseña actual no es correcta")
        u.password_hash = get_password_hash(req.password)

    await db.commit()
    return u


@router.post("/api/users/me/avatar")
async def upload_my_avatar(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user)
):
    upload_dir = os.path.abspath("uploads/avatars")
    os.makedirs(upload_dir, exist_ok=True)
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_AVATAR_EXT:
        raise HTTPException(400, f"Extensión no permitida. Use: {', '.join(sorted(ALLOWED_AVATAR_EXT))}")
    header = await file.read(2048)
    try:
        import magic

        mime = magic.from_buffer(header, mime=True) or ""
        if not mime.startswith("image/"):
            raise HTTPException(400, "El archivo no es una imagen válida")
    except ImportError:
        pass
    filename = f"avatar_{current.id}{ext}"
    file_path = os.path.join(upload_dir, filename)
    real_path = os.path.realpath(file_path)
    if not real_path.startswith(upload_dir):
        raise HTTPException(400, "Ruta de archivo inválida")

    with open(real_path, "wb") as buffer:
        buffer.write(header)
        shutil.copyfileobj(file.file, buffer)
    
    current.avatar_url = f"/api/avatars/{filename}"
    await db.commit()
    return {"avatar_url": current.avatar_url}


@router.get("/api/avatars/{filename}")
async def get_avatar_file(filename: str, current: User = Depends(get_current_user)):
    safe_name = os.path.basename(filename)
    upload_dir = os.path.abspath("uploads/avatars")
    path = os.path.realpath(os.path.join(upload_dir, safe_name))
    if not path.startswith(upload_dir) or not os.path.isfile(path):
        raise HTTPException(404)
    return FileResponse(path)


@router.delete("/api/users/{user_id}")
async def delete_user_ep(user_id: int, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    if current.role != "admin": raise HTTPException(403, "Forbidden")
    u = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not u: raise HTTPException(404, "User not found")
    if u.id == current.id:
        raise HTTPException(409, "No puedes eliminar tu propio usuario")
    if u.username.lower() in SYSTEM_USERS:
        raise HTTPException(409, "Es un usuario de sistema (asistente IA del chat) y no se puede eliminar")
    if u.role == "admin" and await _admins_left(db, u.id) == 0:
        raise HTTPException(409, "No se puede eliminar al último administrador")
    await db.delete(u)
    await db.commit()
    return {"ok": True}


@router.post("/api/users/{user_id}/reset-password")
async def reset_password_ep(user_id: int, req: PasswordReset, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    if current.role != "admin": raise HTTPException(403, "Forbidden")
    u = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not u: raise HTTPException(404, "User not found")
    InputValidator.validate_password(req.new_password)
    u.password_hash = get_password_hash(req.new_password)
    await db.commit()
    return {"ok": True}


@router.post("/api/users/{user_id}/invite")
async def create_invite(user_id: int, req: InviteCreate, request: Request, db: AsyncSession = Depends(get_db), current: User = Depends(require_admin)):
    """Genera el enlace de activación (un solo uso, 24 h) y, si se pide, el de Tailscale.

    El token en claro solo aparece en esta respuesta; en la base de datos se guarda su hash.
    Generar una invitación nueva anula las anteriores de ese usuario.
    """
    u = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not u: raise HTTPException(404, "User not found")
    if u.username.lower() in SYSTEM_USERS:
        raise HTTPException(409, "Es un usuario de sistema y no se puede invitar")
    await _drop_invites(db, await _pending_invites(db, u.id))
    token = secrets.token_urlsafe(32)
    ts_id = ts_url = ts_err = None
    if req.tailscale:
        ts_id, ts_url, ts_err = await ts.create_share_invite()
    expires = datetime.now(timezone.utc) + INVITE_TTL
    db.add(UserInvite(user_id=u.id, token_hash=_token_hash(token), created_by_id=current.id, expires_at=expires, ts_invite_id=ts_id))
    await db.commit()
    base = await ts.public_url() or (request.headers.get("origin") or "").rstrip("/")
    host = base.split("://")[-1].split(":")[0]
    return {
        "username": u.username, "role": u.role, "valhalla_url": base,
        "activation_url": f"{base}/activar#{token}",  # el token va en el fragmento: no llega a logs ni a Referer
        "vpn": network_of(host).startswith("VPN"),
        "tailscale_url": ts_url, "tailscale_error": ts_err,
        "expires_at": expires.isoformat(),
    }


@router.get("/api/users/{user_id}/invite")
async def invite_state(user_id: int, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    """Estado de la última invitación y de la de Tailscale (si se aceptó, se vincula esa cuenta)."""
    u = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not u: raise HTTPException(404, "User not found")
    inv = (await db.execute(select(UserInvite).where(UserInvite.user_id == user_id).order_by(desc(UserInvite.created_at)).limit(1))).scalar_one_or_none()
    if not inv:
        return {"status": None, "tailscale_login": u.tailscale_login}
    now = datetime.now(timezone.utc)
    st = await ts.invite_status(inv.ts_invite_id) if inv.ts_invite_id else None
    if st and st["accepted"] and st["login"] and not u.tailscale_login:
        u.tailscale_login = st["login"][:128]
        await db.commit()
    return {
        "status": "used" if inv.used_at else "expired" if _aware(inv.expires_at) < now else "pending",
        "created_at": inv.created_at.isoformat(), "expires_at": inv.expires_at.isoformat(),
        "used_at": inv.used_at.isoformat() if inv.used_at else None,
        "tailscale": st, "tailscale_login": u.tailscale_login,
    }


@router.delete("/api/users/{user_id}/invite")
async def revoke_invite_ep(user_id: int, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    pending = await _pending_invites(db, user_id)
    await _drop_invites(db, pending)
    await db.commit()
    return {"ok": True, "revoked": len(pending)}


@router.get("/api/invites/pending")
async def pending_invites(db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    now = datetime.now(timezone.utc)
    rows = (await db.execute(select(UserInvite).where(UserInvite.used_at.is_(None), UserInvite.expires_at > now))).scalars().all()
    return [{"user_id": r.user_id, "expires_at": r.expires_at.isoformat()} for r in rows]


@router.delete("/api/users/{user_id}/tailscale")
async def unlink_tailscale(user_id: int, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    """Desvincula la cuenta de Tailscale (p. ej. cambió de móvil); el próximo acceso por VPN la vuelve a vincular."""
    u = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not u: raise HTTPException(404, "User not found")
    u.tailscale_login = None
    await db.commit()
    return {"ok": True}
