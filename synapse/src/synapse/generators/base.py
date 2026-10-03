"""Interfaz común de los generadores de datos sintéticos."""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import ClassVar

import numpy as np
import pandas as pd

from synapse.datasets import Schema


class Generator(ABC):
    """Un generador se ajusta una vez con datos reales y después muestrea tantos registros como se pidan.

    Atributos de clase:
        name: identificador corto usado en configuración, CLI y resultados.
        family: familia metodológica (control, estadístico, aprendizaje profundo, privacidad diferencial).
        private: True si ofrece una garantía formal de privacidad diferencial.
    """

    name: ClassVar[str] = "base"
    family: ClassVar[str] = "base"
    private: ClassVar[bool] = False

    def __init__(self, seed: int = 0) -> None:
        self.seed = seed
        self.rng = np.random.default_rng(seed)
        self.schema: Schema | None = None

    def fit(self, df: pd.DataFrame, schema: Schema) -> Generator:
        self.schema = schema
        self._fit(schema.conform(df))
        return self

    def sample(self, n: int) -> pd.DataFrame:
        if self.schema is None:
            raise RuntimeError("llama a fit() antes de sample()")
        return self.schema.conform(self._sample(n))

    @property
    def label(self) -> str:
        return self.name

    @abstractmethod
    def _fit(self, df: pd.DataFrame) -> None: ...

    @abstractmethod
    def _sample(self, n: int) -> pd.DataFrame: ...


def inverse_ecdf(values: np.ndarray, u: np.ndarray) -> np.ndarray:
    """Cuantil empírico con interpolación lineal (inversa suavizada de la ECDF)."""
    sorted_vals = np.sort(np.asarray(values, dtype=float))
    grid = (np.arange(1, len(sorted_vals) + 1) - 0.5) / len(sorted_vals)
    return np.interp(u, grid, sorted_vals)
