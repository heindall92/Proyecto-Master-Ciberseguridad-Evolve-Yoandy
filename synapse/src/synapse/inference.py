"""Validez inferencial: ¿llevan los datos sintéticos a las mismas conclusiones clínicas que los reales?

Tres niveles de comparación entre el análisis con datos reales y con datos sintéticos:

1. **Curvas de supervivencia** (Kaplan-Meier): distancia media absoluta entre curvas, diferencia
   de la supervivencia media restringida (RMST) y de la mediana.
2. **Modelo de Cox**: para cada coeficiente, solapamiento de intervalos de confianza
   (Karr AF, Kohnen CN, Oganian A, Reiter JP, Sanil AP. *A framework for evaluating the utility of
   data altered to protect confidentiality*. Am Stat. 2006;60(3):224-32), concordancia de signo y
   de significación estadística, y diferencia estandarizada.
3. **Combinación de m conjuntos sintéticos** (Raab GM, Nowok B, Dibben C. *Practical data synthesis
   for large samples*. J Priv Confid. 2016;7(3):67-97): estimación puntual media y varianza
   T = v̄·(k/n + 1/m) para inferencia poblacional con síntesis simple (no «proper»), donde k es el
   tamaño de cada sintético y n el del original.
"""
from __future__ import annotations

import warnings
from dataclasses import dataclass

import numpy as np
import pandas as pd
from lifelines import CoxPHFitter, KaplanMeierFitter
from lifelines.exceptions import ConvergenceError, ConvergenceWarning
from lifelines.statistics import logrank_test
from lifelines.utils import restricted_mean_survival_time
from scipy import stats

from synapse.datasets import EVENT, TIME, ClinicalDataset

Z95 = float(stats.norm.ppf(0.975))


# ─── Kaplan-Meier ────────────────────────────────────────────────────────────

def kaplan_meier(df: pd.DataFrame, label: str = "KM") -> KaplanMeierFitter:
    return KaplanMeierFitter(label=label).fit(df[TIME].astype(float), df[EVENT].astype(int))


def _step(km: KaplanMeierFitter, grid: np.ndarray) -> np.ndarray:
    return km.survival_function_at_times(grid).to_numpy()


@dataclass(frozen=True)
class KMComparison:
    tau: float
    mean_abs_diff: float
    max_abs_diff: float
    rmst_real: float
    rmst_syn: float
    median_real: float
    median_syn: float
    logrank_p: float

    @property
    def rmst_diff(self) -> float:
        return self.rmst_syn - self.rmst_real

    def as_dict(self) -> dict[str, float]:
        return {"km_tau": self.tau, "km_mean_abs_diff": self.mean_abs_diff, "km_max_abs_diff": self.max_abs_diff,
                "rmst_real": self.rmst_real, "rmst_syn": self.rmst_syn, "rmst_diff": self.rmst_diff,
                "median_real": self.median_real, "median_syn": self.median_syn, "logrank_p": self.logrank_p}


def compare_km(real: pd.DataFrame, syn: pd.DataFrame, tau: float | None = None) -> KMComparison:
    """Compara curvas KM en [0, τ]. Por defecto τ = percentil 90 de los tiempos reales: más allá
    quedan muy pocos pacientes en riesgo y la curva es inestable."""
    tau = float(tau if tau is not None else np.quantile(real[TIME].astype(float), 0.9))
    km_r, km_s = kaplan_meier(real, "real"), kaplan_meier(syn, "sintético")
    grid = np.linspace(0, tau, 400)
    diff = np.abs(_step(km_r, grid) - _step(km_s, grid))
    lr = logrank_test(real[TIME].astype(float), syn[TIME].astype(float),
                      real[EVENT].astype(int), syn[EVENT].astype(int))
    return KMComparison(
        tau=tau,
        mean_abs_diff=float(diff.mean()),  # rejilla uniforme: media = integral / τ
        max_abs_diff=float(diff.max()),
        rmst_real=float(restricted_mean_survival_time(km_r, t=tau)),
        rmst_syn=float(restricted_mean_survival_time(km_s, t=tau)),
        median_real=float(km_r.median_survival_time_),
        median_syn=float(km_s.median_survival_time_),
        logrank_p=float(lr.p_value),
    )


# ─── Modelo de Cox ───────────────────────────────────────────────────────────

def design_matrix(df: pd.DataFrame, ds: ClinicalDataset) -> pd.DataFrame:
    """Matriz de diseño con codificación de referencia fija (la misma para real y sintético)."""
    cols: dict[str, pd.Series] = {}
    for c in ds.cox_covariates:
        if ds.schema.is_categorical(c):
            ref = ds.reference_levels[c]
            values = df[c].astype(str)
            for level in ds.schema.categorical[c]:
                if level != ref:
                    cols[f"{c}[{level}]"] = (values == level).astype(float)
        else:
            cols[c] = df[c].astype(float)
    out = pd.DataFrame(cols, index=df.index)
    out[TIME] = df[TIME].astype(float)
    out[EVENT] = df[EVENT].astype(int)
    return out


def terms(ds: ClinicalDataset) -> list[str]:
    return [c for c in design_matrix(ds.data.head(1), ds).columns if c not in (TIME, EVENT)]


