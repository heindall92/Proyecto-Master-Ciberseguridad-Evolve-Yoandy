"""«Informe de liberación»: un HTML autocontenido (imprimible a PDF) por dataset sintético.

Pensado para quien decide (DPO, comité de ética, CISO, investigador principal): primero el
veredicto y por qué; después la evidencia (figuras y tablas) y el método.
"""
from __future__ import annotations

import base64
from datetime import date
from io import BytesIO
from pathlib import Path

import matplotlib.pyplot as plt
from jinja2 import Environment, select_autoescape

from synapse import __version__, compliance, viz
from synapse.datasets import ClinicalDataset
from synapse.experiment import Evaluation

METRIC_LABELS: dict[str, str] = {
    "ci_overlap_mean": "Solapamiento medio de IC (Cox)",
    "decisions_changed": "Conclusiones clínicas cambiadas",
    "km_mean_abs_diff": "Diferencia media entre curvas KM",
    "pmse_ratio": "pMSE relativo (≈1 indistinguible)",
    "cindex_gap": "Pérdida de índice C (TRTR − TSTR)",
    "exact_match_rate": "Copias exactas de pacientes",
    "mia_dist_auc": "AUC ataque de pertenencia (distancia)",
    "mia_dens_auc": "AUC ataque de pertenencia (densidad)",
    "singling_out_risk": "Individualización (WP29)",
    "linkability_risk": "Vinculabilidad (WP29)",
    "inference_risk": "Inferencia de atributo sensible (WP29)",
}

