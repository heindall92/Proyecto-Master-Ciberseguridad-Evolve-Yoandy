"""Fábrica de event loop para uvicorn.

En Windows, uvicorn usa por defecto ``ProactorEventLoop``, incompatible con
psycopg/SQLAlchemy async; el backend falla al iniciar (HTTP 500 vía proxy).

Uso: ``uvicorn app.main:app --loop app.uvicorn_loop:selector_loop_factory ...``
"""

from __future__ import annotations

import asyncio


def selector_loop_factory() -> asyncio.AbstractEventLoop:
    return asyncio.SelectorEventLoop()
