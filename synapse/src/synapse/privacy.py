"""Riesgo de reidentificación: atacamos los datos sintéticos como lo haría un adversario.

Protocolo (común a todos los ataques):
    * ``train``   — pacientes reales con los que se entrenó el generador (los «miembros»).
    * ``holdout`` — pacientes reales del mismo origen que el generador **nunca** vio (no miembros).
      Es el grupo de control: lo que el atacante acierte sobre ``holdout`` es inferencia
      poblacional legítima; solo el **exceso** de acierto sobre ``train`` es fuga de privacidad.

Ataques implementados:

1. **Distancia al registro más cercano (DCR)** y tasa de copias exactas.
2. **Inferencia de pertenencia por distancia** (Hayes et al., LOGAN, PoPETs 2019; Chen et al.,
   GAN-Leaks, CCS 2020): cuanto más cerca está un paciente de algún sintético, más probable es
   que estuviera en el entrenamiento. Se informa del AUC y del TPR con FPR = 10 %
   (Carlini et al., *Membership Inference Attacks From First Principles*, IEEE S&P 2022).
3. **Inferencia de pertenencia por cociente de densidades** al estilo DOMIAS (van Breugel et al.,
   AISTATS 2023): sobreajuste local = densidad sintética alta respecto a la densidad poblacional.
4. **Los tres criterios del Dictamen 05/2014 del Grupo de Trabajo del Artículo 29 (WP216)**
   con Anonymeter (Giomi et al., *A Unified Framework for Quantifying Privacy Risk in Synthetic
   Data*, PoPETs 2023): *singling out* (individualización), *linkability* (vinculación) e
   *inference* (inferencia de un atributo sensible).
"""
from __future__ import annotations

import logging
import warnings
from dataclasses import dataclass
from typing import Any

import numpy as np
import pandas as pd
from sklearn.metrics import roc_auc_score, roc_curve
from sklearn.neighbors import KernelDensity, NearestNeighbors

from synapse.datasets import ClinicalDataset, Schema

logging.getLogger("anonymeter").setLevel(logging.ERROR)

#: Prevalencia mínima de la clase minoritaria de un secreto categórico. Por debajo, el riesgo de
#: inferencia de Anonymeter, (éxito_train − éxito_control) / (1 − éxito_control), divide por un
#: número casi nulo (adivinar siempre la mayoritaria ya acierta ~98 %) y se vuelve inestable:
#: en el piloto, el muestreo de marginales, que no puede filtrar nada, daba riesgo 0,24 (IC hasta
#: 0,92) sobre «mgus» (1,5 % de «sí»). Esos secretos se omiten y se informa de ello.
MIN_SECRET_PREVALENCE = 0.05


# ─── Codificación tipo Gower ─────────────────────────────────────────────────


class GowerEncoder:
    """Transforma filas en vectores cuya distancia L1 / p es la distancia de Gower:
    numéricas escaladas por su rango (público si existe) y categóricas en one-hot × 0,5
    (dos categorías distintas suman 1)."""

    def __init__(self, schema: Schema, reference: pd.DataFrame) -> None:
        self.schema = schema
        self.ranges = {}
        for c in schema.numeric:
            lo, hi = schema.bounds.get(c, (float(reference[c].min()), float(reference[c].max())))
            self.ranges[c] = (lo, max(hi - lo, 1e-9))
        self.p = len(schema.columns)

    def __call__(self, df: pd.DataFrame) -> np.ndarray:
        parts: list[np.ndarray] = []
        for c in self.schema.columns:
            if self.schema.is_categorical(c):
                values = df[c].astype(str).to_numpy()
                parts.extend(0.5 * (values == level).astype(float) for level in self.schema.categorical[c])
            else:
                lo, width = self.ranges[c]
                parts.append((df[c].to_numpy(float) - lo) / width)
        return np.column_stack(parts) / self.p


def _nn(reference: np.ndarray, query: np.ndarray, k: int = 1) -> np.ndarray:
    nn = NearestNeighbors(n_neighbors=k, metric="manhattan").fit(reference)
    return nn.kneighbors(query)[0]


# ─── 1. DCR y copias exactas ─────────────────────────────────────────────────


def dcr(train: pd.DataFrame, holdout: pd.DataFrame, syn: pd.DataFrame, schema: Schema) -> dict[str, float]:
    """``dcr_share_train``: fracción de sintéticos cuyo vecino más cercano está en ``train`` y no en
    ``holdout`` (con tamaños iguales, lo ideal es ≈ 0,5; cerca de 1 indica memorización)."""
    enc = GowerEncoder(schema, train)
    xs, xt, xh = enc(syn), enc(train), enc(holdout)
    d_train = _nn(xt, xs, k=2)
    d_hold = _nn(xh, xs, k=1)[:, 0]
    closer = (d_train[:, 0] < d_hold).mean() + 0.5 * (d_train[:, 0] == d_hold).mean()
    nndr = d_train[:, 0] / np.where(d_train[:, 1] > 0, d_train[:, 1], np.nan)
    # Corrección por tamaños distintos: con |train| ≠ |holdout| el valor neutro es |train|/(|train|+|holdout|)
    neutral = len(train) / (len(train) + len(holdout))
    return {
        "exact_match_rate": float((d_train[:, 0] < 1e-12).mean()),
        "dcr_share_train": float(closer),
        "dcr_share_excess": float(closer - neutral),
        "dcr_median_train": float(np.median(d_train[:, 0])),
        "dcr_median_holdout": float(np.median(d_hold)),
        "nndr_median": float(np.nanmedian(nndr)) if np.isfinite(nndr).any() else float("nan"),
    }


