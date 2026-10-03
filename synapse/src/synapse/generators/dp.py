"""Cópula gaussiana con privacidad diferencial (DPCopula-Kendall).

Basado en Li H, Xiong L, Jiang X. *Differentially Private Synthesization of Multi-Dimensional Data
using Copula Functions*. EDBT 2014. Implementación propia con estas decisiones, todas conservadoras:

* Modelo de vecindad **acotado** (se sustituye un registro; ``n`` es público).
* Presupuesto: ε/2 para las marginales y ε/2 para las correlaciones, repartido a partes iguales
  entre columnas y pares (composición secuencial).
* Marginales: histogramas sobre **límites públicos** (``Schema.bounds``), con ruido de Laplace de
  sensibilidad 2 (sustituir un registro mueve una unidad de un recipiente a otro).
* Correlación: τ de Kendall con desempates aleatorios independientes de los datos; sensibilidad
  4/n (cambiar un registro altera como mucho n−1 de los n(n−1)/2 pares). ρ = sin(πτ/2) y proyección
  a la matriz de correlación definida positiva más cercana (posprocesado: no consume presupuesto).
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from scipy import stats

from synapse.generators.base import Generator
from synapse.generators.classic import nearest_correlation


class DPCopulaGenerator(Generator):
    name = "dpcopula"
    family = "privacidad diferencial"
    private = True

    def __init__(self, seed: int = 0, epsilon: float = 1.0, bins: int = 32) -> None:
        super().__init__(seed)
        if epsilon <= 0:
            raise ValueError("epsilon debe ser > 0")
        self.epsilon = epsilon
        self.bins = bins

    @property
    def label(self) -> str:
        return f"dpcopula(ε={self.epsilon:g})"

    def _codes(self, df: pd.DataFrame, c: str) -> tuple[np.ndarray, np.ndarray]:
        """Devuelve (índice de recipiente por fila, bordes o categorías) usando solo información pública."""
        assert self.schema is not None
        if self.schema.is_categorical(c):
            cats = np.array(self.schema.categorical[c])
            return pd.Categorical(df[c].astype(str), categories=list(cats)).codes.astype(int), cats
        if c not in self.schema.bounds:
            raise ValueError(f"la columna numérica '{c}' necesita límites públicos para privacidad diferencial")
        lo, hi = self.schema.bounds[c]
        edges = np.linspace(lo, hi, self.bins + 1)
        idx = np.clip(np.searchsorted(edges, df[c].to_numpy(float), side="right") - 1, 0, self.bins - 1)
        return idx, edges

    def _fit(self, df: pd.DataFrame) -> None:
        assert self.schema is not None
        cols = self.schema.columns
        d, n = len(cols), len(df)
        eps_marg, eps_corr = self.epsilon / 2, self.epsilon / 2
        n_pairs = max(d * (d - 1) // 2, 1)
        self._cols = cols
        self._support: dict[str, np.ndarray] = {}
        self._probs: dict[str, np.ndarray] = {}
        ranks = []
        for c in cols:
            idx, support = self._codes(df, c)
            k = len(support) if self.schema.is_categorical(c) else self.bins
            counts = np.bincount(idx, minlength=k).astype(float)
            noisy = counts + self.rng.laplace(0.0, 2.0 / (eps_marg / d), size=k)
            p = np.clip(noisy, 0, None)
            p = p / p.sum() if p.sum() > 0 else np.full(k, 1 / k)
            self._support[c], self._probs[c] = support, p
            ranks.append(idx + self.rng.uniform(size=n))  # desempate aleatorio independiente de los datos
        r = np.eye(d)
        scale = (4.0 / n) / (eps_corr / n_pairs)
        for i in range(d):
            for j in range(i + 1, d):
                tau = stats.kendalltau(ranks[i], ranks[j]).statistic
                tau = float(np.clip(tau + self.rng.laplace(0.0, scale), -1, 1))
                r[i, j] = r[j, i] = np.sin(np.pi * tau / 2)
        self._corr = nearest_correlation(r)

    def _sample(self, n: int) -> pd.DataFrame:
        assert self.schema is not None
        u = stats.norm.cdf(self.rng.multivariate_normal(np.zeros(len(self._cols)), self._corr, size=n))
        out: dict[str, object] = {}
        for j, c in enumerate(self._cols):
            cum = np.cumsum(self._probs[c])
            k = np.minimum(np.searchsorted(cum, u[:, j], side="right"), len(cum) - 1)
            if self.schema.is_categorical(c):
                out[c] = self._support[c][k]
            else:
                edges = self._support[c]
                out[c] = edges[k] + self.rng.uniform(size=n) * (edges[k + 1] - edges[k])
        return pd.DataFrame(out)
