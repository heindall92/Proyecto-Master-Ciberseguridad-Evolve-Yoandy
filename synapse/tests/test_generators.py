from __future__ import annotations

import numpy as np
import pandas as pd
import pytest
from hypothesis import given, settings
from hypothesis import strategies as st
from scipy import stats

from synapse import datasets, generators
from synapse.datasets import EVENT, TIME
from synapse.generators.base import inverse_ecdf
from synapse.generators.classic import nearest_correlation

CLASSIC = ["bootstrap", "marginal", "copula", "cart", "dpcopula"]


@pytest.mark.parametrize("name", CLASSIC)
@pytest.mark.parametrize("ds", ["gbsg2", "whas500", "veterans"])
def test_output_respects_schema(name: str, ds: str) -> None:
    d = datasets.load(ds)
    syn = generators.make(name, seed=1).fit(d.data, d.schema).sample(123)
    assert len(syn) == 123
    assert d.schema.validate(syn) == []
    assert (syn[TIME] > 0).all()
    assert set(syn[EVENT].astype(str)) <= {"0", "1"}


@pytest.mark.parametrize("name", CLASSIC)
def test_seed_reproducibility(name: str, gbsg2: datasets.ClinicalDataset) -> None:
    a = generators.make(name, seed=7).fit(gbsg2.data, gbsg2.schema).sample(50)
    b = generators.make(name, seed=7).fit(gbsg2.data, gbsg2.schema).sample(50)
    pd.testing.assert_frame_equal(a, b)


def test_sample_before_fit_fails() -> None:
    with pytest.raises(RuntimeError):
        generators.make("copula").sample(5)


def test_unknown_generator() -> None:
    with pytest.raises(KeyError):
        generators.make("magic")


def test_bootstrap_copies_real_rows(gbsg2: datasets.ClinicalDataset) -> None:
    syn = generators.make("bootstrap", seed=0).fit(gbsg2.data, gbsg2.schema).sample(100)
    real_rows = set(map(tuple, gbsg2.data.astype(str).to_numpy()))
    assert all(tuple(r) in real_rows for r in syn.astype(str).to_numpy())


def test_marginal_destroys_dependence(gbsg2: datasets.ClinicalDataset) -> None:
    syn = generators.make("marginal", seed=0).fit(gbsg2.data, gbsg2.schema).sample(5000)
    real_rho = stats.spearmanr(gbsg2.data["pnodes"], gbsg2.data[TIME]).statistic
    syn_rho = stats.spearmanr(syn["pnodes"], syn[TIME]).statistic
    assert abs(real_rho) > 0.15 and abs(syn_rho) < 0.05


def test_copula_preserves_rank_correlations(gbsg2: datasets.ClinicalDataset) -> None:
    syn = generators.make("copula", seed=0).fit(gbsg2.data, gbsg2.schema).sample(20000)
    cols = list(gbsg2.schema.numeric)
    real = gbsg2.data[cols].corr(method="spearman").to_numpy()
    synthetic = syn[cols].corr(method="spearman").to_numpy()
    assert np.max(np.abs(real - synthetic)) < 0.1


def test_cart_never_invents_values(gbsg2: datasets.ClinicalDataset) -> None:
    """Los donantes de hoja son valores reales: CART no crea valores nuevos (y por eso individualiza)."""
    syn = generators.make("cart", seed=0).fit(gbsg2.data, gbsg2.schema).sample(300)
    for c in gbsg2.schema.numeric:
        assert set(syn[c]) <= set(gbsg2.data[c])


def test_dpcopula_needs_positive_epsilon() -> None:
    with pytest.raises(ValueError):
        generators.make("dpcopula", epsilon=0)


def test_dpcopula_label_and_flag() -> None:
    g = generators.make("dpcopula", epsilon=0.5)
    assert g.private and g.label == "dpcopula(ε=0.5)"


def test_dpcopula_noise_shrinks_with_epsilon(gbsg2: datasets.ClinicalDataset) -> None:
    """Más ε → menos ruido → marginales más fieles (media de 5 semillas)."""

    def tvd(eps: float) -> float:
        out = []
        for seed in range(5):
            syn = generators.make("dpcopula", seed=seed, epsilon=eps).fit(gbsg2.data, gbsg2.schema).sample(2000)
            p = gbsg2.data["tgrade"].astype(str).value_counts(normalize=True)
            q = syn["tgrade"].astype(str).value_counts(normalize=True)
            out.append(0.5 * p.subtract(q, fill_value=0).abs().sum())
        return float(np.mean(out))

    assert tvd(50.0) < tvd(0.1)


@given(st.lists(st.floats(-1e3, 1e3, allow_nan=False), min_size=2, max_size=50),
       st.floats(0, 1))
@settings(max_examples=100, deadline=None)
def test_inverse_ecdf_stays_in_range(values: list[float], u: float) -> None:
    x = inverse_ecdf(np.array(values), np.array([u]))[0]
    assert min(values) - 1e-9 <= x <= max(values) + 1e-9


@given(st.integers(2, 6), st.integers(0, 1000))
@settings(max_examples=50, deadline=None)
def test_nearest_correlation_is_valid(d: int, seed: int) -> None:
    rng = np.random.default_rng(seed)
    a = rng.uniform(-1, 1, size=(d, d))
    r = nearest_correlation((a + a.T) / 2)
    assert np.allclose(np.diag(r), 1)
    assert np.allclose(r, r.T)
    assert np.linalg.eigvalsh(r).min() > -1e-9
