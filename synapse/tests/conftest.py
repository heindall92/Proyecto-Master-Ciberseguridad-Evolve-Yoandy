from __future__ import annotations

import warnings

import pandas as pd
import pytest

from synapse import datasets

warnings.filterwarnings("ignore")


@pytest.fixture(scope="session")
def gbsg2() -> datasets.ClinicalDataset:
    return datasets.load("gbsg2")


@pytest.fixture(scope="session")
def veterans() -> datasets.ClinicalDataset:
    return datasets.load("veterans")


@pytest.fixture(scope="session")
def gbsg2_split(gbsg2: datasets.ClinicalDataset) -> tuple[pd.DataFrame, pd.DataFrame]:
    return datasets.split_train_holdout(gbsg2.data, seed=0)
