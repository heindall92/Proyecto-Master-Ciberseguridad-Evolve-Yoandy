"""Conjuntos de datos clínicos reales y públicos, con su esquema.

Todos son estudios clásicos de bioestadística distribuidos con ``scikit-survival``
(no requieren descarga externa) y comparten el mismo formato tras cargarlos:

* columnas de covariables (numéricas o categóricas),
* ``time``  — tiempo de seguimiento en días (> 0),
* ``event`` — 1 si se observó el evento (muerte/recidiva), 0 si es censura por la derecha.

El esquema (``Schema``) declara tipos, categorías, enteros y **límites públicos**
(rangos clínicamente plausibles fijados *a priori*, no el mínimo/máximo observado).
Los límites públicos son necesarios para que el generador con privacidad diferencial
no filtre información a través del rango de los datos.
"""
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import pandas as pd

TIME, EVENT = "time", "event"


@dataclass(frozen=True)
class Schema:
    """Descripción tabular mínima que necesitan generadores, métricas y ataques."""

    numeric: tuple[str, ...]
    categorical: dict[str, tuple[str, ...]]
    integer: tuple[str, ...] = ()
    bounds: dict[str, tuple[float, float]] = field(default_factory=dict)

    @property
    def columns(self) -> list[str]:
        return [*self.numeric, *self.categorical]

    def is_categorical(self, col: str) -> bool:
        return col in self.categorical

    def conform(self, df: pd.DataFrame) -> pd.DataFrame:
        """Fuerza tipos, categorías, redondeo de enteros y límites públicos."""
        out = df[self.columns].copy()
        for c in self.numeric:
            out[c] = pd.to_numeric(out[c], errors="coerce").astype(float)
            if c in self.bounds:
                lo, hi = self.bounds[c]
                out[c] = out[c].clip(lo, hi)
            if c in self.integer:
                out[c] = out[c].round()
        for c, cats in self.categorical.items():
            out[c] = pd.Categorical(out[c].astype(str), categories=list(cats))
        return out

    def validate(self, df: pd.DataFrame) -> list[str]:
        """Devuelve la lista de problemas encontrados (vacía si el dataframe es válido)."""
        problems: list[str] = []
        missing = [c for c in self.columns if c not in df.columns]
        if missing:
            return [f"faltan columnas: {missing}"]
        for c in self.numeric:
            s = pd.to_numeric(df[c], errors="coerce")
            if s.isna().any():
                problems.append(f"{c}: valores no numéricos o ausentes")
            if c in self.bounds:
                lo, hi = self.bounds[c]
                if ((s < lo) | (s > hi)).any():
                    problems.append(f"{c}: valores fuera de [{lo}, {hi}]")
        for c, cats in self.categorical.items():
            bad = set(df[c].astype(str)) - set(cats)
            if bad:
                problems.append(f"{c}: categorías desconocidas {sorted(bad)}")
        if TIME in df and (pd.to_numeric(df[TIME], errors="coerce") <= 0).any():
            problems.append("time: debe ser > 0")
        if EVENT in df and not set(df[EVENT].astype(str)) <= {"0", "1"}:
            problems.append("event: debe ser binario 0/1")
        return problems


@dataclass(frozen=True)
class ClinicalDataset:
    """Dataset clínico listo para sintetizar, analizar y atacar."""

    name: str
    title: str
    data: pd.DataFrame
    schema: Schema
    cox_covariates: tuple[str, ...]
    reference_levels: dict[str, str]
    sensitive: tuple[str, ...]
    quasi_identifiers: tuple[str, ...]
    citation: str
    note: str = ""

    @property
    def covariates(self) -> list[str]:
        return [c for c in self.schema.columns if c not in (TIME, EVENT)]

    @property
    def n(self) -> int:
        return len(self.data)


def _finish(df: pd.DataFrame, schema: Schema) -> pd.DataFrame:
    df = df.reset_index(drop=True)
    df[TIME] = df[TIME].astype(float).clip(lower=1.0)  # seguimiento de 0 días → 1 día (Cox exige tiempos > 0)
    df[EVENT] = df[EVENT].astype(int).astype(str)
    out = schema.conform(df)
    problems = schema.validate(out)
    if problems:  # pragma: no cover - protege contra cambios en scikit-survival
        raise ValueError(f"dataset no válido: {problems}")
    return out


def _event_cats() -> dict[str, tuple[str, ...]]:
    return {EVENT: ("0", "1")}


