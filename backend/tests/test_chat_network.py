"""Chat, privacidad, presencia, IP real y VPN (RF-08, RF-09, RF-16, RNF-02, RNF-06)."""
import base64

import pytest

import app.main as main
from app.client_info import device_of, is_https, network_of, real_ip
from conftest import client_as, uid

TRUSTED = "127.0.0.1"  # proxy de confianza (en producción: el contenedor dashboard o nginx)


def dm(a: str, b: str) -> str:
    x, y = sorted((uid(a), uid(b)))
    return f"dm:{x}-{y}"


# ── Chat ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
@pytest.mark.req("RF-08", "RNF-06")
async def test_mensaje_directo_solo_lo_leen_sus_participantes():
    chat = dm("analista", "lector")
    async with client_as("analista") as ac:
        assert (await ac.post("/api/chat", json={"chatId": chat, "text": "IOC en el ticket 3"})).status_code == 200
    async with client_as("lector") as ac:
        assert len((await ac.get(f"/api/chat/{chat}")).json()) == 1
    async with client_as("admin") as ac:  # ni siquiera el administrador
        assert (await ac.get(f"/api/chat/{chat}")).status_code == 403
        assert (await ac.post("/api/chat", json={"chatId": chat, "text": "hola"})).status_code == 403


@pytest.mark.asyncio
@pytest.mark.req("RF-08", "RNF-03")
async def test_ids_de_chat_manipulados_se_rechazan():
    async with client_as("analista") as ac:
        r1 = await ac.post("/api/chat", json={"chatId": "dm:1-2-3", "text": "x"})
        r2 = await ac.post("/api/chat", json={"chatId": "dm:3-2", "text": "x"})  # orden no canónico
    assert r1.status_code == 422 and r2.status_code == 403


@pytest.mark.asyncio
@pytest.mark.req("RF-08", "RNF-03")
async def test_adjuntos_validados():
    png = base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"0" * 64).decode()
    ok = {"name": "captura.png", "type": "image/png", "size": 72, "data": f"data:image/png;base64,{png}"}
    exe = {**ok, "name": "x.exe", "type": "application/x-msdownload", "data": f"data:application/x-msdownload;base64,{png}"}
    tipo_falso = {**ok, "data": f"data:text/html;base64,{png}"}
    async with client_as("analista") as ac:
        r_ok = await ac.post("/api/chat", json={"chatId": "global", "text": "", "attachment": ok})
        r_exe = await ac.post("/api/chat", json={"chatId": "global", "text": "", "attachment": exe})
        r_falso = await ac.post("/api/chat", json={"chatId": "global", "text": "", "attachment": tipo_falso})
    assert r_ok.status_code == 200 and r_exe.status_code == 422 and r_falso.status_code == 422


@pytest.mark.asyncio
@pytest.mark.req("RF-08", "RNF-03")
async def test_html_del_mensaje_se_neutraliza():
    async with client_as("analista") as ac:
        r = await ac.post("/api/chat", json={"chatId": "global", "text": "<script>alert(1)</script>hola"})
    assert r.status_code == 200 and "<script>" not in r.json()["text"]


@pytest.mark.asyncio
@pytest.mark.req("RF-08")
async def test_vaciar_chat_es_por_usuario_y_persistente():
    async with client_as("analista") as ac:
        await ac.post("/api/chat", json={"chatId": "global", "text": "mensaje antiguo"})
        assert (await ac.post("/api/chat/global/clear")).status_code == 200
        mine = (await ac.get("/api/chat/global")).json()  # otra carga = otro dispositivo
    async with client_as("lector") as ac:
        other = (await ac.get("/api/chat/global")).json()
    assert mine == [] and len(other) == 1


# ── Presencia ────────────────────────────────────────────────────────────────

class _Conn:
    pass


@pytest.mark.req("RF-09", "RNF-06")
def test_presencia_muestra_la_ip_solo_al_admin_y_al_propio_usuario():
    m = main.ConnectionManager()
    info = {"id": uid("analista"), "username": "analista", "role": "analista", "ip": "100.82.1.9",
            "network": "VPN (Tailscale)", "device": device_of("Mozilla/5.0 (Linux; Android 16) Mobile"),
            "since": "2026-09-26T10:00:00+00:00", "ts": {"login": "ana@example.com", "device": "Pixel"}, "mismatch": False}
    m.active_connections[_Conn()] = info

    class U:  # usuario mínimo
        def __init__(self, id, role): self.id, self.role = id, role

    as_admin = m.online(U(uid("admin"), "admin"))[0]["detail"][0]
    as_self = m.online(U(uid("analista"), "analista"))[0]["detail"][0]
    as_other = m.online(U(uid("lector"), "viewer"))[0]["detail"][0]
    assert as_admin["ip"] == as_self["ip"] == "100.82.1.9"
    assert "ip" not in as_other and "ts" not in as_other
    assert as_other["network"] == "VPN (Tailscale)" and as_other["device"]["type"] == "móvil"


@pytest.mark.req("RF-16")
def test_alerta_si_la_cuenta_de_vpn_no_es_la_vinculada():
    class U:
        tailscale_login = "ana@example.com"
    assert main._ts_mismatch(U(), {"login": "otra@example.com"}) is True
    assert main._ts_mismatch(U(), {"login": "ANA@example.com"}) is False
    assert main._ts_mismatch(U(), None) is False


# ── IP real y red ────────────────────────────────────────────────────────────

@pytest.mark.req("RNF-02")
def test_ip_real_solo_desde_un_proxy_de_confianza():
    assert real_ip(TRUSTED, {"x-forwarded-for": "192.168.1.20"}) == "192.168.1.20"
    # Un cliente directo (p. ej. el contenedor atacante) no puede hacerse pasar por otro
    assert real_ip("172.18.0.5", {"x-forwarded-for": "100.64.0.1"}) == "172.18.0.5"


@pytest.mark.req("RNF-02")
def test_lo_que_anade_el_cliente_a_x_forwarded_for_se_ignora():
    # El proxy añade la IP real al final; lo anterior lo puede inventar el cliente
    assert real_ip(TRUSTED, {"x-forwarded-for": "6.6.6.6, 192.168.1.20"}) == "192.168.1.20"
    # Cadena con el host de confianza (tailscale serve): se salta y se toma la siguiente
    assert real_ip(TRUSTED, {"x-forwarded-for": "100.82.1.9, 127.0.0.1"}) == "100.82.1.9"
    # Entrada manipulada: se usa el propio proxy, nunca un valor del cliente
    assert real_ip(TRUSTED, {"x-forwarded-for": "basura, 127.0.0.1"}) == TRUSTED


@pytest.mark.req("RF-09", "RF-16")
def test_clasificacion_de_red_y_dispositivo():
    assert network_of("100.82.134.90") == "VPN (Tailscale)"
    assert network_of("192.168.235.1") == "red local"
    assert network_of("8.8.8.8") == "internet"
    assert network_of("no-ip") == "desconocida"
    d = device_of("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Safari/604.1")
    assert d == {"type": "móvil", "os": "iOS", "browser": "Safari"}


@pytest.mark.req("RF-16", "RNF-01")
def test_deteccion_de_https_solo_con_proxy_de_confianza():
    assert is_https(TRUSTED, {"x-forwarded-host": "valhalla-soc.tailnet.ts.net"}) is True
    assert is_https(TRUSTED, {"x-forwarded-proto": "https"}) is True
    assert is_https(TRUSTED, {"x-forwarded-host": "192.168.235.130:3000", "x-forwarded-proto": "http"}) is False
    assert is_https("172.18.0.5", {"x-forwarded-proto": "https"}) is False
