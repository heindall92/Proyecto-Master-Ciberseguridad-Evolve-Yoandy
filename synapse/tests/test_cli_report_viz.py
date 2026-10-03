from __future__ import annotations

import re
from pathlib import Path

import pandas as pd
import pytest
import yaml
from typer.testing import CliRunner

from synapse import compliance, datasets, viz
from synapse import experiment as ex
from synapse.cli import app
from synapse.report import release_report

runner = CliRunner()


@pytest.fixture(scope="module")
def tiny_config(tmp_path_factory: pytest.TempPathFactory) -> Path:
    cfg = compliance.load_config()
    cfg["study"].update({"m_synthetic": 2, "anonymeter_attacks": 30})
    cfg["generators"] = [{"name": "marginal"}, {"name": "dpcopula", "params": {"epsilon": 1.0}},
                         {"name": "dpcopula", "params": {"epsilon": 10.0}}]
    path = tmp_path_factory.mktemp("cfg") / "study.yaml"
    path.write_text(yaml.safe_dump(cfg, allow_unicode=True), encoding="utf-8")
    return path


def test_list_commands() -> None:
    r = runner.invoke(app, ["datasets"])
    assert r.exit_code == 0 and "gbsg2" in r.output and "n=686" in r.output
    r = runner.invoke(app, ["generators"])
    assert r.exit_code == 0 and "dpcopula" in r.output


def test_generate(tmp_path: Path) -> None:
    out = tmp_path / "s.csv"
    r = runner.invoke(app, ["generate", "veterans", "dpcopula", "--epsilon", "2", "-n", "40", "-o", str(out)])
    assert r.exit_code == 0, r.output
    df = pd.read_csv(out)
    assert len(df) == 40


def test_evaluate_with_report_and_json(tmp_path: Path) -> None:
    rep = tmp_path / "informe.html"
    r = runner.invoke(app, ["evaluate", "veterans", "bootstrap", "--m", "2", "--json", "--report", str(rep)])
    assert r.exit_code == 0, r.output
    assert "Veredicto: ROJO" in r.output and '"exact_match_rate": 1.0' in r.output
    html = rep.read_text(encoding="utf-8")
    assert "NO LIBERAR" in html and "data:image/png;base64," in html and "DATOS SINTÉTICOS" in html


def test_study_then_figures(tmp_path: Path, tiny_config: Path) -> None:
    tables, figs = tmp_path / "tables", tmp_path / "figures"
    r = runner.invoke(app, ["study", "--seeds", "2", "--workers", "1", "--dataset", "veterans",
                            "--config", str(tiny_config), "--out", str(tables)])
    assert r.exit_code == 0, r.output
    metrics = pd.read_csv(tables / "study_metrics.csv")
    assert len(metrics) == 6 and set(metrics["verdict"]) <= set(compliance.LEVELS)
    r = runner.invoke(app, ["figures", "--tables", str(tables), "--out", str(figs)])
    assert r.exit_code == 0, r.output
    produced = {p.name for p in figs.glob("*.png")}
    assert {"fig_semaforo.png", "fig_epsilon.png", "fig_pareto_veterans.png", "fig_km_veterans.png"} <= produced


def test_figures_without_results(tmp_path: Path) -> None:
    r = runner.invoke(app, ["figures", "--tables", str(tmp_path)])
    assert r.exit_code != 0


def test_forest_marks_changed_conclusions(tmp_path: Path) -> None:
    ds = datasets.load("veterans")
    ev = ex.evaluate(ds, ex.GeneratorSpec("dpcopula", {"epsilon": 0.5}), seed=0, m=2, n_attacks=30)
    single = ev.terms[ev.terms["analysis"] == "single"]
    fig = viz.forest(single, "prueba")
    texts = [t.get_text() for t in fig.axes[0].texts]
    assert (single["decision_changed"].sum() > 0) == ("conclusión cambiada" in texts)
    assert viz.save(fig, tmp_path / "f.png").stat().st_size > 10_000
    assert release_report(ds, ev, tmp_path / "r.html").exists()


def test_privacy_risk_index_bounds() -> None:
    df = pd.DataFrame({"mia_dist_auc": [0.5, 1.0, 0.3], "singling_out_risk": [0, 0.2, 0.1]})
    idx = viz.privacy_risk_index(df)
    assert list(idx) == [0, 1.0, 0.1]


def test_site_is_self_contained(tmp_path: Path, tiny_config: Path) -> None:
    tables = tmp_path / "tables"
    assert runner.invoke(app, ["study", "--seeds", "2", "--workers", "1", "--dataset", "veterans",
                               "--config", str(tiny_config), "--out", str(tables)]).exit_code == 0
    out = tmp_path / "site" / "index.html"
    r = runner.invoke(app, ["site", "--tables", str(tables), "--out", str(out)])
    assert r.exit_code == 0, r.output
    html = out.read_text(encoding="utf-8")
    assert html.startswith("<!doctype html>") and "__SYNAPSE_" not in html
    # Autocontenido: ni scripts, ni hojas de estilo, ni imágenes cargadas de otro origen
    assert not re.search(r'<(script|link|img)[^>]+(src|href)="https?://', html)
    frag = tmp_path / "frag.html"
    assert runner.invoke(app, ["site", "--tables", str(tables), "--out", str(frag), "--fragment"]).exit_code == 0
    assert frag.read_text(encoding="utf-8").startswith("<title>")
    assert runner.invoke(app, ["site", "--tables", str(tmp_path / "nada")]).exit_code != 0
