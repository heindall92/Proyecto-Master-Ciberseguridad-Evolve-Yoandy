from __future__ import annotations

import math

import pandas as pd
import pytest

from synapse import compliance, datasets, generators, privacy
from synapse import experiment as ex


@pytest.fixture(scope="module")
def syns(gbsg2: datasets.ClinicalDataset, gbsg2_split: tuple[pd.DataFrame, pd.DataFrame]) -> dict[str, pd.DataFrame]:
    tr, _ = gbsg2_split
    return {g: generators.make(g, seed=0).fit(tr, gbsg2.schema).sample(len(tr)) for g in ("bootstrap", "marginal")}


def test_bootstrap_is_caught_by_every_attack(gbsg2: datasets.ClinicalDataset, gbsg2_split, syns) -> None:  # type: ignore[no-untyped-def]
    tr, ho = gbsg2_split
    r = privacy.evaluate_privacy(tr, ho, syns["bootstrap"], gbsg2, seed=0)
    assert r["exact_match_rate"] == 1.0
    assert r["dcr_share_train"] > 0.95
    assert r["mia_dist_auc"] > 0.75
    assert r["singling_out_risk"] > 0.5 and r["linkability_risk"] > 0.3


def test_marginal_is_safe(gbsg2: datasets.ClinicalDataset, gbsg2_split, syns) -> None:  # type: ignore[no-untyped-def]
    tr, ho = gbsg2_split
    r = privacy.evaluate_privacy(tr, ho, syns["marginal"], gbsg2, seed=0)
    assert r["exact_match_rate"] < 0.01
    assert 0.4 < r["mia_dist_auc"] < 0.6
    assert r["linkability_risk"] < 0.1


def test_mia_on_self_is_random(gbsg2: datasets.ClinicalDataset, gbsg2_split) -> None:  # type: ignore[no-untyped-def]
    """Si los «sintéticos» son el holdout (no miembros), el ataque no puede distinguir: AUC ≈ 0,5."""
    tr, ho = gbsg2_split
    res = privacy.mia_distance(tr, ho, ho.sample(frac=1, random_state=1), gbsg2.schema)
    assert res.auc < 0.5  # el holdout está más cerca de sí mismo: los no miembros puntúan más


def test_gower_encoder_distance(gbsg2: datasets.ClinicalDataset) -> None:
    enc = privacy.GowerEncoder(gbsg2.schema, gbsg2.data)
    a = gbsg2.data.iloc[[0]].copy()
    b = a.copy()
    b["horTh"] = "yes" if a["horTh"].iloc[0] == "no" else "no"
    d = abs(enc(a) - enc(b)).sum()
    assert d == pytest.approx(1 / len(gbsg2.schema.columns))


@pytest.mark.parametrize("value,green,amber,hib,expected", [
    (0.05, 0.1, 0.3, False, "verde"), (0.2, 0.1, 0.3, False, "ámbar"), (0.5, 0.1, 0.3, False, "rojo"),
    (0.6, 0.5, 0.3, True, "verde"), (0.4, 0.5, 0.3, True, "ámbar"), (0.1, 0.5, 0.3, True, "rojo"),
    (math.nan, 0.1, 0.3, False, "ámbar"),
])
def test_grade(value: float, green: float, amber: float, hib: bool, expected: str) -> None:
    assert compliance.grade(value, green, amber, hib) == expected


def test_verdict_privacy_dominates() -> None:
    perfect_utility = {"ci_overlap_mean": 1, "decisions_changed": 0, "km_mean_abs_diff": 0, "pmse_ratio": 1,
                       "cindex_gap": 0}
    leaky = {"exact_match_rate": 1.0, "mia_dist_auc": 0.9}
    v = compliance.verdict({**perfect_utility, **leaky})
    assert v.color == "rojo" and v.privacy_level == "rojo" and v.utility_level == "verde"
    assert "NO LIBERAR" in v.recommendation
    safe = {"exact_match_rate": 0, "mia_dist_auc": 0.5, "mia_dens_auc": 0.5, "singling_out_risk": 0,
            "linkability_risk": 0, "inference_risk": 0}
    assert compliance.verdict({**perfect_utility, **safe}).color == "verde"


def test_config_thresholds_cover_all_verdict_metrics() -> None:
    cfg = compliance.load_config()
    assert set(cfg["thresholds"]) == {"privacy", "utility"}
    assert len(cfg["study"]["seeds"]) == 10


def test_evaluate_end_to_end(veterans: datasets.ClinicalDataset) -> None:
    ev = ex.evaluate(veterans, ex.GeneratorSpec("copula"), seed=0, m=2, n_attacks=50)
    for key in ("comb_ci_overlap_mean", "mia_dist_auc", "singling_out_risk", "cindex_tstr", "verdict"):
        assert key in ev.metrics
    assert ev.verdict.color in compliance.LEVELS
    assert set(ev.terms["analysis"]) == {"single", "combined"}
    assert len(ev.train) + len(ev.holdout) == veterans.n


def test_run_study_and_summary() -> None:
    metrics, terms = ex.run_study(["veterans"], [ex.GeneratorSpec("marginal")], [0, 1], workers=1,
                                  progress=False, m=2, n_attacks=30)
    assert len(metrics) == 2 and not terms.empty
    s = ex.summarize(metrics)
    assert "verde_%" in s and " ± " in s["mia_dist_auc"].iloc[0]


def test_subsample() -> None:
    d = ex.subsample(datasets.load("flchain"), 500)
    assert d.n == 500 and d.schema.validate(d.data) == []


def test_rare_secret_is_skipped() -> None:
    d = datasets.load("veterans")
    tr, ho = datasets.split_train_holdout(d.data, 0)
    rare = tr.copy()
    rare["prior_therapy"] = "no"
    rare.loc[0, "prior_therapy"] = "yes"  # 1/68 < 5 %
    syn = generators.make("marginal", seed=0).fit(tr, d.schema).sample(len(tr))
    r = privacy.anonymeter_risks(rare, ho, syn, d, n_attacks=30)
    assert math.isnan(r["inference_prior_therapy_risk"])
    assert not math.isnan(r["inference_celltype_risk"])


def test_evaluation_is_bit_reproducible(veterans: datasets.ClinicalDataset) -> None:
    """Misma semilla → mismas métricas, incluido Anonymeter (ver privacy._deterministic_singling_out)."""
    a = ex.evaluate(veterans, ex.GeneratorSpec("copula"), seed=4, m=2, n_attacks=60).metrics
    b = ex.evaluate(veterans, ex.GeneratorSpec("copula"), seed=4, m=2, n_attacks=60).metrics
    for k, v in a.items():
        if isinstance(v, float) and "seconds" not in k:
            assert (math.isnan(v) and math.isnan(b[k])) or v == b[k], k