TEMPLATE = """<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Informe de liberación · {{ ds.name }} · {{ label }}</title>
<style>
:root{--surface:#fcfcfb;--plane:#f9f9f7;--ink:#0b0b0b;--ink2:#52514e;--muted:#898781;--line:#e1e0d9;
--good:#0ca30c;--warn:#fab219;--bad:#d03b3b}
@media (prefers-color-scheme:dark){:root{--surface:#1a1a19;--plane:#0d0d0d;--ink:#fff;--ink2:#c3c2b7;--line:#2c2c2a}}
*{box-sizing:border-box}body{margin:0;background:var(--plane);color:var(--ink);font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:980px;margin:0 auto;padding:32px 16px 64px}
header .kicker{color:var(--muted);font-size:12px;letter-spacing:.08em;text-transform:uppercase}
h1{font-size:28px;margin:.2em 0}h2{font-size:19px;margin:2em 0 .6em;border-top:1px solid var(--line);padding-top:1em}
.card{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:20px;margin:16px 0}
.verdict{display:flex;gap:18px;align-items:flex-start}
.badge{font-weight:700;border-radius:999px;padding:6px 14px;white-space:nowrap;border:2px solid currentColor}
.verde{color:var(--good)}.ámbar{color:#b07a00}.rojo{color:var(--bad)}
@media (prefers-color-scheme:dark){.ámbar{color:var(--warn)}}
table{width:100%;border-collapse:collapse;font-size:14px;font-variant-numeric:tabular-nums}
th,td{text-align:left;padding:7px 8px;border-bottom:1px solid var(--line)}th{color:var(--ink2);font-weight:600}
td.num{text-align:right}img{max-width:100%;height:auto;border-radius:8px;background:#fcfcfb}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}
.small{color:var(--ink2);font-size:13px}.stamp{color:var(--bad);font-weight:700;letter-spacing:.06em}
footer{color:var(--muted);font-size:12px;margin-top:40px}
@media print{body{background:#fff}.card{break-inside:avoid}}
</style></head><body><main>
<header>
<div class="kicker">S.Y.N.A.P.S.E. · Informe de liberación de datos sintéticos · {{ today }}</div>
<h1>{{ ds.title }}</h1>
<div class="small">Generador: <b>{{ label }}</b> · Semilla {{ seed }} · n entrenamiento = {{ m.n_train }} ·
n control (holdout) = {{ m.n_holdout }} · <span class="stamp">DATOS SINTÉTICOS</span></div>
</header>

<section class="card verdict">
<span class="badge {{ v.color }}">{{ icon[v.color] }} {{ v.color|upper }}</span>
<div><b>{{ v.recommendation }}</b>
<div class="small">Privacidad: <span class="{{ v.privacy_level }}">{{ icon[v.privacy_level] }} {{ v.privacy_level }}</span>
· Utilidad: <span class="{{ v.utility_level }}">{{ icon[v.utility_level] }} {{ v.utility_level }}</span>.
El veredicto apoya, pero no sustituye, la evaluación de impacto (art. 35 RGPD) ni el criterio del DPO.</div></div>
</section>

<h2>Criterios evaluados</h2>
{% for group, title in [("privacy","Privacidad: ¿se puede atacar a los pacientes reales?"),("utility","Utilidad: ¿se mantienen las conclusiones clínicas?")] %}
<div class="card"><b>{{ title }}</b>
<table><tr><th>Criterio</th><th class="num">Valor</th><th class="num">Verde si</th><th>Estado</th></tr>
{% for c in v.criteria[group] %}<tr><td>{{ labels.get(c.metric, c.metric) }}</td><td class="num">{{ "%.3f"|format(c.value) }}</td>
<td class="num">{{ "≥" if c.higher_is_better else "≤" }} {{ c.green }}</td><td class="{{ c.level }}">{{ icon[c.level] }} {{ c.level }}</td></tr>{% endfor %}
</table></div>{% endfor %}

<h2>Evidencia: validez inferencial</h2>
<div class="grid"><div class="card"><img alt="Curvas de Kaplan-Meier real y sintética" src="data:image/png;base64,{{ fig_km }}"></div>
<div class="card"><img alt="Forest plot de hazard ratios real y sintético" src="data:image/png;base64,{{ fig_forest }}"></div></div>
<div class="card"><table><tr><th>Término</th><th class="num">HR real</th><th class="num">HR sintético</th><th class="num">Solapamiento IC</th><th>¿Conclusión cambiada?</th></tr>
{% for _, r in terms.iterrows() %}<tr><td>{{ r.term }}</td><td class="num">{{ "%.2f"|format(r.hr_real) }}</td><td class="num">{{ "%.2f"|format(r.hr_syn) }}</td>
<td class="num">{{ "%.2f"|format(r.ci_overlap) }}</td><td class="{{ 'rojo' if r.decision_changed else 'verde' }}">{{ "✕ sí" if r.decision_changed else "✓ no" }}</td></tr>{% endfor %}
</table></div>

<h2>Base normativa</h2>
<div class="card"><table>{% for k, t in legal.items() %}<tr><th style="width:30%">{{ k }}</th><td>{{ t }}</td></tr>{% endfor %}</table></div>

<h2>Método</h2>
<div class="card small">Los pacientes reales se dividen al azar (estratificado por evento) en entrenamiento, que alimenta al generador,
y control, que el generador nunca ve. Los ataques miden el <i>exceso</i> de éxito sobre los pacientes de entrenamiento frente a los
de control: lo que el atacante acierta sobre el control es inferencia poblacional legítima, no una fuga.
Validez inferencial: Karr et al. (2006), Raab, Nowok y Dibben (2016). Utilidad general: Snoke et al. (2018).
Ataques: Anonymeter (Giomi et al., 2023), pertenencia por distancia (Chen et al., 2020) y por densidad (van Breugel et al., 2023).
Fuente de los datos reales: {{ ds.citation }} {{ ds.note }}</div>

<footer>Generado por S.Y.N.A.P.S.E. v{{ version }} · Maricel Meneses Gómez (investigadora principal) y Yoandy Ramírez Delgado.
Umbrales: propuesta del equipo investigador (src/synapse/config/study.yaml), no estándar legal.</footer>
</main></body></html>"""


def _png(fig: plt.Figure) -> str:
    buf = BytesIO()
    fig.savefig(buf, format="png")
    plt.close(fig)
    return base64.b64encode(buf.getvalue()).decode()


def release_report(ds: ClinicalDataset, ev: Evaluation, out: str | Path) -> Path:
    single = ev.terms[ev.terms["analysis"] == "single"]
    fig_km = viz.km_grid(ev.train, {ev.metrics["label"]: ev.synthetic}, "Supervivencia: real frente a sintético")
    fig_forest = viz.forest(single, "Hazard ratios del modelo de Cox")
    env = Environment(autoescape=select_autoescape(default=True))
    page = env.from_string(TEMPLATE).render(
        ds=ds, label=ev.metrics["label"], seed=ev.metrics["seed"], m=type("M", (), ev.metrics), v=ev.verdict,
        icon=viz.STATUS_ICON, labels=METRIC_LABELS, terms=single, legal=compliance.LEGAL_BASIS,
        fig_km=_png(fig_km), fig_forest=_png(fig_forest), today=date.today().isoformat(), version=__version__,
    )
    out = Path(out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(page, encoding="utf-8")
    return out

