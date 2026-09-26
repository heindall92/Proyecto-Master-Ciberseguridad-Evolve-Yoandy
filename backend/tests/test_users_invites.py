"""Roles, gestión de usuarios e invitaciones de un solo uso (RF-02, RF-03, RF-04)."""
from datetime import timedelta

import pytest
from sqlalchemy import select

import app.main as main
from app.models import User, UserInvite
from conftest import PASSWORD, TestSessionLocal, client_as, now, uid

pytestmark = pytest.mark.asyncio


# ── Roles ────────────────────────────────────────────────────────────────────

@pytest.mark.req("RF-02")
async def test_solo_admin_lista_usuarios():
    async with client_as("admin") as ac:
        assert (await ac.get("/api/users")).status_code == 200
    for who in ("analista", "lector", "reportero"):
        async with client_as(who) as ac:
            assert (await ac.get("/api/users")).status_code == 403, who


@pytest.mark.req("RF-02")
async def test_lector_y_reportero_no_crean_runbooks():
    body = {"name": "RB prueba roles", "category": "other", "description": "x"}
    for who in ("lector", "reportero"):
        async with client_as(who) as ac:
            assert (await ac.post("/api/runbooks", json=body)).status_code == 403, who


@pytest.mark.req("RF-02")
async def test_solo_admin_y_analista_gestionan_informes_y_hunting():
    async with client_as("lector") as ac:
        assert (await ac.get("/api/reports")).status_code == 403
        assert (await ac.get("/api/hunting/run/top_attackers")).status_code == 403


# ── Gestión de usuarios ──────────────────────────────────────────────────────

@pytest.mark.req("RF-03", "RF-02")
async def test_analista_no_puede_crear_usuarios():
    async with client_as("analista") as ac:
        r = await ac.post("/api/users", json={"username": "nuevo", "role": "viewer", "password": "Nuev@Clave2026"})
    assert r.status_code == 403


@pytest.mark.req("RF-03")
async def test_crear_usuario_valida_rol_y_contrasena():
    async with client_as("admin") as ac:
        mal_rol = await ac.post("/api/users", json={"username": "nuevo", "role": "superadmin", "password": "Nuev@Clave2026"})
        debil = await ac.post("/api/users", json={"username": "nuevo", "role": "viewer", "password": "abcdefgh"})
        ok = await ac.post("/api/users", json={"username": "nuevo", "role": "analista", "password": "Nuev@Clave2026"})
        dup = await ac.post("/api/users", json={"username": "nuevo", "role": "analista", "password": "Nuev@Clave2026"})
    assert mal_rol.status_code == 422
    assert debil.status_code == 400
    assert ok.status_code == 200 and ok.json()["role"] == "analista"
    assert dup.status_code == 409


@pytest.mark.req("RF-03")
async def test_no_se_puede_borrar_a_uno_mismo_ni_al_usuario_de_la_ia():
    async with client_as("admin") as ac:
        assert (await ac.delete(f"/api/users/{uid('admin')}")).status_code == 409
        assert (await ac.delete(f"/api/users/{uid('valhalla-ia')}")).status_code == 409
        assert (await ac.delete(f"/api/users/{uid('reportero')}")).status_code == 200


@pytest.mark.req("RF-03")
async def test_no_se_puede_quitar_el_rol_al_ultimo_admin():
    async with client_as("admin") as ac:
        r = await ac.put(f"/api/users/{uid('admin')}", json={"role": "analista"})
    assert r.status_code == 409


# ── Invitaciones ─────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def _tailscale_invites(monkeypatch):
    async def public_url():
        return "https://valhalla-soc.tailnet.ts.net"

    async def share():
        return None, None, "Sin enlace automático: falta TAILSCALE_API_KEY en el .env."

    monkeypatch.setattr(main.ts, "public_url", public_url)
    monkeypatch.setattr(main.ts, "create_share_invite", share)


async def _invitar(username="invitado"):
    async with client_as("admin") as ac:
        u = await ac.post("/api/users", json={"username": username, "role": "analista"})
        assert u.status_code == 200, u.text
        inv = await ac.post(f"/api/users/{u.json()['id']}/invite", json={"tailscale": True})
    assert inv.status_code == 200, inv.text
    return u.json()["id"], inv.json()