def fit_cox(df: pd.DataFrame, ds: ClinicalDataset) -> pd.DataFrame:
    """Ajusta Cox y devuelve una fila por término (coef = log-HR). Los términos que no se pueden
    estimar (columna constante en el sintético, p. ej. una categoría que no aparece) quedan como NaN:
    eso también es una pérdida de validez inferencial y se contabiliza como tal."""
    x = design_matrix(df, ds)
    all_terms = [c for c in x.columns if c not in (TIME, EVENT)]
    usable = [c for c in all_terms if x[c].nunique() > 1]
    result = pd.DataFrame(index=pd.Index(all_terms, name="term"),
                          columns=["coef", "se", "lower", "upper", "p"], dtype=float)
    if not usable or x[EVENT].sum() < 2:
        return result
    for penalizer in (0.0, 1e-4, 1e-2):
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("ignore", ConvergenceWarning)
                warnings.simplefilter("ignore", RuntimeWarning)
                cph = CoxPHFitter(penalizer=penalizer).fit(x[[*usable, TIME, EVENT]], TIME, EVENT)
            break
        except (ConvergenceError, np.linalg.LinAlgError, ValueError):
            continue
    else:
        return result
    s = cph.summary
    result.loc[usable, "coef"] = s["coef"].to_numpy()
    result.loc[usable, "se"] = s["se(coef)"].to_numpy()
    result.loc[usable, "lower"] = s["coef lower 95%"].to_numpy()
    result.loc[usable, "upper"] = s["coef upper 95%"].to_numpy()
    result.loc[usable, "p"] = s["p"].to_numpy()
    return result


def ci_overlap(l1: float, u1: float, l2: float, u2: float) -> float:
    """Solapamiento de intervalos de Karr et al. (2006): 1 = idénticos, 0 = disjuntos."""
    if any(np.isnan(v) for v in (l1, u1, l2, u2)) or u1 <= l1 or u2 <= l2:
        return 0.0
    inter = max(0.0, min(u1, u2) - max(l1, l2))
    return 0.5 * (inter / (u1 - l1) + inter / (u2 - l2))


def compare_cox(real_fit: pd.DataFrame, syn_fit: pd.DataFrame, alpha: float = 0.05) -> pd.DataFrame:
    """Tabla término a término: real frente a sintético."""
    out = pd.DataFrame(index=real_fit.index)
    out["coef_real"], out["coef_syn"] = real_fit["coef"], syn_fit["coef"]
    out["hr_real"], out["hr_syn"] = np.exp(real_fit["coef"]), np.exp(syn_fit["coef"])
    r_lo, r_hi = real_fit["lower"].to_numpy(float), real_fit["upper"].to_numpy(float)
    s_lo = syn_fit["lower"].reindex(real_fit.index).to_numpy(float)
    s_hi = syn_fit["upper"].reindex(real_fit.index).to_numpy(float)
    out["ci_overlap"] = [ci_overlap(*bounds) for bounds in zip(r_lo, r_hi, s_lo, s_hi, strict=True)]
    out["sign_agree"] = (np.sign(real_fit["coef"]) == np.sign(syn_fit["coef"])) & syn_fit["coef"].notna()
    sig_r, sig_s = real_fit["p"] < alpha, syn_fit["p"] < alpha
    out["signif_agree"] = (sig_r == sig_s) & syn_fit["p"].notna()
    out["std_diff"] = (syn_fit["coef"] - real_fit["coef"]) / real_fit["se"]
    # «Decisión clínica cambiada»: el efecto real era significativo y el sintético lo pierde o lo invierte.
    out["decision_changed"] = sig_r & (~sig_s | ~out["sign_agree"])
    return out


def summarize_cox(cmp: pd.DataFrame, real_fit: pd.DataFrame | None = None, alpha: float = 0.05
                  ) -> dict[str, float]:
    sig = (real_fit["p"] < alpha) if real_fit is not None else pd.Series(False, index=cmp.index)
    return {
        "ci_overlap_mean": float(cmp["ci_overlap"].mean()),
        "ci_overlap_min": float(cmp["ci_overlap"].min()),
        "sign_agree_pct": float(100 * cmp["sign_agree"].mean()),
        # Concordancia de signo solo en los efectos clínicamente relevantes (significativos en real)
        "sign_agree_sig_pct": float(100 * cmp.loc[sig, "sign_agree"].mean()) if sig.any() else float("nan"),
        "signif_agree_pct": float(100 * cmp["signif_agree"].mean()),
        "decisions_changed": float(cmp["decision_changed"].sum()),
        "abs_std_diff_mean": float(cmp["std_diff"].abs().mean()),
        "terms_not_estimable": float(cmp["coef_syn"].isna().sum()),
    }


def combine_synthetic(fits: list[pd.DataFrame], n_real: int, n_syn: int) -> pd.DataFrame:
    """Combina m ajustes sobre m sintéticos (Raab, Nowok y Dibben, 2016; síntesis simple).

    q̄ = media de las estimaciones; v̄ = media de las varianzas; T = v̄·(k/n + 1/m).
    Los términos no estimables en algún sintético se combinan con las réplicas disponibles.
    """
    m_coef = pd.concat([f["coef"] for f in fits], axis=1)
    m_var = pd.concat([f["se"] ** 2 for f in fits], axis=1)
    m = m_coef.notna().sum(axis=1).replace(0, np.nan)
    qbar = m_coef.mean(axis=1)
    vbar = m_var.mean(axis=1)
    t = vbar * (n_syn / n_real + 1 / m)
    se = np.sqrt(t)
    out = pd.DataFrame({"coef": qbar, "se": se, "lower": qbar - Z95 * se, "upper": qbar + Z95 * se})
    out["p"] = 2 * stats.norm.sf(np.abs(out["coef"] / out["se"]))
    out["m"] = m
    return out
