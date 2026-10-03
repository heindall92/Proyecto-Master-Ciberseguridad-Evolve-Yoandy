"""Utilidad general de los datos sintéticos: parecido estadístico y capacidad predictiva.

* **Univariante** — estadístico de Kolmogorov-Smirnov (numéricas) y distancia de variación total
  (categóricas): 0 = distribuciones idénticas, 1 = disjuntas.
* **Bivariante** — diferencia media absoluta entre matrices de asociación (ρ de Spearman,
  V de Cramér y razón de correlación η para pares mixtos).
* **Multivariante** — pMSE (Woo MJ, Reiter JP, Oganian A, Karr AF. J Priv Confid. 2009;1(1):111-24) y su
  cociente frente al valor esperado bajo la hipótesis nula de igualdad de distribuciones
  (Snoke J, Raab GM, Nowok B, Dibben C, Slavkovic A. *General and specific utility measures for
  synthetic data*. J R Stat Soc A. 2018;181(3):663-88). Un cociente ≈ 1 indica que un clasificador
  no distingue reales de sintéticos mejor que el azar.
* **Predictiva** — TSTR («train synthetic, test real», Esteban et al., 2017): se entrena un Cox con
  sintéticos y se evalúa en pacientes reales no vistos (índice C de Harrell y Brier integrado),
  frente a TRTR (entrenar con reales).
"""
from __future__ import annotations

import warnings
from itertools import combinations

import numpy as np
import pandas as pd
from lifelines import CoxPHFitter
from lifelines.utils import concordance_index
from scipy import stats
from sklearn.linear_model import LogisticRegression
from sksurv.metrics import integrated_brier_score

from synapse.datasets import EVENT, TIME, ClinicalDataset, Schema
from synapse.inference import design_matrix

# ─── Univariante ─────────────────────────────────────────────────────────────


def univariate(real: pd.DataFrame, syn: pd.DataFrame, schema: Schema) -> pd.DataFrame:
    rows = []
    for c in schema.columns:
        if schema.is_categorical(c):
            levels = sorted(set(real[c].astype(str)) | set(syn[c].astype(str)))
            p = real[c].astype(str).value_counts(normalize=True).reindex(levels, fill_value=0.0).to_numpy(float)
            q = syn[c].astype(str).value_counts(normalize=True).reindex(levels, fill_value=0.0).to_numpy(float)
            stat = 0.5 * float(np.abs(p - q).sum())
            rows.append({"column": c, "type": "categórica", "metric": "TVD", "value": stat})
        else:
            stat = float(stats.ks_2samp(real[c].astype(float), syn[c].astype(float)).statistic)
            rows.append({"column": c, "type": "numérica", "metric": "KS", "value": stat})
    return pd.DataFrame(rows)


# ─── Bivariante ──────────────────────────────────────────────────────────────


def _cramers_v(a: pd.Series, b: pd.Series) -> float:
    table = pd.crosstab(a.astype(str), b.astype(str)).to_numpy()
    if min(table.shape) < 2:
        return 0.0
    chi2 = stats.chi2_contingency(table, correction=False)[0]
    return float(np.sqrt(chi2 / (table.sum() * (min(table.shape) - 1))))


def _eta(cat: pd.Series, num: pd.Series) -> float:
    y = num.astype(float).to_numpy()
    groups = [y[(cat.astype(str) == level).to_numpy()] for level in cat.astype(str).unique()]
    ss_tot = float(((y - y.mean()) ** 2).sum())
    if ss_tot == 0:
        return 0.0
    ss_between = sum(len(g) * (g.mean() - y.mean()) ** 2 for g in groups if len(g))
    return float(np.sqrt(ss_between / ss_tot))


def associations(df: pd.DataFrame, schema: Schema) -> pd.DataFrame:
    cols = schema.columns
    m = pd.DataFrame(np.eye(len(cols)), index=cols, columns=cols)
    for a, b in combinations(cols, 2):
        ca, cb = schema.is_categorical(a), schema.is_categorical(b)
        if ca and cb:
            v = _cramers_v(df[a], df[b])
        elif not ca and not cb:
            v = float(stats.spearmanr(df[a].astype(float), df[b].astype(float)).statistic)
            v = 0.0 if np.isnan(v) else v
        else:
            v = _eta(df[a], df[b]) if ca else _eta(df[b], df[a])
        m.loc[a, b] = m.loc[b, a] = v
    return m


