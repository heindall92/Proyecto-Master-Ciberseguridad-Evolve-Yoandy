"""Experimento completo: dataset × generador × semilla → métricas de utilidad, inferencia y privacidad.

Cada réplica:
    1. Parte los pacientes reales en ``train`` (lo ve el generador) y ``holdout`` (no lo ve).
    2. Ajusta el generador con ``train`` y extrae m sintéticos del mismo tamaño que ``train``.
    3. Mide la utilidad y la privacidad sobre el primer sintético, y la validez inferencial
       también sobre la combinación de los m sintéticos (reglas de Raab, Nowok y Dibben, 2016).
    4. Emite el veredicto del semáforo.

La referencia «real» para la validez inferencial es ``train``: el análisis que se habría hecho
con los datos que el generador sustituye.
"""
from __future__ import annotations

import json
import time
from collections.abc import Iterable
from concurrent.futures import ProcessPoolExecutor, as_completed
from dataclasses import dataclass, field
from typing import Any

import numpy as np
import pandas as pd

from synapse import compliance, generators, privacy, utility
from synapse import inference as inf
from synapse.datasets import ClinicalDataset, load, split_train_holdout


@dataclass(frozen=True)
class GeneratorSpec:
    name: str
    params: dict[str, Any] = field(default_factory=dict)

    @property
    def label(self) -> str:
        return generators.make(self.name, **self.params).label

    @classmethod
    def parse(cls, raw: dict[str, Any] | str) -> GeneratorSpec:
        if isinstance(raw, str):
            return cls(raw)
        return cls(raw["name"], dict(raw.get("params", {})))


@dataclass
class Evaluation:
    """Resultado de una réplica: métricas planas, tabla de Cox por término y datos sintéticos."""

    metrics: dict[str, Any]
    terms: pd.DataFrame
    synthetic: pd.DataFrame
    verdict: compliance.Verdict
    train: pd.DataFrame
    holdout: pd.DataFrame


def subsample(ds: ClinicalDataset, max_rows: int | None, seed: int = 12345) -> ClinicalDataset:
    if not max_rows or ds.n <= max_rows:
        return ds
    data = ds.data.sample(n=max_rows, random_state=seed).reset_index(drop=True)
    return ClinicalDataset(**{**ds.__dict__, "data": data})


def evaluate(ds: ClinicalDataset, spec: GeneratorSpec, seed: int, *, m: int = 5, holdout_fraction: float = 0.5,
             n_attacks: int = 200, anonymeter: bool = True, thresholds: dict[str, Any] | None = None
             ) -> Evaluation:
    t0 = time.perf_counter()
    train, holdout = split_train_holdout(ds.data, seed=seed, frac=1 - holdout_fraction)
    gen = generators.make(spec.name, seed=seed, **spec.params).fit(train, ds.schema)
    t_fit = time.perf_counter() - t0
    syns = [gen.sample(len(train)) for _ in range(m)]
    syn = syns[0]

    real_fit = inf.fit_cox(train, ds)
    syn_fits = [inf.fit_cox(s, ds) for s in syns]
    single = inf.compare_cox(real_fit, syn_fits[0])
    combined_fit = inf.combine_synthetic(syn_fits, n_real=len(train), n_syn=len(train))
    combined = inf.compare_cox(real_fit, combined_fit)

    metrics: dict[str, Any] = {"dataset": ds.name, "generator": spec.name, "label": gen.label,
                               "family": gen.family, "dp": gen.private,
                               "epsilon": spec.params.get("epsilon", np.nan), "seed": seed,
                               "params": json.dumps(spec.params, sort_keys=True),
                               "n_train": len(train), "n_holdout": len(holdout), "m": m}
    metrics["univariate_mean"] = float(utility.univariate(train, syn, ds.schema)["value"].mean())
    metrics["bivariate_mean"] = utility.bivariate(train, syn, ds.schema)[0]
    metrics.update(utility.pmse(train, syn, ds.schema))
    metrics.update(utility.tstr(train, syn, holdout, ds))
    metrics.update(inf.compare_km(train, syn).as_dict())
    metrics.update(inf.summarize_cox(single, real_fit))
    metrics.update({f"comb_{k}": v for k, v in inf.summarize_cox(combined, real_fit).items()})
    metrics.update(privacy.evaluate_privacy(train, holdout, syn, ds, seed=seed, n_attacks=n_attacks,
                                            anonymeter=anonymeter))
    v = compliance.verdict(metrics, thresholds)
    metrics.update({"verdict": v.color, "privacy_level": v.privacy_level, "utility_level": v.utility_level})
    metrics["fit_seconds"] = t_fit
    metrics["total_seconds"] = time.perf_counter() - t0

    terms = pd.concat({"single": single, "combined": combined}, names=["analysis"]).reset_index()
    combined_ci = combined_fit[["lower", "upper"]].rename(columns=lambda c: f"{c}_syn")
    terms = terms.merge(real_fit[["lower", "upper"]].rename(columns=lambda c: f"{c}_real"),
                        left_on="term", right_index=True)
    single_ci = syn_fits[0][["lower", "upper"]].rename(columns=lambda c: f"{c}_syn")
    terms[["lower_syn", "upper_syn"]] = np.where(
        (terms["analysis"] == "single").to_numpy()[:, None],
        single_ci.reindex(terms["term"]).to_numpy(), combined_ci.reindex(terms["term"]).to_numpy())
    for k in ("dataset", "generator", "label", "seed"):
        terms.insert(0, k, metrics[k])
    return Evaluation(metrics=metrics, terms=terms, synthetic=syn, verdict=v, train=train, holdout=holdout)


