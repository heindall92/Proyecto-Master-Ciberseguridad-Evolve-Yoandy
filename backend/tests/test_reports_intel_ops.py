"""Informes, inteligencia, hunting, ingesta, bloqueo y auditoría
(RF-05, RF-10, RF-11, RF-12, RF-13, RNF-04, RNF-05)."""
import asyncio
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import select

from app import report_builder as rb
from app.cve_enrich import _priority
from app.grc_builder import _level, _prob
from app.models import IOC, AuditLog, Report
from conftest import TestSessionLocal, client_as, now, uid

# ── Informes con integridad ──────────────────────────────────────────────────


@pytest.mark.req("RF-10")
def test_huella_estable_e_independiente_del_orden():
    a = {"meta": {"id": 1}, "risk": {"score": 70, "level": "alto"}}
    b = {"risk": {"level": "alto", "score": 70}, "meta": {"id": 1}}
    assert rb.fingerprint(a) == rb.fingerprint(b) and len(rb.fingerprint(a)) == 64
    assert rb.fingerprint({**a, "risk": {"score": 71, "level": "alto"}}) != rb.fingerprint(a)


@pytest.mark.asyncio
@pytest.mark.req("RF-10")
async def test_verificacion_detecta_un_informe_alterado():
    data = {"meta": {"report_id": "VHL-20260926-001"}, "risk": {"score": 40}}
    async with TestSessionLocal() as s:
        s.add(Report(report_id="VHL-20260926-001", kind="soc", tlp="AMBER", period_start=now(), period_end=now(),
                     created_by_id=uid("analista"), created_by_username="analista", sha256=rb.fingerprint(data), data=data))
        await s.commit()
    async with client_as("analista") as ac:
        ok = (await ac.get("/api/reports/VHL-20260926-001/verify")).json()
    async with TestSessionLocal() as s:
        r = (await s.execute(select(Report))).scalar_one()
        r.data = {**data, "risk": {"score": 5}}  # manipulación directa en la base de datos
        await s.commit()
    async with client_as("analista") as ac:
        tampered = (await ac.get("/api/reports/VHL-20260926-001/verify")).json()
        bad_id = await ac.get("/api/reports/..%2Fetc/verify")
    assert ok["ok"] is True and tampered["ok"] is False
    assert bad_id.status_code in (404, 422)


@pytest.mark.req("RF-10", "RNF-05")
def test_matriz_de_riesgo_con_umbrales_documentados():
    assert [_prob(n) for n in (0, 1, 2, 3, 9, 10, 49, 50)] == [1, 2, 2, 3, 3, 4, 4, 5]
    assert [_level(s) for s in (4, 5, 10, 15, 25)] == ["bajo", "medio", "alto", "crítico", "crítico"]


# ── Inteligencia de vulnerabilidades ─────────────────────────────────────────

@pytest.mark.req("RF-12")
def test_prioridad_de_cve_segun_la_formula():
    solo_kev = _priority({}, None, None, None)
    completa = _priority({"ransomware": True}, {"score": 9.8, "severity": "CRITICAL"}, {"count": 2}, {"count": 1})
    media = _priority({}, {"score": 5.0, "severity": "MEDIUM"}, None, None)
    assert solo_kev["score"] == 40 and solo_kev["label"] == "Media"
    assert completa["score"] == 99 and completa["label"] == "Parchear ya"  # 40 + round(9,8×4)=39 + 15 + 5
    assert _priority({"ransomware": True}, {"score": 10.0, "severity": "CRITICAL"}, {"count": 1}, None)["score"] == 100  # tope
    assert media["score"] == 60
    assert any("ransomware" in r for r in completa["reasons"])


# ── Threat hunting ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
@pytest.mark.req("RF-11", "RNF-03")
async def test_hunting_rechaza_consultas_y_ventanas_no_validas():
    async with client_as("analista") as ac:
        fuera = await ac.get("/api/hunting/run/top_attackers?hours=721")
        inyeccion = await ac.get("/api/hunting/run/DROP%20TABLE")
        lista = await ac.get("/api/hunting/queries")
    assert fuera.status_code == 422 and inyeccion.status_code == 422
    assert lista.status_code == 200 and len(lista.json()) >= 7


