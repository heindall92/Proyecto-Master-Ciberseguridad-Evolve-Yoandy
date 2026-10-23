"""Limitador de peticiones por IP real (slowapi), compartido por los routers."""
from __future__ import annotations

from fastapi import Request
from slowapi import Limiter

from app.client_info import real_ip


def _limiter_key(request: Request) -> str:
    # Por IP real: con la del proxy todos los usuarios compartían el mismo cupo (p. ej. 5 logins/min)
    return real_ip(request.client.host if request.client else None, request.headers) or "unknown"


limiter = Limiter(key_func=_limiter_key)
