import pytest
import pytest_asyncio
import sys
import asyncio

if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from app.main import app
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
