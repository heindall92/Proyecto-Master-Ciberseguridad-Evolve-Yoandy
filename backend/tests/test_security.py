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
