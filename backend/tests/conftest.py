"""Configuración común de la suite: BD aislada, usuarios por rol, servicios externos simulados
y generación de la matriz de trazabilidad (docs/TRAZABILIDAD.md).

Las pruebas nunca tocan la base de datos real ni Wazuh/OpenSearch/Ollama/Tailscale: la BD
es SQLite en memoria y los clientes externos se sustituyen por dobles.

Matriz: `TRACE_MATRIX=../docs/TRAZABILIDAD.md python -m pytest` (ver scripts/run_tests.sh).
"""
from __future__ import annotations

import asyncio
import os
import re
import sys
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.dialects.postgresql import INET
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.pool import StaticPool

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())


@compiles(INET, "sqlite")
def _inet_sqlite(_type, _compiler, **_kw):  # INET es de PostgreSQL; en SQLite basta texto
    return "VARCHAR(45)"


import app.main as main  # noqa: E402
from app.auth import create_access_token_with_meta, get_password_hash  # noqa: E402
from app.db import get_db  # noqa: E402
from app.models import Base, User  # noqa: E402
from app.security import rate_limiter  # noqa: E402
from app.settings import settings  # noqa: E402

settings.webhook_secret = "test-webhook-secret"
main.limiter.enabled = False  # el límite de 5 logins/min no aplica a la suite

engine = create_async_engine("sqlite+aiosqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False})
TestSessionLocal = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)


async def _override_get_db():
    async with TestSessionLocal() as session:
        yield session


main.app.dependency_overrides[get_db] = _override_get_db
main.SessionLocal = TestSessionLocal  # auditoría y tareas que abren su propia sesión

PASSWORD = "TestPass123!"
USERS = {  # username -> rol
    "admin": "admin",
    "analista": "analista",
    "lector": "viewer",
    "reportero": "reporter",
    "valhalla-ia": "viewer",
}


@pytest_asyncio.fixture(autouse=True)
async def db():
    """Tablas nuevas y usuarios de cada rol en cada prueba."""
    rate_limiter.requests.clear()
    rate_limiter.blocked_ips.clear()
    rate_limiter.failed_logins.clear()
    rate_limiter.blocked_users.clear()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    pw = get_password_hash(PASSWORD)
    async with TestSessionLocal() as s:
        for name, role in USERS.items():
            s.add(User(username=name, password_hash=pw, role=role, email=f"{name}@valhalla.test"))
        await s.commit()
    yield TestSessionLocal
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.fixture(autouse=True)
def external_services(monkeypatch):
    """Dobles de Wazuh, OpenSearch, Tailscale y el catálogo ATT&CK."""
    async def _none(*_a, **_k):
        return None

    async def _empty_dict(*_a, **_k):
        return {}

    monkeypatch.setattr(main.ts, "whois", _none)
    monkeypatch.setattr(main.osc, "get_mitre_coverage", _empty_dict)
    monkeypatch.setattr(main.osc, "get_dashboard_stats", _empty_dict)
    monkeypatch.setattr(main.grc_builder, "attack_coverage", _none)


@asynccontextmanager
async def client_as(username: str | None = None):
    """Cliente HTTP autenticado como `username` (token firmado, sin pasar por el login)
    y con el par CSRF double-submit que exige SecurityMiddleware."""
    headers = {"X-CSRF-Token": "csrf-test"}
    if username:
        token, _, _ = create_access_token_with_meta(username)
        headers["Authorization"] = f"Bearer {token}"
    async with AsyncClient(transport=ASGITransport(app=main.app), base_url="http://test",
                           headers=headers, cookies={"csrf_token": "csrf-test"}) as ac:
        yield ac


def uid(name: str) -> int:
    return list(USERS).index(name) + 1


def now() -> datetime:
    return datetime.now(timezone.utc)


# ─────────────────────────── Matriz de trazabilidad ───────────────────────────

def pytest_configure(config):
    config.addinivalue_line("markers", "req(*ids): requisitos (RF-xx / RNF-xx) que verifica la prueba")
    config._valhalla_results = {}


def pytest_runtest_logreport(report):
    results = getattr(pytest_runtest_logreport, "_results", None)
    if results is None:
        return
    if report.when == "call" or (report.when == "setup" and report.outcome != "passed"):
        results[report.nodeid] = report.outcome


def pytest_collection_modifyitems(session, config, items):
    config._valhalla_reqs = {}
    for item in items:
        for m in item.iter_markers("req"):
            for rid in m.args:
                config._valhalla_reqs.setdefault(rid, []).append(item.nodeid)
    pytest_runtest_logreport._results = config._valhalla_results


def _requirements(path: Path) -> list[tuple[str, str, str]]:
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        m = re.match(r"\|\s*(R(?:N)?F-\d+)\s*\|\s*([^|]+)\|[^|]*\|\s*([^|]+)\|", line)
        if m:
            rows.append((m.group(1), m.group(2).strip(), m.group(3).strip()))
    return rows


def pytest_sessionfinish(session, exitstatus):
    out = os.getenv("TRACE_MATRIX")
    if not out:
        return
    cfg = session.config
    reqs = _requirements(Path(os.getenv("TRACE_REQS") or Path(__file__).resolve().parents[2] / "docs" / "REQUISITOS.md"))
    results: dict[str, str] = cfg._valhalla_results
    mapped: dict[str, list[str]] = cfg._valhalla_reqs
    icon = {"passed": "✅", "failed": "❌", "skipped": "⏭️"}
    total = len(results)
    ok = sum(1 for v in results.values() if v == "passed")
    lines = [
        "# Matriz de trazabilidad",
        "",
        f"Generada automáticamente el {datetime.now():%d/%m/%Y %H:%M} al ejecutar la suite "
        f"(`scripts/run_tests.sh`). Requisitos en [REQUISITOS.md](REQUISITOS.md).",
        "",
        f"**Resultado: {ok} de {total} pruebas superadas.**",
        "",
        "| Requisito | Descripción | Pruebas automáticas | Resultado | Verificación manual |",
        "|---|---|---|---|---|",
    ]
    for rid, title, verif in reqs:
        tests = mapped.get(rid, [])
        names = "<br>".join(f"`{t.split('::')[0].split('/')[-1]}::{t.split('::')[-1]}`" for t in tests) or "—"
        if tests:
            outs = [results.get(t, "no ejecutada") for t in tests]
            passed = sum(1 for o in outs if o == "passed")
            res = f"{icon['passed'] if passed == len(outs) else icon['failed']} {passed}/{len(outs)}"
        else:
            res = "—"
        manual = verif.split("Manual:", 1)[1].strip() if "Manual:" in verif else "—"
        lines.append(f"| **{rid}** | {title} | {names} | {res} | {manual} |")
    unmapped = sorted(set(results) - {t for ts in mapped.values() for t in ts})
    if unmapped:
        lines += ["", "Pruebas sin requisito asociado: " + ", ".join(f"`{u.split('::')[-1]}`" for u in unmapped)]
    Path(out).write_text("\n".join(lines) + "\n", encoding="utf-8")
