"""Panel local de S.Y.N.A.P.S.E. para evaluar un dataset propio antes de liberarlo.

    pip install -e ".[dash]"
    streamlit run app/dashboard.py

Todo se ejecuta en el ordenador de quien lo usa: ningún dato sale de la máquina.
"""
from __future__ import annotations

import tempfile
from pathlib import Path

import pandas as pd
import streamlit as st

from synapse import datasets, generators, viz
from synapse import experiment as ex
from synapse.report import release_report

st.set_page_config(page_title="S.Y.N.A.P.S.E.", page_icon="🧬", layout="wide")
st.markdown("""<style>
.block-container{padding-top:2rem;max-width:1180px}
h1{letter-spacing:-.03em} [data-testid="stMetricValue"]{font-variant-numeric:tabular-nums}
</style>""", unsafe_allow_html=True)

st.title("S.Y.N.A.P.S.E.")
st.caption("¿Se puede liberar este conjunto sintético? Validez inferencial y riesgo de reidentificación, "
           "calculados en local. Investigadora principal: Maricel Meneses Gómez · Yoandy Ramírez Delgado.")

with st.sidebar:
    st.header("1 · Datos reales")
    source = st.radio("Origen", ["Estudio de ejemplo", "Mi CSV"], horizontal=True)
    if source == "Estudio de ejemplo":
        name = st.selectbox("Estudio", list(datasets.LOADERS), format_func=lambda n: datasets.load(n).title)
        ds = datasets.load(name)
    else:
        up = st.file_uploader("CSV con una fila por paciente", type="csv")
        if up is None:
            st.info("Sube un CSV con una columna de tiempo (días) y una de evento (0/1).")
            st.stop()
        raw = pd.read_csv(up)
        time_col = st.selectbox("Columna de tiempo", raw.columns)
        event_col = st.selectbox("Columna de evento", [c for c in raw.columns if c != time_col])
        with tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False) as fh:
            raw.to_csv(fh.name, index=False)
        try:
            ds = datasets.from_csv(fh.name, time=time_col, event=event_col, name="propio")
        except ValueError as exc:
            st.error(f"No se pudo leer el CSV: {exc}")
            st.stop()
    st.header("2 · Generador")
    gen = st.selectbox("Método", generators.available(), index=generators.available().index("copula"))
    params = {"epsilon": st.slider("ε (privacidad diferencial)", 0.1, 20.0, 1.0)} if gen in ("dpcopula", "privbayes", "aim") else {}
    seed = st.number_input("Semilla", 0, 10_000, 0)
    m = st.slider("Sintéticos combinados (m)", 1, 10, 5)
    run = st.button("Evaluar", type="primary", use_container_width=True)

c1, c2, c3 = st.columns(3)
c1.metric("Pacientes", f"{ds.n:,}".replace(",", "."))
c2.metric("Eventos", f"{int(ds.data['event'].astype(int).sum()):,}".replace(",", "."))
c3.metric("Covariables", len(ds.covariates))

if not run:
    st.info("Elige el generador en la barra lateral y pulsa **Evaluar**.")
    st.stop()

with st.spinner("Sintetizando, analizando y atacando…"):
    ev = ex.evaluate(ds, ex.GeneratorSpec(gen, params), int(seed), m=m)

v = ev.verdict
box = {"verde": st.success, "ámbar": st.warning, "rojo": st.error}[v.color]
box(f"**{viz.STATUS_ICON[v.color]} {v.color.upper()}** — {v.recommendation}")

left, right = st.columns(2)
with left:
    st.subheader("Privacidad")
    st.dataframe(pd.DataFrame([{"criterio": c.metric, "valor": round(c.value, 3), "estado": c.level}
                               for c in v.criteria["privacy"]]), hide_index=True, use_container_width=True)
with right:
    st.subheader("Utilidad")
    st.dataframe(pd.DataFrame([{"criterio": c.metric, "valor": round(c.value, 3), "estado": c.level}
                               for c in v.criteria["utility"]]), hide_index=True, use_container_width=True)

st.subheader("Curvas de supervivencia")
st.pyplot(viz.km_grid(ev.train, {ev.metrics["label"]: ev.synthetic}, "Real frente a sintético"))
st.subheader("Hazard ratios")
st.pyplot(viz.forest(ev.terms[ev.terms["analysis"] == "combined"], f"Cox: real frente a {m} sintéticos combinados"))

with tempfile.TemporaryDirectory() as tmp:
    path = release_report(ds, ev, Path(tmp) / "informe_liberacion.html")
    st.download_button("Descargar informe de liberación (HTML)", path.read_bytes(), file_name=path.name,
                       mime="text/html", use_container_width=True)
st.download_button("Descargar el sintético (CSV)", ev.synthetic.to_csv(index=False).encode(),
                   file_name=f"sintetico_{gen}.csv", mime="text/csv")
st.caption("Los umbrales son una propuesta del equipo investigador, no un estándar legal. El veredicto apoya, "
           "pero no sustituye, la evaluación de impacto (art. 35 RGPD).")