# ─── 2 y 3. Inferencia de pertenencia ────────────────────────────────────────


@dataclass(frozen=True)
class MIAResult:
    auc: float
    tpr_at_10fpr: float
    advantage: float  # máx(TPR − FPR): ventaja del adversario (Yeom et al., CSF 2018)

    def as_dict(self, prefix: str) -> dict[str, float]:
        return {f"{prefix}_auc": self.auc, f"{prefix}_tpr@10fpr": self.tpr_at_10fpr,
                f"{prefix}_advantage": self.advantage}


def _score_result(member_scores: np.ndarray, non_member_scores: np.ndarray) -> MIAResult:
    y = np.r_[np.ones(len(member_scores)), np.zeros(len(non_member_scores))]
    s = np.r_[member_scores, non_member_scores]
    fpr, tpr, _ = roc_curve(y, s)
    return MIAResult(auc=float(roc_auc_score(y, s)),
                     tpr_at_10fpr=float(np.interp(0.10, fpr, tpr)),
                     advantage=float(np.max(tpr - fpr)))


def _balanced(train: pd.DataFrame, holdout: pd.DataFrame, rng: np.random.Generator
              ) -> tuple[pd.DataFrame, pd.DataFrame]:
    k = min(len(train), len(holdout))
    return (train.iloc[rng.choice(len(train), k, replace=False)],
            holdout.iloc[rng.choice(len(holdout), k, replace=False)])


def mia_distance(train: pd.DataFrame, holdout: pd.DataFrame, syn: pd.DataFrame, schema: Schema,
                 seed: int = 0) -> MIAResult:
    rng = np.random.default_rng(seed)
    members, non_members = _balanced(train, holdout, rng)
    enc = GowerEncoder(schema, train)
    xs = enc(syn)
    score_m = -_nn(xs, enc(members))[:, 0]
    score_n = -_nn(xs, enc(non_members))[:, 0]
    return _score_result(score_m, score_n)


