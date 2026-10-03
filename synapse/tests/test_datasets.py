from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from synapse import datasets
from synapse.datasets import EVENT, TIME


@pytest.mark.parametrize("name,n,events", [("gbsg2", 686, 299), ("whas500", 500, 215),
                                            ("flchain", 6524, 1962), ("veterans", 137, 128)])
def test_loaders_reproduce_published_sizes(name: str, n: int, events: int) -> None:
    d = datasets.load(name)
    assert d.n == n
    assert int(d.data[EVENT].astype(int).sum()) == events
    assert d.schema.validate(d.data) == []
    assert (d.data[TIME] > 0).all()


def test_flchain_drops_outcome_leak() -> None:
    d = datasets.load("flchain")
    assert "chapter" not in d.data.columns  # causa de muerte = posterior al desenlace


def test_unknown_dataset() -> None:
    with pytest.raises(KeyError):
        datasets.load("mimic")


def test_split_is_disjoint_stratified_and_reproducible(gbsg2: datasets.ClinicalDataset) -> None:
    tr, ho = datasets.split_train_holdout(gbsg2.data, seed=3)
    tr2, _ = datasets.split_train_holdout(gbsg2.data, seed=3)
    assert len(tr) + len(ho) == gbsg2.n
    pd.testing.assert_frame_equal(tr, tr2)
    rate = gbsg2.data[EVENT].astype(int).mean()
    assert abs(tr[EVENT].astype(int).mean() - rate) < 0.01
    assert abs(ho[EVENT].astype(int).mean() - rate) < 0.01


def test_schema_validation_catches_problems(gbsg2: datasets.ClinicalDataset) -> None:
    bad = gbsg2.data.copy()
    bad["horTh"] = bad["horTh"].astype(str)
    bad.loc[0, "horTh"] = "maybe"
    bad.loc[1, "age"] = 500
    bad[EVENT] = bad[EVENT].astype(str)
    bad.loc[2, EVENT] = "2"
    problems = " ".join(gbsg2.schema.validate(bad))
    assert "horTh" in problems and "age" in problems and "event" in problems
    assert gbsg2.schema.validate(bad.drop(columns=["age"])) == ["faltan columnas: ['age']"]


def test_from_csv_roundtrip(tmp_path, gbsg2: datasets.ClinicalDataset) -> None:  # type: ignore[no-untyped-def]
    raw = gbsg2.data.rename(columns={TIME: "dias", EVENT: "muerte"}).copy()
    raw["muerte"] = raw["muerte"].astype(int)
    path = tmp_path / "propio.csv"
    raw.to_csv(path, index=False)
    d = datasets.from_csv(path, time="dias", event="muerte")
    assert d.n == gbsg2.n
    assert set(d.schema.categorical) >= {"horTh", "menostat", "tgrade", EVENT}
    assert np.isclose(d.data[TIME].sum(), gbsg2.data[TIME].sum())