def load_gbsg2() -> ClinicalDataset:
    from sksurv.datasets import load_gbsg2 as _load

    x, y = _load()
    df = x.copy()
    df[TIME], df[EVENT] = y["time"], y["cens"].astype(int)
    schema = Schema(
        numeric=("age", "tsize", "pnodes", "progrec", "estrec", TIME),
        categorical={
            "horTh": ("no", "yes"),
            "menostat": ("Pre", "Post"),
            "tgrade": ("I", "II", "III"),
            **_event_cats(),
        },
        integer=("age", "tsize", "pnodes", "progrec", "estrec", TIME),
        bounds={"age": (18, 100), "tsize": (1, 200), "pnodes": (0, 60), "progrec": (0, 3000),
                "estrec": (0, 2000), TIME: (1.0, 3650)},
    )
    return ClinicalDataset(
        name="gbsg2",
        title="GBSG2 — cáncer de mama con ganglios positivos (German Breast Cancer Study Group 2)",
        data=_finish(df, schema),
        schema=schema,
        cox_covariates=("horTh", "age", "menostat", "tsize", "tgrade", "pnodes", "progrec", "estrec"),
        reference_levels={"horTh": "no", "menostat": "Pre", "tgrade": "I"},
        sensitive=("horTh", "tgrade"),
        quasi_identifiers=("age", "menostat", "tsize"),
        citation=("Schumacher M, et al. Randomized 2x2 trial evaluating hormonal treatment and the duration "
                  "of chemotherapy in node-positive breast cancer patients. J Clin Oncol. 1994;12(10):2086-93."),
        note="Evento = recidiva o muerte (supervivencia libre de recidiva).",
    )


def load_whas500() -> ClinicalDataset:
    from sksurv.datasets import load_whas500 as _load

    x, y = _load()
    df = x.copy()
    df[TIME], df[EVENT] = y["lenfol"], y["fstat"].astype(int)
    binary = ("afb", "av3", "chf", "cvd", "gender", "miord", "mitype", "sho")
    schema = Schema(
        numeric=("age", "bmi", "diasbp", "hr", "los", "sysbp", TIME),
        categorical={**{b: ("0", "1") for b in binary}, **_event_cats()},
        integer=("age", "diasbp", "hr", "los", "sysbp", TIME),
        bounds={"age": (18, 110), "bmi": (10, 60), "diasbp": (0, 250), "hr": (20, 250), "los": (0, 120),
                "sysbp": (40, 300), TIME: (1.0, 3650)},
    )
    return ClinicalDataset(
        name="whas500",
        title="WHAS500 — infarto agudo de miocardio (Worcester Heart Attack Study)",
        data=_finish(df, schema),
        schema=schema,
        cox_covariates=("age", "gender", "hr", "bmi", "chf", "afb", "sho", "mitype"),
        reference_levels={b: "0" for b in binary},
        sensitive=("chf", "cvd"),
        quasi_identifiers=("age", "gender", "bmi"),
        citation=("Hosmer DW, Lemeshow S, May S. Applied Survival Analysis: Regression Modeling of "
                  "Time-to-Event Data. 2nd ed. Wiley; 2008."),
        note="Evento = muerte por cualquier causa tras el infarto.",
    )


def load_flchain() -> ClinicalDataset:
    from sksurv.datasets import load_flchain as _load

    x, y = _load()
    df = x.copy()
    df[TIME], df[EVENT] = y["futime"], y["death"].astype(int)
    # 'chapter' es la causa de muerte: información posterior al desenlace (fuga del outcome) → se elimina.
    # 'creatinine' tiene 1350 ausentes → análisis de casos completos (documentado en metodología).
    df = df.drop(columns=["chapter"]).dropna(subset=["creatinine"])
    df = df.rename(columns={"flc.grp": "flc_grp", "sample.yr": "sample_yr"})
    df["sample_yr"] = df["sample_yr"].astype(int)
    schema = Schema(
        numeric=("age", "creatinine", "kappa", "lambda", "sample_yr", TIME),
        categorical={"sex": ("F", "M"), "mgus": ("no", "yes"),
                     "flc_grp": tuple(str(i) for i in range(1, 11)), **_event_cats()},
        integer=("age", "sample_yr", TIME),
        bounds={"age": (18, 110), "creatinine": (0.1, 15), "kappa": (0, 50), "lambda": (0, 50),
                "sample_yr": (1995, 2003), TIME: (1.0, 6000)},
    )
    return ClinicalDataset(
        name="flchain",
        title="FLCHAIN — cadenas ligeras libres en suero y mortalidad (Olmsted County, Clínica Mayo)",
        data=_finish(df, schema),
        schema=schema,
        cox_covariates=("age", "sex", "creatinine", "kappa", "lambda", "mgus"),
        reference_levels={"sex": "F", "mgus": "no"},
        sensitive=("flc_grp", "sex"),  # mgus (1,5 % «sí») es demasiado raro: ver privacy.MIN_SECRET_PREVALENCE
        quasi_identifiers=("age", "sex", "sample_yr"),
        citation=("Dispenzieri A, et al. Use of nonclonal serum immunoglobulin free light chains to predict "
                  "overall survival in the general population. Mayo Clin Proc. 2012;87(6):517-23."),
        note="Se excluye 'chapter' (causa de muerte, posterior al desenlace) y los casos sin creatinina.",
    )


