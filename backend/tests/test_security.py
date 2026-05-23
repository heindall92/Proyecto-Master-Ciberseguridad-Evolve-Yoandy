import pytest
import pytest_asyncio
import sys
import asyncio

if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from app.main import app, limiter
# Desactivar el rate-limit de login (5/min por IP) durante los tests: con varios
# logins en la misma suite se alcanzaba el límite y los logins devolvían 429.
limiter.enabled = False
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.db import get_db
from app.models import Base, User
from app.auth import get_password_hash
from app.settings import settings

settings.webhook_secret = "test-webhook-secret"

# Use an isolated in-memory database for tests
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"
test_engine = create_async_engine(TEST_DATABASE_URL)
TestSessionLocal = async_sessionmaker(bind=test_engine, class_=AsyncSession, expire_on_commit=False)

async def override_get_db():
    async with TestSessionLocal() as session:
        yield session

app.dependency_overrides[get_db] = override_get_db

@pytest_asyncio.fixture(scope="function")
async def test_db():
    # Setup: Create tables in the isolated test database
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    async with TestSessionLocal() as db:
        # Create test user
        user = User(
            username="testuser",
            password_hash=get_password_hash("TestPass123!"),
            role="analista"
        )
        db.add(user)
        await db.commit()
    
    yield
    
    # Teardown: tables are automatically dropped if engine is disposed or session closed in memory
    # but for clarity:
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

from httpx import AsyncClient, ASGITransport

@pytest.mark.asyncio
async def test_health_check():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "version": "2.0.0"}

@pytest.mark.asyncio
async def test_login_success(test_db):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.post("/api/auth/login", json={
            "username": "testuser",
            "password": "TestPass123!"
        })
    assert response.status_code == 200
    assert "access_token" in response.json()

@pytest.mark.asyncio
async def test_login_bad_password(test_db):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.post("/api/auth/login", json={
            "username": "testuser",
            "password": "WrongPassword123!"
        })
    assert response.status_code == 401

@pytest.mark.asyncio
async def test_input_validation_xss():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.post("/api/auth/login", json={
            "username": "<script>alert(1)</script>",
            "password": "StrongPassword123!"
        })
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_webhook_requires_token(test_db):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.post("/api/webhook/wazuh", json={"rule": {"level": 5}})
    assert response.status_code in (401, 503)


@pytest.mark.asyncio
async def test_webhook_with_valid_token(test_db):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.post(
            "/api/webhook/wazuh",
            json={"rule": {"level": 5, "description": "test", "id": "1"}, "data": {}},
            headers={"X-Valhalla-Webhook-Token": "test-webhook-secret"},
        )
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_lsa_requires_auth():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.get("/api/lsa/endpoints")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_executive_report_requires_auth():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.get("/api/reports/executive")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_update_ai_settings_requires_admin(test_db):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        login = await ac.post(
            "/api/auth/login",
            json={"username": "testuser", "password": "TestPass123!"},
        )
        token = login.json()["access_token"]
        response = await ac.post(
            "/api/settings/ai",
            json={"ollama_model": "test-model"},
            headers={"Authorization": f"Bearer {token}"},
        )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_refresh_requires_cookie(test_db):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.post("/api/auth/refresh")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_logout_revokes_access_token(test_db):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        login = await ac.post(
            "/api/auth/login",
            json={"username": "testuser", "password": "TestPass123!"},
        )
        assert login.status_code == 200
        cookies = login.cookies
        me = await ac.get("/api/auth/me", cookies=cookies)
        assert me.status_code == 200
        await ac.post("/api/auth/logout", cookies=cookies)
        me2 = await ac.get("/api/auth/me", cookies=cookies)
    assert me2.status_code == 401


def test_access_tokens_include_jti():
    from app.auth import create_access_token_with_meta, decode_token_payload

    token, jti, _ = create_access_token_with_meta("testuser")
    payload = decode_token_payload(token)
    assert payload is not None
    assert payload.get("jti") == jti
    assert payload.get("typ") == "access"


# ── Fase 1: Active Response / Firewall block ──

async def _auth_headers(ac):
    """Login + cabeceras con el par CSRF double-submit que exige SecurityMiddleware."""
    r = await ac.post("/api/auth/login", json={"username": "testuser", "password": "TestPass123!"})
    token = r.json()["access_token"]
    csrf = ac.cookies.get("csrf_token")
    return {"Authorization": f"Bearer {token}", "X-CSRF-Token": csrf or ""}


@pytest.mark.asyncio
async def test_firewall_block_requires_auth(test_db):
    # CSRF satisfecho (cookie+header iguales) pero SIN sesión → debe fallar en auth (401)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test", cookies={"csrf_token": "x"}
    ) as ac:
        r = await ac.post("/api/firewall/block", json={"ip": "1.2.3.4"}, headers={"X-CSRF-Token": "x"})
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_firewall_block_invalid_ip(test_db):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        headers = await _auth_headers(ac)
        r = await ac.post("/api/firewall/block", json={"ip": "not-an-ip-at-all"}, headers=headers)
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_firewall_block_wazuh_failure_returns_502(test_db):
    """Si Wazuh no confirma, NO se debe mentir: 502 y sin IOC persistido (rollback)."""
    from unittest.mock import AsyncMock, patch
    from sqlalchemy import select
    from app.models import IOC

    with patch("app.main.wazuh.upload_cdb_list", new=AsyncMock(side_effect=Exception("down"))), \
         patch("app.main.wazuh.run_firewall_drop", new=AsyncMock(side_effect=Exception("down"))):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            headers = await _auth_headers(ac)
            r = await ac.post("/api/firewall/block", json={"ip": "185.220.101.47"}, headers=headers)
    assert r.status_code == 502
    # El IOC no debe haberse quedado persistido tras el rollback
    async with TestSessionLocal() as db:
        row = (await db.execute(select(IOC).where(IOC.value == "185.220.101.47"))).scalar_one_or_none()
    assert row is None


@pytest.mark.asyncio
async def test_firewall_block_success(test_db):
    from unittest.mock import AsyncMock, patch
    from sqlalchemy import select
    from app.models import IOC

    with patch("app.main.wazuh.upload_cdb_list", new=AsyncMock(return_value={"error": 0})), \
         patch("app.main.wazuh.run_firewall_drop", new=AsyncMock(return_value={"error": 0})):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            headers = await _auth_headers(ac)
            r = await ac.post("/api/firewall/block", json={"ip": "185.220.101.47"}, headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True and body["cdb_applied"] is True and body["active_response"] is True
    async with TestSessionLocal() as db:
        row = (await db.execute(select(IOC).where(IOC.value == "185.220.101.47"))).scalar_one_or_none()
    assert row is not None and row.status == "blocked" and "blocked-firewall" in (row.tags or [])