@pytest.mark.req("RF-04")
async def test_invitacion_usa_la_url_https_y_guarda_solo_el_hash():
    user_id, inv = await _invitar()
    assert inv["activation_url"].startswith("https://valhalla-soc.tailnet.ts.net/activar#")
    assert inv["vpn"] is False and inv["tailscale_url"] is None and inv["tailscale_error"]
    token = inv["activation_url"].split("#", 1)[1]
    async with TestSessionLocal() as s:
        row = (await s.execute(select(UserInvite).where(UserInvite.user_id == user_id))).scalar_one()
    assert row.token_hash != token and len(row.token_hash) == 64  # SHA-256, nunca el token


@pytest.mark.req("RF-04", "RF-01")
async def test_activacion_de_un_solo_uso():
    _, inv = await _invitar()
    token = inv["activation_url"].split("#", 1)[1]
    async with client_as() as ac:  # sin sesión: el invitado aún no tiene contraseña
        chk = await ac.post("/api/auth/invite/check", json={"token": token})
        debil = await ac.post("/api/auth/invite/activate", json={"token": token, "password": "abcdefgh"})
        con_usuario = await ac.post("/api/auth/invite/activate", json={"token": token, "password": "Invitado#2026x"})
        ok = await ac.post("/api/auth/invite/activate", json={"token": token, "password": "Nuev@Clave2026"})
        reuso = await ac.post("/api/auth/invite/check", json={"token": token})
        login = await ac.post("/api/auth/login", json={"username": "invitado", "password": "Nuev@Clave2026"})
    assert chk.status_code == 200 and chk.json()["username"] == "invitado"
    assert debil.status_code == 400
    assert con_usuario.status_code == 400  # no puede contener el nombre de usuario
    assert ok.status_code == 200
    assert reuso.status_code == 410
    assert login.status_code == 200


@pytest.mark.req("RF-04")
async def test_invitacion_caducada_o_inventada_se_rechaza():
    user_id, inv = await _invitar()
    token = inv["activation_url"].split("#", 1)[1]
    async with TestSessionLocal() as s:
        row = (await s.execute(select(UserInvite).where(UserInvite.user_id == user_id))).scalar_one()
        row.expires_at = now() - timedelta(minutes=1)
        await s.commit()
    async with client_as() as ac:
        assert (await ac.post("/api/auth/invite/check", json={"token": token})).status_code == 410
        assert (await ac.post("/api/auth/invite/check", json={"token": "x" * 43})).status_code == 410


@pytest.mark.req("RF-04")
async def test_nueva_invitacion_anula_la_anterior():
    user_id, inv1 = await _invitar()
    async with client_as("admin") as ac:
        inv2 = (await ac.post(f"/api/users/{user_id}/invite", json={"tailscale": False})).json()
    async with client_as() as ac:
        old = await ac.post("/api/auth/invite/check", json={"token": inv1["activation_url"].split("#", 1)[1]})
        new = await ac.post("/api/auth/invite/check", json={"token": inv2["activation_url"].split("#", 1)[1]})
    assert old.status_code == 410 and new.status_code == 200


@pytest.mark.req("RF-04", "RF-02")
async def test_solo_admin_invita_y_no_al_usuario_de_sistema():
    async with client_as("analista") as ac:
        assert (await ac.post(f"/api/users/{uid('lector')}/invite", json={})).status_code == 403
    async with client_as("admin") as ac:
        assert (await ac.post(f"/api/users/{uid('valhalla-ia')}/invite", json={})).status_code == 409


@pytest.mark.req("RF-04")
async def test_usuario_creado_sin_contrasena_no_puede_entrar_hasta_activar():
    async with client_as("admin") as ac:
        await ac.post("/api/users", json={"username": "pendiente", "role": "viewer"})
    async with TestSessionLocal() as s:
        u = (await s.execute(select(User).where(User.username == "pendiente"))).scalar_one()
    assert u.password_hash  # contraseña aleatoria desconocida
    async with client_as() as ac:
        r = await ac.post("/api/auth/login", json={"username": "pendiente", "password": PASSWORD})
    assert r.status_code == 401
