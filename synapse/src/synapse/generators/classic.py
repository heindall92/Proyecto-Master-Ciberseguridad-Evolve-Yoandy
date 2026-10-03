"""Generadores de control y estadísticos (implementación propia, sin dependencias pesadas).

* ``bootstrap``  — control negativo de privacidad: remuestrea filas reales con reemplazo.
* ``marginal``   — control negativo de utilidad: cada columna se muestrea de forma independiente.
* ``copula``     — cópula gaussiana con transformación distribucional para variables discretas.
* ``cart``       — síntesis secuencial por árboles CART al estilo ``synthpop`` (Nowok, Raab y Dibben, 2016).
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from scipy import stats
from sklearn.tree import DecisionTreeClassifier, DecisionTreeRegressor

from synapse.datasets import EVENT, TIME
from synapse.generators.base import Generator, inverse_ecdf


class BootstrapGenerator(Generator):
    name = "bootstrap"
    family = "control"

    def _fit(self, df: pd.DataFrame) -> None:
        self._df = df.reset_index(drop=True)

    def _sample(self, n: int) -> pd.DataFrame:
        idx = self.rng.integers(0, len(self._df), size=n)
        return self._df.iloc[idx].reset_index(drop=True)


class MarginalGenerator(Generator):
    name = "marginal"
    family = "control"

    def _fit(self, df: pd.DataFrame) -> None:
        assert self.schema is not None
        self._num = {c: df[c].to_numpy(float) for c in self.schema.numeric}
        self._cat = {c: df[c].astype(str).value_counts(normalize=True) for c in self.schema.categorical}

    def _sample(self, n: int) -> pd.DataFrame:
        out: dict[str, object] = {}
        for c, vals in self._num.items():
            out[c] = inverse_ecdf(vals, self.rng.uniform(size=n))
        for c, p in self._cat.items():
            out[c] = self.rng.choice(p.index.to_numpy(), size=n, p=p.to_numpy())
        return pd.DataFrame(out)


def _distributional_transform(x: pd.Series, rng: np.random.Generator, categories: list[str] | None
                              ) -> np.ndarray:
    """U = F(x−) + V·[F(x) − F(x−)], V~U(0,1). Convierte cualquier variable (continua, entera o
    categórica codificada) en una uniforme exacta, rompiendo empates al azar (Rüschendorf, 2009)."""
    if categories is not None:
        codes = pd.Categorical(x.astype(str), categories=categories).codes.astype(float)
    else:
        codes = x.to_numpy(float)
    n = len(codes)
    sorted_codes = np.sort(codes)
    f_hi = np.searchsorted(sorted_codes, codes, side="right") / n
    f_lo = np.searchsorted(sorted_codes, codes, side="left") / n
    u = f_lo + rng.uniform(size=n) * (f_hi - f_lo)
    return np.clip(u, 1e-6, 1 - 1e-6)


def nearest_correlation(r: np.ndarray, eps: float = 1e-6) -> np.ndarray:
    """Proyección a la matriz de correlación definida positiva más cercana (recorte de autovalores)."""
    r = (r + r.T) / 2
    w, v = np.linalg.eigh(r)
    r = (v * np.clip(w, eps, None)) @ v.T
    d = np.sqrt(np.diag(r))
    r = r / np.outer(d, d)
    np.fill_diagonal(r, 1.0)
    return r


class GaussianCopulaGenerator(Generator):
    name = "copula"
    family = "estadístico"

    def _fit(self, df: pd.DataFrame) -> None:
        assert self.schema is not None
        self._cols = self.schema.columns
        z = np.column_stack([
            stats.norm.ppf(_distributional_transform(
                df[c], self.rng, list(self.schema.categorical[c]) if self.schema.is_categorical(c) else None))
            for c in self._cols
        ])
        self._corr = nearest_correlation(np.corrcoef(z, rowvar=False))
        self._num = {c: df[c].to_numpy(float) for c in self.schema.numeric}
        self._cum = {
            c: np.cumsum(df[c].astype(str).value_counts(normalize=True).reindex(list(cats), fill_value=0).to_numpy())
            for c, cats in self.schema.categorical.items()
        }

    def _sample(self, n: int) -> pd.DataFrame:
        assert self.schema is not None
        z = self.rng.multivariate_normal(np.zeros(len(self._cols)), self._corr, size=n)
        u = stats.norm.cdf(z)
        out: dict[str, object] = {}
        for j, c in enumerate(self._cols):
            if self.schema.is_categorical(c):
                cats = np.array(self.schema.categorical[c])
                idx = np.minimum(np.searchsorted(self._cum[c], u[:, j], side="right"), len(cats) - 1)
                out[c] = cats[idx]
            else:
                out[c] = inverse_ecdf(self._num[c], u[:, j])
        return pd.DataFrame(out)


class CartGenerator(Generator):
    """Síntesis secuencial: X1 ~ marginal; Xj | X1..Xj-1 ~ árbol CART con donantes de la hoja.

    El orden de visita deja ``event`` y ``time`` al final, de modo que el desenlace se sintetiza
    condicionado a todas las covariables (lo que preserva los efectos de Cox).
    """

    name = "cart"
    family = "estadístico"

    def __init__(self, seed: int = 0, min_samples_leaf: int = 5) -> None:
        super().__init__(seed)
        self.min_samples_leaf = min_samples_leaf

    def _encode(self, df: pd.DataFrame, cols: list[str]) -> np.ndarray:
        assert self.schema is not None
        mats = []
        for c in cols:
            if self.schema.is_categorical(c):
                mats.append(pd.Categorical(df[c].astype(str), categories=list(self.schema.categorical[c]))
                            .codes.astype(float))
            else:
                mats.append(df[c].to_numpy(float))
        return np.column_stack(mats)

    def _fit(self, df: pd.DataFrame) -> None:
        assert self.schema is not None
        covs = [c for c in self.schema.columns if c not in (EVENT, TIME)]
        self._order = [*covs, *(c for c in (EVENT, TIME) if c in self.schema.columns)]
        self._first = df[self._order[0]].to_numpy()
        self._models: list[tuple[str, DecisionTreeRegressor | DecisionTreeClassifier, dict[int, np.ndarray]]] = []
        for j in range(1, len(self._order)):
            target, prev = self._order[j], self._order[:j]
            x = self._encode(df, prev)
            y = df[target].astype(str).to_numpy() if self.schema.is_categorical(target) else df[target].to_numpy(float)
            tree: DecisionTreeRegressor | DecisionTreeClassifier = (
                DecisionTreeClassifier(min_samples_leaf=self.min_samples_leaf, random_state=self.seed)
                if self.schema.is_categorical(target)
                else DecisionTreeRegressor(min_samples_leaf=self.min_samples_leaf, random_state=self.seed)
            )
            tree.fit(x, y)
            leaves = tree.apply(x)
            donors = {int(leaf): y[leaves == leaf] for leaf in np.unique(leaves)}
            self._models.append((target, tree, donors))

    def _sample(self, n: int) -> pd.DataFrame:
        syn = pd.DataFrame({self._order[0]: self.rng.choice(self._first, size=n)})
        for j, (target, tree, donors) in enumerate(self._models, start=1):
            leaves = tree.apply(self._encode(syn, self._order[:j]))
            values = np.empty(n, dtype=object)
            for leaf in np.unique(leaves):
                mask = leaves == leaf
                values[mask] = self.rng.choice(donors[int(leaf)], size=int(mask.sum()))
            syn[target] = values
        return syn