# ── Ingesta de alertas ───────────────────────────────────────────────────────

@pytest.mark.asyncio
@pytest.mark.req("RF-05")
async def test_webhook_sin_secreto_se_rechaza():
    async with client_as() as ac:
        r = await ac.post("/api/webhook/wazuh", json={"rule": {"level": 5}})
    assert r.status_code in (401, 403)


@pytest.mark.asyncio
@pytest.mark.req("RF-05")
async def test_webhook_con_secreto_se_acepta():
    async with client_as() as ac:
        r = await ac.post("/api/webhook/wazuh", json={"rule": {"level": 5, "description": "prueba", "id": "1"}, "data": {}},
                          headers={"X-Valhalla-Webhook-Token": "test-webhook-secret"})
    assert r.status_code == 200


# ── Bloqueo de IPs ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
@pytest.mark.req("RF-13", "RF-02")
async def test_bloqueo_exige_sesion_e_ip_valida():
    async with client_as() as ac:
        assert (await ac.post("/api/firewall/block", json={"ip": "203.0.113.9"})).status_code == 401
    async with client_as("analista") as ac:
        assert (await ac.post("/api/firewall/block", json={"ip": "no-es-una-ip"})).status_code == 400


@pytest.mark.asyncio
@pytest.mark.req("RF-13", "RNF-05")
async def test_si_wazuh_no_confirma_el_bloqueo_no_se_registra():
    with patch("app.main.wazuh.upload_cdb_list", new=AsyncMock(side_effect=Exception("caído"))), \
         patch("app.main.wazuh.run_firewall_drop", new=AsyncMock(side_effect=Exception("caído"))):
        async with client_as("analista") as ac:
            r = await ac.post("/api/firewall/block", json={"ip": "203.0.113.9"})
    assert r.status_code == 502
    async with TestSessionLocal() as s:
        assert (await s.execute(select(IOC).where(IOC.value == "203.0.113.9"))).scalar_one_or_none() is None


@pytest.mark.asyncio
@pytest.mark.req("RF-13")
async def test_bloqueo_confirmado_queda_registrado():
    with patch("app.main.wazuh.upload_cdb_list", new=AsyncMock(return_value={"error": 0})), \
         patch("app.main.wazuh.run_firewall_drop", new=AsyncMock(return_value={"error": 0})):
        async with client_as("analista") as ac:
            r = await ac.post("/api/firewall/block", json={"ip": "203.0.113.9"})
    assert r.status_code == 200 and r.json()["cdb_applied"] and r.json()["active_response"]
    async with TestSessionLocal() as s:
        row = (await s.execute(select(IOC).where(IOC.value == "203.0.113.9"))).scalar_one()
    assert row.status == "blocked" and "blocked-firewall" in (row.tags or [])


# ── Auditoría ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
@pytest.mark.req("RNF-04")
async def test_toda_escritura_queda_auditada_sin_el_cuerpo():
    secreto = "Nuev@Clave2026"
    async with client_as("admin") as ac:
        await ac.post("/api/users", json={"username": "auditado", "role": "viewer", "password": secreto})
        await ac.post("/api/users", json={"username": "otro_usuario", "role": "inventado", "password": secreto})
    for _ in range(20):  # la auditoría se escribe en segundo plano
        async with TestSessionLocal() as s:
            logs = (await s.execute(select(AuditLog).where(AuditLog.route == "/api/users"))).scalars().all()
        if len(logs) >= 2:
            break
        await asyncio.sleep(0.05)
    assert sorted(l.status_code for l in logs) == [200, 422]
    assert all(l.username == "admin" and l.action == "POST" for l in logs)
    assert not any(secreto in (str(v) or "") for l in logs for v in vars(l).values())
