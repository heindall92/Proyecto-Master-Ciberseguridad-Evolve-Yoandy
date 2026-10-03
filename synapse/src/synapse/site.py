"""Explorador web estático: ``synapse site`` → ``site/index.html`` autocontenido (sin servidor).

Toma los resultados del estudio, calcula las curvas KM y los forest plots de la semilla de
referencia, y los incrusta como JSON en una plantilla HTML con gráficos SVG interactivos.
Se puede abrir con doble clic, publicar en GitHub Pages o enlazar desde LinkedIn.
"""
from __future__ import annotations

import json
import math
from importlib import resources
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from synapse import __version__, datasets, generators, viz
from synapse import experiment as ex
from synapse.inference import kaplan_meier

KEY_METRICS = ["comb_ci_overlap_mean", "ci_overlap_mean", "decisions_changed", "km_mean_abs_diff", "pmse_ratio",
               "cindex_tstr", "cindex_trtr", "mia_dist_auc", "mia_dens_auc", "exact_match_rate",
               "singling_out_risk", "linkability_risk", "inference_risk", "risk"]


def _clean(x: Any) -> Any:
    if isinstance(x, float) and (math.isnan(x) or math.isinf(x)):
        return None
    if isinstance(x, (np.floating, np.integer)):
        return _clean(x.item())
    if isinstance(x, dict):
        return {k: _clean(v) for k, v in x.items()}
    if isinstance(x, list):
        return [_clean(v) for v in x]
    return x


def _summary(metrics: pd.DataFrame) -> list[dict[str, Any]]:
    m = metrics.copy()
    m["risk"] = viz.privacy_risk_index(m)
    rows = []
    for (ds, label), g in m.groupby(["dataset", "label"], sort=False):
        row: dict[str, Any] = {"dataset": ds, "label": label, "generator": g["generator"].iloc[0],
                               "family": g["family"].iloc[0], "dp": bool(g["dp"].iloc[0]),
                               "epsilon": g["epsilon"].iloc[0], "n": len(g)}
        for k in KEY_METRICS:
            if k in g:
                row[k] = float(g[k].mean())
                row[f"{k}_se"] = float(g[k].std(ddof=1) / np.sqrt(len(g))) if len(g) > 1 else 0.0
        counts = g["verdict"].value_counts(normalize=True)
        row["verdicts"] = {v: float(counts.get(v, 0.0)) for v in ("verde", "ámbar", "rojo")}
        rows.append(row)
    return rows


def _km_payload(name: str, labels: dict[str, ex.GeneratorSpec], seed: int, max_rows: int) -> dict[str, Any]:
    d = ex.subsample(datasets.load(name), max_rows)
    train, _ = datasets.split_train_holdout(d.data, seed)
    tau = float(np.quantile(train["time"], 0.95))
    grid = np.linspace(0, tau, 120)
    out: dict[str, Any] = {"t": grid.round(1).tolist(),
                           "real": kaplan_meier(train).survival_function_at_times(grid).round(4).tolist()}
    for label, spec in labels.items():
        try:
            syn = generators.make(spec.name, seed=seed, **spec.params).fit(train, d.schema).sample(len(train))
        except RuntimeError:  # generador del extra [deep] no instalado en este entorno
            continue
        out[label] = kaplan_meier(syn).survival_function_at_times(grid).round(4).tolist()
    return out


def build_payload(metrics: pd.DataFrame, terms: pd.DataFrame, seed: int = 0, max_rows: int = 2000
                  ) -> dict[str, Any]:
    specs = {r["label"]: ex.GeneratorSpec(r["generator"], json.loads(r["params"]) if isinstance(r.get("params"), str)
                                          else {})
             for r in metrics.drop_duplicates("label").to_dict("records")}
    payload: dict[str, Any] = {"version": __version__, "seeds": int(metrics["seed"].nunique()),
                               "replicas": len(metrics), "datasets": {}, "summary": _summary(metrics),
                               "km": {}, "forest": {}}
    for name in metrics["dataset"].unique():
        d = datasets.load(name)
        payload["datasets"][name] = {"title": d.title, "n": d.n, "events": int(d.data["event"].astype(int).sum()),
                                     "citation": d.citation, "note": d.note}
        payload["km"][name] = _km_payload(name, specs, seed, max_rows)
        sel = terms[(terms["dataset"] == name) & (terms["seed"] == seed) & (terms["analysis"] == "combined")]
        payload["forest"][name] = {
            label: [{"term": r["term"], "real": [r["coef_real"], r["lower_real"], r["upper_real"]],
                     "syn": [r["coef_syn"], r["lower_syn"], r["upper_syn"]],
                     "changed": bool(r["decision_changed"]), "overlap": r["ci_overlap"]}
                    for r in g.to_dict("records")]
            for label, g in sel.groupby("label", sort=False)
        }
    return _clean(payload)


STANDALONE_HEAD = ('<!doctype html>\n<html lang="es">\n<head>\n<meta charset="utf-8">\n'
                   '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
                   '<meta name="description" content="S.Y.N.A.P.S.E.: validez inferencial y riesgo de reidentificación '
                   'de datos sanitarios sintéticos.">\n</head>\n<body>\n')


def render_page(payload: dict[str, Any], standalone: bool = True) -> str:
    """HTML final. ``standalone`` añade doctype/head/body (GitHub Pages, doble clic); sin él, el
    fragmento sirve para plataformas que ya envuelven la página."""
    pkg = resources.files("synapse")
    template = pkg.joinpath("site_template.html").read_text(encoding="utf-8")
    icons = pkg.joinpath("lucide_icons.json").read_text(encoding="utf-8")
    data = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    icons = json.dumps(json.loads(icons), ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    body = template.replace("__SYNAPSE_DATA__", data).replace("__SYNAPSE_ICONS__", icons)
    return f"{STANDALONE_HEAD}{body}\n</body>\n</html>\n" if standalone else body


def build_site(tables: Path, out: Path, seed: int = 0, standalone: bool = True) -> Path:
    paths = sorted(tables.glob("study_metrics*.csv"))
    if not paths:
        raise FileNotFoundError(f"no hay resultados en {tables}: ejecuta antes `synapse study`")
    metrics = pd.concat([pd.read_csv(p) for p in paths], ignore_index=True)
    terms = pd.concat([pd.read_csv(p) for p in sorted(tables.glob("study_terms*.csv"))], ignore_index=True)
    payload = build_payload(metrics, terms, seed=seed)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(render_page(payload, standalone), encoding="utf-8")
    return out