def mia_density(train: pd.DataFrame, holdout: pd.DataFrame, syn: pd.DataFrame, schema: Schema,
                seed: int = 0) -> MIAResult:
    """Cociente de densidades p_sint(x) / p_ref(x). La mitad del ``holdout`` hace de muestra de
    referencia de la población (conocimiento auxiliar del atacante) y la otra mitad, de no miembros."""
    rng = np.random.default_rng(seed)
    perm = rng.permutation(len(holdout))
    ref, non_members = holdout.iloc[perm[: len(perm) // 2]], holdout.iloc[perm[len(perm) // 2:]]
    members = train.iloc[rng.choice(len(train), min(len(train), len(non_members)), replace=False)]
    enc = GowerEncoder(schema, train)
    xs, xr = enc(syn), enc(ref)
    # Ancho de banda: mediana de la distancia al vecino más cercano en la referencia (heurística robusta)
    bw = float(np.median(_nn(xr, xr, k=2)[:, 1])) or 1e-3
    kde_s = KernelDensity(bandwidth=bw, kernel="gaussian").fit(xs)
    kde_r = KernelDensity(bandwidth=bw, kernel="gaussian").fit(xr)

    def score(x: np.ndarray) -> np.ndarray:
        return kde_s.score_samples(x) - kde_r.score_samples(x)

    return _score_result(score(enc(members)), score(enc(non_members)))


# ─── 4. Anonymeter: los tres criterios del WP29 ──────────────────────────────


def _as_objects(df: pd.DataFrame, schema: Schema) -> pd.DataFrame:
    out = df[schema.columns].copy()
    for c in schema.categorical:
        out[c] = out[c].astype(str)
    return out.reset_index(drop=True)


def _deterministic_singling_out() -> None:
    """Hace reproducible el ataque de individualización de Anonymeter.

    ``univariate_singling_out_queries`` construye la lista de valores raros con ``group_by`` de
    polars, cuyo orden de salida no está garantizado; después la baraja con la semilla del
    evaluador. Como el orden de partida cambia entre ejecuciones, las consultas también cambiaban
    (en el piloto, la misma réplica daba riesgos de 0,03 a 0,13). Se envuelve la función para
    ordenar el DataFrame de entrada: polars mantiene entonces un orden estable y el algoritmo de
    Anonymeter queda intacto (licencia Clear BSD).
    """
    import polars as pl
    from anonymeter.evaluators import singling_out_evaluator as so

    if getattr(so.univariate_singling_out_queries, "_synapse_stable", False):
        return
    original = so.univariate_singling_out_queries

    def stable(df: pl.DataFrame, n_queries: int, rng: np.random.Generator) -> list[pl.Expr]:
        ordered = df.sort(df.columns, nulls_last=True, maintain_order=True)
        real_group_by = pl.DataFrame.group_by

        def group_by_stable(self: Any, *by: Any, **kw: Any) -> Any:
            kw.setdefault("maintain_order", True)
            return real_group_by(self, *by, **kw)

        pl.DataFrame.group_by = group_by_stable  # type: ignore[method-assign]
        try:
            return original(ordered, n_queries, rng)
        finally:
            pl.DataFrame.group_by = real_group_by  # type: ignore[method-assign]

    stable._synapse_stable = True  # type: ignore[attr-defined]
    so.univariate_singling_out_queries = stable


def anonymeter_risks(train: pd.DataFrame, holdout: pd.DataFrame, syn: pd.DataFrame, ds: ClinicalDataset,
                     n_attacks: int = 200, seed: int = 0) -> dict[str, float]:
    """Riesgo = exceso de éxito del ataque sobre ``train`` frente a ``holdout``, normalizado
    (0 = sin fuga; 1 = el atacante acierta siempre). Se informa del valor y del límite superior
    del IC al 95 %."""
    from anonymeter.evaluators import InferenceEvaluator, LinkabilityEvaluator, SinglingOutEvaluator

    _deterministic_singling_out()

    ori, ctl, sy = (_as_objects(x, ds.schema) for x in (train, holdout, syn))
    n_attacks = int(min(n_attacks, len(ctl), len(ori)))
    out: dict[str, float] = {}

    def record(name: str, evaluator: object) -> None:
        risk = evaluator.risk()  # type: ignore[attr-defined]
        out[f"{name}_risk"] = float(risk.value)
        out[f"{name}_risk_hi"] = float(risk.ci[1])

    # Anonymeter usa el generador aleatorio global de NumPy (muestreo de objetivos y de consultas):
    # se fija aquí para que cada réplica sea reproducible bit a bit.
    np.random.seed(seed)  # noqa: NPY002 - Anonymeter lee el generador global
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        so = SinglingOutEvaluator(ori=ori, syn=sy, control=ctl, n_attacks=n_attacks, seed=seed)
        try:
            so.evaluate(mode="univariate")
            record("singling_out", so)
        except RuntimeError:  # no se encontró ninguna consulta válida: riesgo no medible
            out["singling_out_risk"] = out["singling_out_risk_hi"] = float("nan")

        cols = [c for c in ds.schema.columns]
        half = len(cols) // 2
        aux = (cols[:half], cols[half:])
        lk = LinkabilityEvaluator(ori=ori, syn=sy, control=ctl, aux_cols=aux, n_attacks=n_attacks,
                                  n_neighbors=10)
        lk.evaluate(n_jobs=1)
        record("linkability", lk)

        inference: list[float] = []
        inference_hi: list[float] = []
        for secret in ds.sensitive:
            if ds.schema.is_categorical(secret):
                prevalence = ori[secret].value_counts(normalize=True)
                if len(prevalence) < 2 or prevalence.min() < MIN_SECRET_PREVALENCE:
                    out[f"inference_{secret}_risk"] = float("nan")  # secreto demasiado raro: no evaluable
                    continue
            aux_cols = [c for c in ds.schema.columns if c != secret]
            ie = InferenceEvaluator(ori=ori, syn=sy, control=ctl, aux_cols=aux_cols, secret=secret,
                                    n_attacks=n_attacks, regression=not ds.schema.is_categorical(secret))
            ie.evaluate(n_jobs=1)
            r = ie.risk()
            out[f"inference_{secret}_risk"] = float(r.value)
            inference.append(float(r.value))
            inference_hi.append(float(r.ci[1]))
        out["inference_risk"] = float(np.max(inference)) if inference else float("nan")
        out["inference_risk_hi"] = float(np.max(inference_hi)) if inference_hi else float("nan")
    return out


def evaluate_privacy(train: pd.DataFrame, holdout: pd.DataFrame, syn: pd.DataFrame, ds: ClinicalDataset,
                     seed: int = 0, n_attacks: int = 200, anonymeter: bool = True) -> dict[str, float]:
    res: dict[str, float] = {}
    res.update(dcr(train, holdout, syn, ds.schema))
    res.update(mia_distance(train, holdout, syn, ds.schema, seed).as_dict("mia_dist"))
    res.update(mia_density(train, holdout, syn, ds.schema, seed).as_dict("mia_dens"))
    if anonymeter:
        res.update(anonymeter_risks(train, holdout, syn, ds, n_attacks=n_attacks, seed=seed))
    return res
