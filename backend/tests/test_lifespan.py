"""Ciclo de vida de la API (lifespan) y caché de proxies de confianza (RNF-02, RNF-04, RNF-07)."""
import asyncio

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

import app.client_info as client_info
import app.main as main
from app.models import Monitor, Runbook, User
from app.settings import settings


@pytest.fixture
def isolated_db(monkeypatch):
    """BD propia: el apagado cierra el pool (engine.dispose) y no debe tocar la de la suite."""
    eng = create_async_engine("sqlite+aiosqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False})
    sessions = async_sessionmaker(bind=eng, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(main, "engine", eng)
    monkeypatch.setattr(main, "SessionLocal", sessions)
    monkeypatch.setattr(settings, "admin_password", "Arranque-Seguro-2026!")
    return sessions


async def _count(sessions, model, *where) -> int:
    async with sessions() as s:
        return (await s.execute(select(func.count()).select_from(model).where(*where))).scalar_one()


@pytest.mark.asyncio
@pytest.mark.req("RNF-07")
async def test_arranque_prepara_esquema_usuarios_y_semillas_sin_duplicar(isolated_db):
    async with main.lifespan(main.app):
        await main._startup()  # segundo arranque sobre la misma BD: no duplica nada
        assert await _count(isolated_db, User, User.username == "admin") == 1
        assert await _count(isolated_db, User, User.username == "valhalla-ia") == 1
        assert await _count(isolated_db, Monitor) == 5
        assert await _count(isolated_db, Runbook) == 20
        async with isolated_db() as s:
            admin = (await s.execute(select(User).where(User.username == "admin"))).scalar_one()
        assert admin.role == "admin" and admin.password_hash != settings.admin_password


@pytest.mark.asyncio
@pytest.mark.req("RNF-07")
async def test_en_produccion_sin_admin_ni_contrasena_no_arranca(isolated_db, monkeypatch):
    monkeypatch.setattr(settings, "admin_password", "")
    monkeypatch.setattr(settings, "env", "production")
    with pytest.raises(RuntimeError, match="ADMIN_PASSWORD"):
        async with main.lifespan(main.app):
            pass


@pytest.mark.asyncio
@pytest.mark.req("RNF-04")
async def test_apagado_espera_la_auditoria_y_cancela_el_bucle_de_wazuh(isolated_db, monkeypatch):
    monkeypatch.setattr(settings, "auto_sync_wazuh_tickets", True)
    written = asyncio.Event()

    async def audit_write():  # escritura de auditoría que aún no ha terminado al apagar
        await asyncio.sleep(0.05)
        written.set()

    async with main.lifespan(main.app):
        loops = set(main._background_loops)
        assert len(loops) == 1  # la sincronización automática con Wazuh está en marcha
        main._spawn(audit_write())
    assert written.is_set(), "el apagado no debe perder una auditoría en curso"
    assert all(t.cancelled() for t in loops)
    assert not main._background_tasks and not main._background_loops


@pytest.mark.asyncio
@pytest.mark.req("RNF-04")
async def test_una_tarea_colgada_no_bloquea_el_apagado():
    hung = main._spawn(asyncio.sleep(3600))
    await main._drain_background_tasks(grace=0.05)
    assert hung.cancelled()


@pytest.mark.req("RNF-02")
def test_proxies_de_confianza_disponibles_justo_tras_encender_la_maquina(monkeypatch):
    # time.monotonic() cuenta desde el arranque: en una VM recién encendida vale menos de 300 s
    monkeypatch.setattr(client_info.time, "monotonic", lambda: 12.0)
    monkeypatch.setitem(client_info._cache, "at", float("-inf"))
    monkeypatch.setitem(client_info._cache, "ips", set())
    assert "127.0.0.1" in client_info._trusted()
    assert client_info.real_ip("127.0.0.1", {"x-forwarded-for": "192.168.1.20"}) == "192.168.1.20"
