import uuid

import jwt
import bcrypt
from datetime import datetime, timedelta, timezone
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from app.db import get_db
from app.models import User, RevokedToken
from app.settings import settings

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

TOKEN_TYPE_ACCESS = "access"
TOKEN_TYPE_REFRESH = "refresh"


def verify_password(plain_password: str, hashed_password: str):
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))


def get_password_hash(password: str):
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _encode_token(username: str, token_type: str, expire_minutes: int) -> tuple[str, str, datetime]:
    jti = uuid.uuid4().hex
    exp = datetime.now(timezone.utc) + timedelta(minutes=expire_minutes)
    payload = {
        "sub": username,
        "jti": jti,
        "typ": token_type,
        "exp": exp,
    }
    encoded = jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)
    return encoded, jti, exp


def create_access_token(data: dict) -> str:
    """Compatibilidad: solo access token (con jti para revocación)."""
    token, _, _ = create_access_token_with_meta(data["sub"])
    return token


def create_access_token_with_meta(username: str) -> tuple[str, str, datetime]:
    return _encode_token(username, TOKEN_TYPE_ACCESS, settings.access_token_expire_minutes)


def create_refresh_token_with_meta(username: str) -> tuple[str, str, datetime]:
    return _encode_token(username, TOKEN_TYPE_REFRESH, settings.refresh_token_expire_minutes)


def decode_token_payload(token: str, *, verify_exp: bool = True) -> dict | None:
    if not token:
        return None
    try:
        options = {} if verify_exp else {"verify_exp": False}
        return jwt.decode(
            token,
            settings.secret_key,
            algorithms=[settings.algorithm],
            options=options,
        )
    except jwt.PyJWTError:
        return None


def decode_token_username(token: str) -> str | None:
    payload = decode_token_payload(token)
    if not payload:
        return None
    return payload.get("sub")


async def is_token_revoked(jti: str | None, db: AsyncSession) -> bool:
    if not jti:
        return True
    row = (await db.execute(select(RevokedToken).where(RevokedToken.jti == jti))).scalar_one_or_none()
    return row is not None


async def revoke_token_jti(jti: str, expires_at: datetime, db: AsyncSession) -> None:
    if not jti:
        return
    existing = (await db.execute(select(RevokedToken).where(RevokedToken.jti == jti))).scalar_one_or_none()
    if not existing:
        db.add(RevokedToken(jti=jti, expires_at=expires_at))
        await db.commit()


async def purge_expired_revoked_tokens(db: AsyncSession) -> None:
    now = datetime.now(timezone.utc)
    await db.execute(delete(RevokedToken).where(RevokedToken.expires_at < now))
    await db.commit()


async def validate_access_token(token: str, db: AsyncSession) -> dict:
    payload = decode_token_payload(token)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")
    if payload.get("typ", TOKEN_TYPE_ACCESS) != TOKEN_TYPE_ACCESS:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Tipo de token inválido")
    if await is_token_revoked(payload.get("jti"), db):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sesión revocada")
    return payload


async def get_user_from_token(token: str, db: AsyncSession) -> User | None:
    payload = decode_token_payload(token)
    if not payload:
        return None
    if payload.get("typ", TOKEN_TYPE_ACCESS) != TOKEN_TYPE_ACCESS:
        return None
    if await is_token_revoked(payload.get("jti"), db):
        return None
    username = payload.get("sub")
    if not username:
        return None
    return (await db.execute(select(User).where(User.username == username))).scalar_one_or_none()


async def get_current_user(request: Request, db: AsyncSession = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No se pudo validar el token",
        headers={"WWW-Authenticate": "Bearer"},
    )

    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]

    if not token:
        raise credentials_exception

    try:
        payload = await validate_access_token(token, db)
        username: str = payload.get("sub")
        if not username:
            raise credentials_exception
    except HTTPException:
        raise credentials_exception

    user = (await db.execute(select(User).where(User.username == username))).scalar_one_or_none()
    if user is None:
        raise credentials_exception
    request.state.user = user
    return user


async def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return current_user


async def get_current_user_optional(request: Request, db: AsyncSession = Depends(get_db)):
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]

    if not token:
        return None
    try:
        payload = await validate_access_token(token, db)
        username: str = payload.get("sub")
        if not username:
            return None

        user = (await db.execute(select(User).where(User.username == username))).scalar_one_or_none()
        if user:
            request.state.user = user
        return user
    except HTTPException:
        return None


def require_role(role: str):
    async def role_checker(current_user: User = Depends(get_current_user)):
        if current_user.role.lower() != role.lower() and current_user.role.lower() != "admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permiso denegado: se requiere rol {role}",
            )
        return current_user

    return role_checker


def set_auth_cookies(
    response,
    *,
    access_token: str,
    refresh_token: str,
    csrf_token: str,
    secure: bool = False,
) -> None:
    # Secure si el navegador llegó por HTTPS (o si la configuración lo exige siempre)
    secure = secure or settings.session_cookie_secure
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=secure,
        samesite=settings.session_cookie_samesite,
        max_age=settings.access_token_expire_minutes * 60,
        path="/",
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=secure,
        samesite=settings.session_cookie_samesite,
        max_age=settings.refresh_token_expire_minutes * 60,
        path="/api/auth",
    )
    response.set_cookie(
        key="csrf_token",
        value=csrf_token,
        httponly=False,
        secure=secure,
        samesite=settings.session_cookie_samesite,
        path="/",
    )


async def revoke_tokens_from_request(request: Request, db: AsyncSession) -> None:
    for name in ("access_token", "refresh_token"):
        raw = request.cookies.get(name)
        if not raw:
            continue
        payload = decode_token_payload(raw, verify_exp=False)
        if not payload:
            continue
        exp = payload.get("exp")
        if isinstance(exp, (int, float)):
            expires_at = datetime.fromtimestamp(exp, tz=timezone.utc)
        else:
            expires_at = datetime.now(timezone.utc) + timedelta(days=1)
        await revoke_token_jti(payload.get("jti", ""), expires_at, db)
