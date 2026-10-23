"""Endpoints de sesión: login, refresh, logout e invitaciones (comprobar y activar)."""
from __future__ import annotations

import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import delete, desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import (
    TOKEN_TYPE_REFRESH,
    create_access_token_with_meta,
    create_refresh_token_with_meta,
    decode_token_payload,
    get_current_user,
    get_current_user_optional,
    get_password_hash,
    is_token_revoked,
    revoke_token_jti,
    revoke_tokens_from_request,
    set_auth_cookies,
    verify_password,
)
from app.client_info import is_https, real_ip
from app.db import get_db
from app.limits import limiter
from app.models import AuditLog, User, UserInvite
from app.realtime import _session_event
from app.schemas import InviteActivate, InviteToken, LoginRequest, Token, UserOut
from app.security import InputValidator, check_user_blocked, rate_limiter
from app.services.invites import _valid_invite
from app.settings import settings

router = APIRouter()


# AUTH
@router.post("/api/auth/login", response_model=Token)
@limiter.limit("5/minute")
async def login(request: Request, response: Response, req: LoginRequest, db: AsyncSession = Depends(get_db)):
    client_ip = real_ip(request.client.host if request.client else None, request.headers) or "unknown"

    # Validate and sanitize
    username = InputValidator.validate_username(req.username)
    InputValidator.validate_password(req.password)
    check_user_blocked(username)
    
    user = (await db.execute(select(User).where(User.username == username))).scalar_one_or_none()
    
    if not user or not verify_password(req.password, user.password_hash):
        rate_limiter.record_failed_login(req.username, client_ip)
        raise HTTPException(401, "Credenciales inválidas")
    
    rate_limiter.record_successful_login(username)
    # El AuditMiddleware lee request.state.user: así el login queda registrado a nombre del usuario.
    request.state.user = user
    access_token, _, _ = create_access_token_with_meta(user.username)
    refresh_token, _, _ = create_refresh_token_with_meta(user.username)
    csrf = request.cookies.get("csrf_token") or secrets.token_urlsafe(32)
    set_auth_cookies(response, access_token=access_token, refresh_token=refresh_token, csrf_token=csrf,
                     secure=is_https(request.client.host if request.client else None, request.headers))
    await _session_event("login", user, client_ip, request.headers.get("user-agent", ""), db)
    return Token(
        access_token=access_token,
        expires_in=settings.access_token_expire_minutes * 60,
    )


@router.post("/api/auth/refresh", response_model=Token)
@limiter.limit("30/minute")
async def refresh_session(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    raw = request.cookies.get("refresh_token")
    if not raw:
        raise HTTPException(401, "Refresh token no presente")
    payload = decode_token_payload(raw)
    if not payload or payload.get("typ") != TOKEN_TYPE_REFRESH:
        raise HTTPException(401, "Refresh token inválido")
    if await is_token_revoked(payload.get("jti"), db):
        raise HTTPException(401, "Sesión revocada")
    username = payload.get("sub")
    if not username:
        raise HTTPException(401, "Refresh token inválido")
    user = (await db.execute(select(User).where(User.username == username))).scalar_one_or_none()
    if not user:
        raise HTTPException(401, "Usuario no encontrado")

    exp = payload.get("exp")
    if isinstance(exp, (int, float)):
        expires_at = datetime.fromtimestamp(exp, tz=timezone.utc)
        await revoke_token_jti(payload.get("jti", ""), expires_at, db)

    access_token, _, _ = create_access_token_with_meta(user.username)
    refresh_token, _, refresh_exp = create_refresh_token_with_meta(user.username)
    csrf = request.cookies.get("csrf_token") or secrets.token_urlsafe(32)
    set_auth_cookies(response, access_token=access_token, refresh_token=refresh_token, csrf_token=csrf,
                     secure=is_https(request.client.host if request.client else None, request.headers))
    return Token(
        access_token=access_token,
        expires_in=settings.access_token_expire_minutes * 60,
    )


@router.post("/api/auth/logout")
async def logout(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_user_optional),
):
    await revoke_tokens_from_request(request, db)
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/api/auth")
    response.delete_cookie("csrf_token", path="/")
    return {"ok": True}


@router.get("/api/auth/me/session")
async def my_session(request: Request, current: User = Depends(get_current_user)):
    client_ip = real_ip(request.client.host if request.client else None, request.headers) or "unknown"
    return {
        "username": current.username,
        "ip": client_ip,
        "user_agent": request.headers.get("User-Agent", "unknown"),
        "expires_minutes": settings.access_token_expire_minutes,
    }


@router.post("/api/auth/invite/check")
@limiter.limit("20/minute")
async def invite_check(request: Request, req: InviteToken, db: AsyncSession = Depends(get_db)):
    """Público: ¿es válido este enlace? (POST para que el token no quede en logs ni en la auditoría)."""
    inv, u = await _valid_invite(db, req.token)
    return {"username": u.username, "role": u.role, "expires_at": inv.expires_at.isoformat()}


@router.post("/api/auth/invite/activate")
@limiter.limit("10/minute")
async def invite_activate(request: Request, req: InviteActivate, db: AsyncSession = Depends(get_db)):
    """Público: el invitado fija su contraseña. El enlace deja de servir en ese momento."""
    inv, u = await _valid_invite(db, req.token)
    InputValidator.validate_password(req.password)
    if u.username.lower() in req.password.lower():
        raise HTTPException(400, "La contraseña no puede contener el nombre de usuario")
    u.password_hash = get_password_hash(req.password)
    inv.used_at = datetime.now(timezone.utc)
    await db.execute(delete(UserInvite).where(UserInvite.user_id == u.id, UserInvite.id != inv.id, UserInvite.used_at.is_(None)))
    await db.commit()
    request.state.user = u  # auditoría a su nombre
    ip = real_ip(request.client.host if request.client else None, request.headers) or ""
    await _session_event("activated", u, ip, request.headers.get("user-agent", ""), db)
    return {"ok": True, "username": u.username}


@router.get("/api/auth/me", response_model=UserOut)
async def me(current_user: User = Depends(get_current_user)): return current_user


@router.get("/api/auth/me/activity")
async def my_activity(limit: int = 20, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    """Actividad auditada del propio usuario (el log global /api/audit es solo para admin)."""
    q = (
        select(AuditLog)
        .where(AuditLog.user_id == current.id)
        .order_by(desc(AuditLog.timestamp))
        .limit(max(1, min(limit, 100)))
    )
    rows = (await db.execute(q)).scalars().all()
    return [
        {"id": r.id, "method": r.action, "route": r.route, "ip": r.ip_address, "timestamp": r.timestamp.isoformat()}
        for r in rows
    ]
