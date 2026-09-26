"""Autenticación, sesión y protecciones HTTP (RF-01, RNF-01, RNF-03)."""
import pytest
from httpx import ASGITransport, AsyncClient

from app.auth import create_access_token_with_meta, decode_token_payload
from app.main import app
from conftest import PASSWORD, client_as

pytestmark = pytest.mark.asyncio


def raw_client(**kw):
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test", **kw)


@pytest.mark.req("RF-01")
async def test_health_publico():
    async with raw_client() as ac:
        r = await ac.get("/health")
    assert r.status_code == 200 and r.json()["status"] == "ok"


@pytest.mark.req("RF-01", "RNF-01")
async def test_login_correcto_abre_sesion_con_cookies_httponly():
    async with raw_client() as ac:
        r = await ac.post("/api/auth/login", json={"username": "analista", "password": PASSWORD})
    assert r.status_code == 200 and r.json()["access_token"]
    cookies = r.headers.get_list("set-cookie")
    access = next(c for c in cookies if c.startswith("access_token="))
    assert "HttpOnly" in access and "SameSite" in access
    # Por http (red local) la cookie no puede ser Secure: el navegador no la guardaría
    assert "Secure" not in access


@pytest.mark.req("RF-01")
async def test_login_con_contrasena_incorrecta_devuelve_401():
    async with raw_client() as ac:
        r = await ac.post("/api/auth/login", json={"username": "analista", "password": "Incorrecta123!"})
    assert r.status_code == 401


@pytest.mark.req("RNF-01", "RF-16")
async def test_cookies_secure_cuando_se_llega_por_https():
    # Petición que llega por tailscale serve -> Vite: X-Forwarded-Host *.ts.net desde un proxy de confianza
    async with raw_client() as ac:
        r = await ac.post("/api/auth/login", json={"username": "analista", "password": PASSWORD},
                          headers={"X-Forwarded-Host": "valhalla-soc.tailnet.ts.net"})
    access = next(c for c in r.headers.get_list("set-cookie") if c.startswith("access_token="))
    assert "Secure" in access


@pytest.mark.req("RNF-03")
async def test_usuario_con_html_se_rechaza():
    async with raw_client() as ac:
        r = await ac.post("/api/auth/login", json={"username": "<script>alert(1)</script>", "password": PASSWORD})
    assert r.status_code == 400


@pytest.mark.req("RF-01")
async def test_refresh_exige_cookie():
    async with raw_client() as ac:
        r = await ac.post("/api/auth/refresh")
    assert r.status_code == 401


@pytest.mark.req("RF-01")
async def test_logout_revoca_el_token():
    async with raw_client() as ac:
        login = await ac.post("/api/auth/login", json={"username": "analista", "password": PASSWORD})
        cookies = login.cookies
        assert (await ac.get("/api/auth/me", cookies=cookies)).status_code == 200
        await ac.post("/api/auth/logout", cookies=cookies,
                      headers={"X-CSRF-Token": cookies.get("csrf_token") or ""})
        assert (await ac.get("/api/auth/me", cookies=cookies)).status_code == 401


@pytest.mark.req("RF-01")
def test_tokens_de_acceso_llevan_jti_y_tipo():
    token, jti, _ = create_access_token_with_meta("analista")
    payload = decode_token_payload(token)
    assert payload["jti"] == jti and payload["typ"] == "access"


@pytest.mark.req("RF-02")
async def test_endpoints_protegidos_exigen_sesion():
    async with raw_client() as ac:
        for path in ("/api/lsa/endpoints", "/api/reports/executive", "/api/users", "/api/presence"):
            assert (await ac.get(path)).status_code == 401, path


@pytest.mark.req("RNF-01")
async def test_escritura_sin_token_csrf_se_rechaza():
    async with raw_client() as ac:
        token, _, _ = create_access_token_with_meta("admin")
        r = await ac.post("/api/runbooks", json={}, headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403 and "CSRF" in r.text


@pytest.mark.req("RNF-01")
async def test_cabeceras_de_seguridad():
    async with client_as("analista") as ac:
        r = await ac.get("/api/auth/me")
    assert r.headers["X-Content-Type-Options"] == "nosniff"
    assert r.headers["X-Frame-Options"] == "DENY"
    assert "Referrer-Policy" in r.headers
