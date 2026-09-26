"""Incidentes, métricas del SOC y runbooks (RF-06, RF-07, RF-14, RNF-03, RNF-05)."""
from datetime import timedelta

import pytest
from sqlalchemy import func, select

from app.models import Runbook, Ticket
from app.runbooks_seed import DEFAULT_RUNBOOKS, UI_RENAMES, seed_runbooks_if_empty
from conftest import TestSessionLocal, client_as, now

pytestmark = pytest.mark.asyncio


# ── Incidentes ───────────────────────────────────────────────────────────────

@pytest.mark.req("RF-06")
async def test_ciclo_de_vida_del_incidente_queda_en_el_historial():
    async with client_as("analista") as ac:
        t = await ac.post("/api/tickets", json={"title": "Fuerza bruta SSH", "severity": "high", "source_ip": "203.0.113.7"})
        assert t.status_code == 200, t.text
        tid = t.json()["id"]
        up = await ac.put(f"/api/tickets/{tid}", json={"status": "in_progress"})
        res = await ac.post(f"/api/tickets/{tid}/resolve",
                            json={"resolution_notes": "IP bloqueada y credenciales rotadas", "classification": "true_positive"})
        timeline = await ac.get(f"/api/tickets/{tid}/timeline")
    assert up.json()["status"] == "in_progress"
    assert res.json()["status"] == "resolved" and res.json()["classification"] == "true_positive"
    kinds = [e["kind"] if "kind" in e else e.get("event_type") for e in timeline.json()]
    assert len(timeline.json()) >= 2, kinds


@pytest.mark.req("RF-06", "RNF-03")
async def test_incidente_con_datos_no_validos_se_rechaza():
    async with client_as("analista") as ac:
        mala_ip = await ac.post("/api/tickets", json={"title": "x", "source_ip": "no-es-una-ip"})
        mala_sev = await ac.post("/api/tickets", json={"title": "x", "severity": "apocaliptica"})
        mala_clas = await ac.post("/api/tickets/1/resolve", json={"resolution_notes": "x", "classification": "quizas"})
    assert mala_ip.status_code == 422 and mala_sev.status_code == 422 and mala_clas.status_code == 422


@pytest.mark.req("RNF-03")
async def test_html_en_el_titulo_se_neutraliza():
    async with client_as("analista") as ac:
        r = await ac.post("/api/tickets", json={"title": "<img src=x onerror=alert(1)>Alerta"})
    assert r.status_code == 200 and "<" not in r.json()["title"]


# ── Métricas ─────────────────────────────────────────────────────────────────

@pytest.mark.req("RF-14", "RNF-05")
async def test_metricas_sin_datos_no_inventan_nada():
    async with client_as("analista") as ac:
        m = (await ac.get("/api/metrics/soc")).json()
    assert m["tickets"]["total"] == 0 and m["mttr_minutes"] == 0
    # Sin catálogo de reglas no hay cobertura que calcular: se devuelve vacío, no un porcentaje inventado
    assert m["attack_coverage_pct"] in (0, None) and m["techniques_seen"] == []


@pytest.mark.req("RF-14")
async def test_mttr_se_calcula_con_la_fecha_de_resolucion():
    t0 = now() - timedelta(hours=5)
    async with TestSessionLocal() as s:
        s.add(Ticket(title="a", status="resolved", severity="high", created_at=t0, resolved_at=t0 + timedelta(minutes=120),
                     updated_at=now()))  # updated_at posterior (p. ej. un comentario) no debe alterar el MTTR
        s.add(Ticket(title="b", status="resolved", severity="low", created_at=t0, resolved_at=t0 + timedelta(minutes=60)))
        s.add(Ticket(title="c", status="open", severity="medium", created_at=now() - timedelta(minutes=30)))
        await s.commit()
    async with client_as("admin") as ac:
        m = (await ac.get("/api/metrics/soc")).json()
    assert m["mttr_minutes"] == 90
    assert m["tickets"] == {"total": 3, "closed": 2, "open": 1, "resolution_rate_pct": 67}
    assert 29 <= m["dwell_open_avg_minutes"] <= 31


@pytest.mark.req("RF-02", "RF-14")
async def test_metricas_solo_para_admin_y_analista():
    async with client_as("lector") as ac:
        assert (await ac.get("/api/metrics/soc")).status_code == 403


# ── Runbooks ─────────────────────────────────────────────────────────────────

RB = {
    "name": "Contención de ransomware en servidor de ficheros",
    "category": "ransomware",
    "description": "Cifrado masivo de ficheros compartidos.",
    "identification_steps": [{"text": "Identificar el equipo origen del cifrado"}],
    "containment_steps": [{"text": "Aislar el equipo de la red", "command": "iptables -I INPUT -j DROP"}],
}


@pytest.mark.req("RF-07")
async def test_crear_y_editar_runbook_con_nombre_unico():
    async with client_as("analista") as ac:
        r = await ac.post("/api/runbooks", json=RB)
        dup = await ac.post("/api/runbooks", json=RB)
        edit = await ac.put(f"/api/runbooks/{r.json()['id']}", json={**RB, "description": "Actualizado"})
    assert r.status_code == 200 and r.json()["containment_steps"][0]["command"].startswith("iptables")
    assert dup.status_code == 409
    assert edit.status_code == 200 and edit.json()["description"] == "Actualizado"


@pytest.mark.req("RF-07", "RNF-03")
async def test_runbook_no_valido_se_rechaza():
    async with client_as("analista") as ac:
        cat = await ac.post("/api/runbooks", json={**RB, "category": "inventada"})
        largo = await ac.post("/api/runbooks", json={**RB, "name": "Otro", "containment_steps": [{"text": "x" * 601}]})
        vacio = await ac.post("/api/runbooks", json={**RB, "name": "Otro", "description": ""})
    assert cat.status_code == largo.status_code == vacio.status_code == 422


@pytest.mark.req("RF-07")
async def test_semilla_crea_los_20_runbooks_sin_duplicar():
    assert len(DEFAULT_RUNBOOKS) == 20 and len({r["name"] for r in DEFAULT_RUNBOOKS}) == 20
    async with TestSessionLocal() as s:
        assert await seed_runbooks_if_empty(s) == 20
        await s.commit()
        assert await seed_runbooks_if_empty(s) == 0
        await s.commit()
        assert (await s.execute(select(func.count(Runbook.id)))).scalar() == 20


@pytest.mark.req("RF-07")
async def test_semilla_actualiza_nombres_de_pantallas_antiguos():
    old, new = UI_RENAMES[0]
    async with TestSessionLocal() as s:
        s.add(Runbook(name="Antiguo", category="intrusion", description="d", is_active=True,
                      identification_steps=[{"text": old}], containment_steps=[], eradication_steps=[],
                      recovery_steps=[], post_mortem_steps=[]))
        await s.commit()
        await seed_runbooks_if_empty(s)
        await s.commit()
        rb = (await s.execute(select(Runbook).where(Runbook.name == "Antiguo"))).scalar_one()
    assert rb.identification_steps[0]["text"] == new