def _job(args: tuple[str, int | None, GeneratorSpec, int, dict[str, Any]]) -> tuple[dict[str, Any], pd.DataFrame]:
    name, max_rows, spec, seed, kw = args
    ds = subsample(load(name), max_rows)
    ev = evaluate(ds, spec, seed, **kw)
    return ev.metrics, ev.terms


def run_study(datasets: Iterable[str], specs: Iterable[GeneratorSpec], seeds: Iterable[int], *,
              max_rows: int | None = 2000, workers: int = 1, progress: bool = True, **kw: Any
              ) -> tuple[pd.DataFrame, pd.DataFrame]:
    jobs = [(d, max_rows, s, seed, kw) for d in datasets for s in specs for seed in seeds]
    rows: list[dict[str, Any]] = []
    terms: list[pd.DataFrame] = []
    t0 = time.perf_counter()

    def collect(i: int, result: tuple[dict[str, Any], pd.DataFrame]) -> None:
        rows.append(result[0])
        terms.append(result[1])
        if progress:
            r = result[0]
            print(f"[{i:>4}/{len(jobs)}] {r['dataset']:<9} {r['label']:<18} semilla={r['seed']:<2} "
                  f"→ {r['verdict']:<5} ({time.perf_counter() - t0:,.0f} s)", flush=True)

    if workers > 1:
        with ProcessPoolExecutor(max_workers=workers) as pool:
            futures = [pool.submit(_job, j) for j in jobs]
            for i, fut in enumerate(as_completed(futures), start=1):
                collect(i, fut.result())
    else:
        for i, j in enumerate(jobs, start=1):
            collect(i, _job(j))
    metrics = pd.DataFrame(rows).sort_values(["dataset", "generator", "epsilon", "seed"]).reset_index(drop=True)
    return metrics, pd.concat(terms, ignore_index=True)


def summarize(metrics: pd.DataFrame, columns: list[str] | None = None) -> pd.DataFrame:
    """Media ± error Monte Carlo (EE de la media entre semillas) por dataset y generador."""
    columns = columns or ["comb_ci_overlap_mean", "ci_overlap_mean", "decisions_changed", "km_mean_abs_diff",
                          "pmse_ratio", "cindex_tstr", "cindex_gap", "mia_dist_auc", "mia_dens_auc",
                          "dcr_share_excess", "exact_match_rate", "singling_out_risk", "linkability_risk",
                          "inference_risk"]
    columns = [c for c in columns if c in metrics]
    g = metrics.groupby(["dataset", "label"], sort=False)[columns]
    mean, se = g.mean(), g.std(ddof=1) / np.sqrt(g.count())
    out = mean.round(3).astype(str) + " ± " + se.round(3).astype(str)
    out["verde_%"] = metrics.groupby(["dataset", "label"], sort=False)["verdict"].apply(
        lambda s: round(100 * (s == "verde").mean()))
    return out.reset_index()