def bivariate(real: pd.DataFrame, syn: pd.DataFrame, schema: Schema) -> tuple[float, pd.DataFrame]:
    diff = (associations(real, schema) - associations(syn, schema)).abs()
    upper = diff.to_numpy()[np.triu_indices(len(diff), k=1)]
    return float(upper.mean()), diff


# ─── Multivariante: pMSE ─────────────────────────────────────────────────────


def _one_hot(df: pd.DataFrame, schema: Schema) -> np.ndarray:
    parts = []
    for c in schema.columns:
        if schema.is_categorical(c):
            values = df[c].astype(str)
            for level in schema.categorical[c][1:]:
                parts.append((values == level).to_numpy(float))
        else:
            parts.append(df[c].to_numpy(float))
    return np.column_stack(parts)


def pmse(real: pd.DataFrame, syn: pd.DataFrame, schema: Schema) -> dict[str, float]:
    x = np.vstack([_one_hot(real, schema), _one_hot(syn, schema)])
    sd = x.std(axis=0)
    x = (x - x.mean(axis=0)) / np.where(sd > 0, sd, 1)
    y = np.r_[np.zeros(len(real)), np.ones(len(syn))]
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        prob = LogisticRegression(max_iter=2000, C=1e6).fit(x, y).predict_proba(x)[:, 1]
    c = len(syn) / len(y)
    value = float(np.mean((prob - c) ** 2))
    k = x.shape[1] + 1  # parámetros del modelo logístico, incluida la constante
    expected = (k - 1) * (1 - c) ** 2 * c / len(y)
    return {"pmse": value, "pmse_ratio": value / expected}


# ─── Predictiva: TSTR ────────────────────────────────────────────────────────


def _surv_array(df: pd.DataFrame) -> np.ndarray:
    return np.array(list(zip(df[EVENT].astype(int).astype(bool), df[TIME].astype(float), strict=True)),
                    dtype=[("event", bool), ("time", float)])


def _cox_predict(train: pd.DataFrame, test: pd.DataFrame, censor_ref: pd.DataFrame, ds: ClinicalDataset,
                 grid: np.ndarray) -> tuple[float, float]:
    """Entrena Cox con ``train`` y evalúa en ``test``. La distribución de censura del Brier (IPCW)
    se estima siempre con datos reales (``censor_ref``), para que TSTR y TRTR sean comparables."""
    xtr, xte = design_matrix(train, ds), design_matrix(test, ds)
    usable = [c for c in xtr.columns if c not in (TIME, EVENT) and xtr[c].nunique() > 1]
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        cph = CoxPHFitter(penalizer=0.01).fit(xtr[[*usable, TIME, EVENT]], TIME, EVENT)
    risk = cph.predict_partial_hazard(xte[usable]).to_numpy()
    c_index = float(concordance_index(xte[TIME], -risk, xte[EVENT]))
    surv = cph.predict_survival_function(xte[usable], times=grid).T.to_numpy()
    ibs = float(integrated_brier_score(_surv_array(censor_ref), _surv_array(test), surv, grid))
    return c_index, ibs


def tstr(real_train: pd.DataFrame, syn: pd.DataFrame, real_test: pd.DataFrame, ds: ClinicalDataset
         ) -> dict[str, float]:
    """Índice C y Brier integrado en pacientes reales no vistos, entrenando con sintéticos (TSTR)
    y con reales (TRTR). La rejilla temporal se restringe al rango observable en todos los conjuntos."""
    hi = min(np.quantile(real_test[TIME], 0.8), real_train[TIME].max()) - 1
    lo = max(real_test[TIME].min(), 1.0)
    grid = np.linspace(lo, hi, 50) if hi > lo else np.array([lo])
    censor_ref = pd.concat([real_train, real_test], ignore_index=True)  # cubre todos los tiempos de test
    c_syn, ibs_syn = _cox_predict(syn, real_test, censor_ref, ds, grid)
    c_real, ibs_real = _cox_predict(real_train, real_test, censor_ref, ds, grid)
    return {"cindex_tstr": c_syn, "cindex_trtr": c_real, "ibs_tstr": ibs_syn, "ibs_trtr": ibs_real,
            "cindex_gap": c_real - c_syn}
