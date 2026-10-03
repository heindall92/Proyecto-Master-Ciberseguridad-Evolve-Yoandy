from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from synapse import datasets, generators, inference, utility
from synapse.datasets import EVENT


def test_cox_reproduces_published_gbsg2_effects(gbsg2: datasets.ClinicalDataset) -> None:
    """Schumacher et al. (1994): la hormonoterapia reduce el riesgo (HR ≈ 0,7); los ganglios lo aumentan."""
    fit = inference.fit_cox(gbsg2.data, gbsg2)
    assert np.exp(fit.loc["horTh[yes]", "coef"]) == pytest.approx(0.71, abs=0.03)
    assert fit.loc["horTh[yes]", "p"] < 0.01
    assert fit.loc["pnodes", "coef"] > 0 and fit.loc["pnodes", "p"] < 1e-6


def test_identical_data_gives_perfect_agreement(gbsg2: datasets.ClinicalDataset) -> None:
    fit = inference.fit_cox(gbsg2.data, gbsg2)
    cmp = inference.compare_cox(fit, fit)
    s = inference.summarize_cox(cmp, fit)
    assert s["ci_overlap_mean"] == pytest.approx(1.0)
    assert s["decisions_changed"] == 0 and s["sign_agree_pct"] == 100
    km = inference.compare_km(gbsg2.data, gbsg2.data)
    assert km.mean_abs_diff == pytest.approx(0) and km.rmst_diff == pytest.approx(0)


@pytest.mark.parametrize("bounds,expected", [
    ((0, 1, 0, 1), 1.0), ((0, 1, 2, 3), 0.0), ((0, 2, 1, 3), 0.5), ((0, 4, 1, 2), 0.5 * (1 / 4 + 1)),
])
def test_ci_overlap_known_values(bounds: tuple[float, float, float, float], expected: float) -> None:
    assert inference.ci_overlap(*bounds) == pytest.approx(expected)


def test_ci_overlap_handles_nan() -> None:
    assert inference.ci_overlap(np.nan, 1, 0, 1) == 0.0


def test_missing_category_marks_term_not_estimable(gbsg2: datasets.ClinicalDataset) -> None:
    df = gbsg2.data[gbsg2.data["tgrade"] != "III"]
    fit = inference.fit_cox(df, gbsg2)
    assert np.isnan(fit.loc["tgrade[III]", "coef"])
    cmp = inference.compare_cox(inference.fit_cox(gbsg2.data, gbsg2), fit)
    assert inference.summarize_cox(cmp)["terms_not_estimable"] == 1


def test_combining_rules_widen_interval(gbsg2: datasets.ClinicalDataset) -> None:
    gen = generators.make("copula", seed=0).fit(gbsg2.data, gbsg2.schema)
    fits = [inference.fit_cox(gen.sample(gbsg2.n), gbsg2) for _ in range(5)]
    comb = inference.combine_synthetic(fits, n_real=gbsg2.n, n_syn=gbsg2.n)
    mean_se = pd.concat([f["se"] for f in fits], axis=1).mean(axis=1)
    assert (comb["se"] > mean_se).all()  # T = v̄(1 + 1/m) > v̄
    assert np.allclose(comb["se"] ** 2, (pd.concat([f["se"] ** 2 for f in fits], axis=1).mean(axis=1)) * 1.2)


def test_utility_metrics_rank_controls_correctly(gbsg2: datasets.ClinicalDataset,
                                                 gbsg2_split: tuple[pd.DataFrame, pd.DataFrame]) -> None:
    tr, _ = gbsg2_split
    boot = generators.make("bootstrap", seed=0).fit(tr, gbsg2.schema).sample(len(tr))
    marg = generators.make("marginal", seed=0).fit(tr, gbsg2.schema).sample(len(tr))
    assert utility.bivariate(tr, boot, gbsg2.schema)[0] < utility.bivariate(tr, marg, gbsg2.schema)[0]
    assert utility.univariate(tr, tr, gbsg2.schema)["value"].max() == pytest.approx(0)


def test_pmse_detects_broken_generator(gbsg2: datasets.ClinicalDataset,
                                       gbsg2_split: tuple[pd.DataFrame, pd.DataFrame]) -> None:
    tr, _ = gbsg2_split
    good = generators.make("bootstrap", seed=0).fit(tr, gbsg2.schema).sample(len(tr))
    noisy = generators.make("dpcopula", seed=0, epsilon=0.1).fit(tr, gbsg2.schema).sample(len(tr))
    assert utility.pmse(tr, good, gbsg2.schema)["pmse_ratio"] < 3
    assert utility.pmse(tr, noisy, gbsg2.schema)["pmse_ratio"] > 10


def test_tstr_close_to_trtr_for_bootstrap(gbsg2: datasets.ClinicalDataset,
                                          gbsg2_split: tuple[pd.DataFrame, pd.DataFrame]) -> None:
    tr, ho = gbsg2_split
    boot = generators.make("bootstrap", seed=0).fit(tr, gbsg2.schema).sample(len(tr))
    r = utility.tstr(tr, boot, ho, gbsg2)
    assert 0.6 < r["cindex_trtr"] < 0.75
    assert abs(r["cindex_gap"]) < 0.03
    assert 0 < r["ibs_trtr"] < 0.25


def test_associations_symmetric(gbsg2: datasets.ClinicalDataset) -> None:
    m = utility.associations(gbsg2.data, gbsg2.schema)
    assert np.allclose(m.to_numpy(), m.to_numpy().T)
    assert ((m.abs() <= 1 + 1e-9).all()).all()
    assert m.loc[EVENT, EVENT] == 1
