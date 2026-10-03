"""Línea de órdenes: ``synapse --help``.

Ejemplos:
    synapse datasets
    synapse generate gbsg2 cart -o sintetico.csv
    synapse evaluate gbsg2 cart --report informe.html
    synapse study --seeds 10 --workers 4
    synapse figures
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Annotated

import pandas as pd
import typer

from synapse import compliance, datasets, generators, viz
from synapse import experiment as ex

app = typer.Typer(help="S.Y.N.A.P.S.E. — datos sanitarios sintéticos: validez inferencial y riesgo de reidentificación.",
                  no_args_is_help=True, add_completion=False)

RESULTS = Path("results")


def _params(epsilon: float | None) -> dict[str, float]:
    return {"epsilon": epsilon} if epsilon is not None else {}


@app.command("datasets")
def list_datasets() -> None:
    """Lista los datasets clínicos incluidos."""
    for name in datasets.LOADERS:
        d = datasets.load(name)
        events = int(d.data["event"].astype(int).sum())
        typer.echo(f"{name:<9} n={d.n:<5} eventos={events:<5} variables={len(d.covariates):<3} {d.title}")


@app.command("generators")
def list_generators() -> None:
    """Lista los generadores disponibles en este entorno."""
    for name in generators.available():
        g = generators.make(name)
        typer.echo(f"{name:<10} familia={g.family:<24} privacidad diferencial={'sí' if g.private else 'no'}")


@app.command()
def generate(dataset: str, generator: str,
             output: Annotated[Path, typer.Option("-o", "--output")] = Path("sintetico.csv"),
             n: Annotated[int | None, typer.Option("-n", "--n", help="Registros a generar (por defecto, n real)")] = None,
             epsilon: Annotated[float | None, typer.Option(help="ε para generadores DP")] = None,
             seed: int = 0) -> None:
    """Ajusta un generador con TODOS los pacientes reales y escribe un CSV sintético."""
    d = datasets.load(dataset)
    syn = generators.make(generator, seed=seed, **_params(epsilon)).fit(d.data, d.schema).sample(n or d.n)
    syn.to_csv(output, index=False)
    typer.echo(f"✓ {len(syn)} registros sintéticos → {output}")


@app.command()
def evaluate(dataset: str, generator: str,
             epsilon: Annotated[float | None, typer.Option(help="ε para generadores DP")] = None,
             seed: int = 0, m: int = 5,
             report: Annotated[Path | None, typer.Option(help="Ruta del informe HTML de liberación")] = None,
             as_json: Annotated[bool, typer.Option("--json", help="Imprime todas las métricas en JSON")] = False
             ) -> None:
    """Evalúa un generador sobre un dataset (una réplica) y emite el semáforo de liberación."""
    d = datasets.load(dataset)
    ev = ex.evaluate(d, ex.GeneratorSpec(generator, _params(epsilon)), seed, m=m)
    if as_json:
        typer.echo(json.dumps(ev.metrics, ensure_ascii=False, indent=2, default=float))
    v = ev.verdict
    typer.echo(f"\n{viz.STATUS_ICON[v.color]} Veredicto: {v.color.upper()} — {v.recommendation}")
    typer.echo(f"   privacidad: {v.privacy_level} · utilidad: {v.utility_level}")
    for c in v.failing():
        typer.echo(f"   {viz.STATUS_ICON[c.level]} {c.metric} = {c.value:.3f} (verde si "
                   f"{'≥' if c.higher_is_better else '≤'} {c.green})")
    if report:
        from synapse.report import release_report

        typer.echo(f"✓ informe → {release_report(d, ev, report)}")


@app.command()
def study(seeds: Annotated[int, typer.Option(help="Número de réplicas (semillas 0..N−1)")] = 10,
          workers: int = 4,
          dataset: Annotated[list[str] | None, typer.Option(help="Repetible; por defecto, todos")] = None,
          deep: Annotated[bool, typer.Option(help="Incluye generadores de synthcity (extra [deep])")] = False,
          config: Annotated[Path | None, typer.Option(help="YAML de configuración")] = None,
          out: Path = RESULTS / "tables") -> None:
    """Ejecuta el estudio completo y guarda métricas por réplica, términos de Cox y resumen."""
    cfg = compliance.load_config(config)
    st = cfg["study"]
    specs = [ex.GeneratorSpec.parse(g) for g in cfg["generators"]]
    if deep:
        specs += [ex.GeneratorSpec.parse(g) for g in cfg["deep_generators"]]
    names = dataset or cfg["datasets"]
    metrics, terms = ex.run_study(names, specs, range(seeds), max_rows=st["max_rows"], workers=workers,
                                  m=st["m_synthetic"], holdout_fraction=st["holdout_fraction"],
                                  n_attacks=st["anonymeter_attacks"], thresholds=cfg["thresholds"])
    out.mkdir(parents=True, exist_ok=True)
    suffix = "_deep" if deep else ""
    metrics.to_csv(out / f"study_metrics{suffix}.csv", index=False)
    terms.to_csv(out / f"study_terms{suffix}.csv", index=False)
    summary = ex.summarize(metrics)
    summary.to_csv(out / f"study_summary{suffix}.csv", index=False)
    typer.echo(f"✓ {len(metrics)} réplicas → {out}")
    typer.echo(summary[["dataset", "label", "comb_ci_overlap_mean", "mia_dist_auc", "singling_out_risk", "verde_%"]]
               .to_string(index=False))


@app.command()
def figures(tables: Path = RESULTS / "tables", out: Path = RESULTS / "figures", seed: int = 0) -> None:
    """Genera las figuras del paper a partir de los resultados del estudio."""
    paths = sorted(tables.glob("study_metrics*.csv"))
    if not paths:
        raise typer.BadParameter(f"no hay resultados en {tables}: ejecuta antes `synapse study`")
    metrics = pd.concat([pd.read_csv(p) for p in paths], ignore_index=True)
    terms = pd.concat([pd.read_csv(p) for p in sorted(tables.glob("study_terms*.csv"))], ignore_index=True)
    written = [viz.save(viz.verdict_map(metrics), out / "fig_semaforo.png"),
               viz.save(viz.epsilon_sweep(metrics), out / "fig_epsilon.png")]
    for name in metrics["dataset"].unique():
        written.append(viz.save(viz.pareto(metrics, name), out / f"fig_pareto_{name}.png"))
        d = datasets.load(name)
        train, _ = datasets.split_train_holdout(ex.subsample(d, 2000).data, seed)
        syns = {}
        for spec in ({"name": g} for g in ("bootstrap", "marginal", "copula", "cart")):
            syns[spec["name"]] = generators.make(spec["name"], seed=seed).fit(train, d.schema).sample(len(train))
        syns["dpcopula(ε=1)"] = generators.make("dpcopula", seed=seed, epsilon=1.0).fit(train, d.schema).sample(len(train))
        written.append(viz.save(viz.km_grid(train, syns, f"{name}: Kaplan-Meier real frente a sintético (semilla {seed})"),
                                out / f"fig_km_{name}.png"))
        sel = terms[(terms["dataset"] == name) & (terms["seed"] == seed) & (terms["analysis"] == "combined")]
        for label in ("cart", "copula"):
            t = sel[sel["label"] == label]
            if not t.empty:
                written.append(viz.save(viz.forest(t, f"{name} · {label}: HR real frente a sintético (m combinados)"),
                                        out / f"fig_forest_{name}_{label}.png"))
    for p in written:
        typer.echo(f"✓ {p}")


@app.command()
def site(tables: Path = RESULTS / "tables", out: Path = Path("site") / "index.html",
         fragment: Annotated[bool, typer.Option(help="Sin doctype/head/body (para plataformas que envuelven)")] = False
         ) -> None:
    """Construye el explorador web autocontenido (abrir con doble clic o publicar en GitHub Pages)."""
    from synapse.site import build_site

    try:
        path = build_site(tables, out, standalone=not fragment)
    except FileNotFoundError as exc:
        raise typer.BadParameter(str(exc)) from exc
    typer.echo(f"✓ explorador → {path} ({path.stat().st_size / 1024:,.0f} KB)")


if __name__ == "__main__":  # pragma: no cover
    app()