def load_veterans() -> ClinicalDataset:
    from sksurv.datasets import load_veterans_lung_cancer as _load

    x, y = _load()
    df = x.rename(columns={"Age_in_years": "age", "Celltype": "celltype", "Karnofsky_score": "karnofsky",
                           "Months_from_Diagnosis": "months_dx", "Prior_therapy": "prior_therapy",
                           "Treatment": "treatment"}).copy()
    df[TIME], df[EVENT] = y["Survival_in_days"], y["Status"].astype(int)
    schema = Schema(
        numeric=("age", "karnofsky", "months_dx", TIME),
        categorical={"celltype": ("adeno", "large", "smallcell", "squamous"), "prior_therapy": ("no", "yes"),
                     "treatment": ("standard", "test"), **_event_cats()},
        integer=("age", "karnofsky", "months_dx", TIME),
        bounds={"age": (18, 100), "karnofsky": (0, 100), "months_dx": (0, 120), TIME: (1.0, 1500)},
    )
    return ClinicalDataset(
        name="veterans",
        title="VA Lung Cancer — ensayo de la Veterans Administration en cáncer de pulmón",
        data=_finish(df, schema),
        schema=schema,
        cox_covariates=("treatment", "celltype", "karnofsky", "months_dx", "age", "prior_therapy"),
        reference_levels={"treatment": "standard", "celltype": "squamous", "prior_therapy": "no"},
        sensitive=("celltype", "prior_therapy"),
        quasi_identifiers=("age", "treatment", "karnofsky"),
        citation=("Kalbfleisch JD, Prentice RL. The Statistical Analysis of Failure Time Data. Wiley; 1980."),
        note="Muestra muy pequeña (n=137): caso extremo de riesgo de reidentificación.",
    )


LOADERS: dict[str, Callable[[], ClinicalDataset]] = {
    "gbsg2": load_gbsg2,
    "whas500": load_whas500,
    "flchain": load_flchain,
    "veterans": load_veterans,
}


def load(name: str) -> ClinicalDataset:
    try:
        return LOADERS[name]()
    except KeyError as exc:
        raise KeyError(f"dataset desconocido '{name}'. Disponibles: {sorted(LOADERS)}") from exc


def from_csv(path: str | Path, *, time: str, event: str, categorical: list[str] | None = None,
             name: str = "custom", sensitive: list[str] | None = None,
             quasi_identifiers: list[str] | None = None, max_categories: int = 20) -> ClinicalDataset:
    """Carga un CSV propio (p. ej., desde el panel). Las columnas no numéricas o con pocas
    modalidades se tratan como categóricas. Los límites se fijan al rango observado: en datos
    propios el usuario debe sustituirlos por límites públicos si va a usar privacidad diferencial."""
    raw = pd.read_csv(path)
    df = raw.rename(columns={time: TIME, event: EVENT}).dropna().copy()
    categorical = list(categorical or [])
    for c in df.columns:
        if c in (TIME, EVENT) or c in categorical:
            continue
        if not pd.api.types.is_numeric_dtype(df[c]) or df[c].nunique() <= 2:
            categorical.append(c)
    numeric = [c for c in df.columns if c not in categorical and c not in (EVENT,)]
    cats = {c: tuple(sorted(df[c].astype(str).unique())) for c in categorical}
    if any(len(v) > max_categories for v in cats.values()):
        raise ValueError(f"alguna columna categórica supera {max_categories} modalidades")
    cats[EVENT] = ("0", "1")
    integer = tuple(c for c in numeric if np.allclose(df[c], df[c].round()))
    bounds = {c: (float(df[c].min()), float(df[c].max())) for c in numeric}
    bounds[TIME] = (1.0, max(bounds[TIME][1], 1.0))
    schema = Schema(numeric=tuple(numeric), categorical=cats, integer=integer, bounds=bounds)
    df[EVENT] = df[EVENT].astype(int)
    covs = tuple(c for c in schema.columns if c not in (TIME, EVENT))
    return ClinicalDataset(
        name=name, title=f"Dataset propio ({Path(path).name})", data=_finish(df, schema), schema=schema,
        cox_covariates=covs,
        reference_levels={c: v[0] for c, v in cats.items() if c != EVENT},
        sensitive=tuple(sensitive or [c for c in categorical if c != EVENT][:1]),
        quasi_identifiers=tuple(quasi_identifiers or list(covs)[:3]),
        citation="Datos aportados por el usuario.",
    )


def split_train_holdout(df: pd.DataFrame, seed: int, frac: float = 0.5) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Partición aleatoria estratificada por evento. ``train`` alimenta al generador (miembros);
    ``holdout`` nunca lo ve (no miembros: referencia de los ataques de pertenencia)."""
    rng = np.random.default_rng(seed)
    train_idx: list[int] = []
    for _, g in df.groupby(EVENT, observed=True):
        idx = g.index.to_numpy().copy()
        rng.shuffle(idx)
        train_idx.extend(idx[: int(round(len(idx) * frac))])
    train_mask = df.index.isin(train_idx)
    return df[train_mask].reset_index(drop=True), df[~train_mask].reset_index(drop=True)
