"""Figuras del estudio (matplotlib, listas para el paper y para el informe).

Codificación fija en todas las figuras:
    * **Real** → gris tinta (#52514e); **sintético** → azul (#2a78d6).
    * Familias de generador → control: gris apagado · estadístico: azul · privacidad diferencial:
      naranja · aprendizaje profundo: aguamarina. Paleta validada para daltonismo (todos los pares,
      ΔE ≥ 9,2); el aguamarina no llega a 3:1 de contraste, por eso todo punto lleva etiqueta directa.
    * Rejilla y ejes en líneas finas continuas; etiquetas directas selectivas; marca «DATOS SINTÉTICOS».
"""
from __future__ import annotations

from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from matplotlib.axes import Axes
from matplotlib.figure import Figure

from synapse.inference import kaplan_meier

INK, INK2, MUTED = "#0b0b0b", "#52514e", "#898781"
GRID, AXIS, SURFACE = "#e1e0d9", "#c3c2b7", "#fcfcfb"
REAL, SYN = INK2, "#2a78d6"
FAMILY = {"control": MUTED, "estadístico": "#2a78d6", "privacidad diferencial": "#eb6834",
          "aprendizaje profundo": "#1baf7a"}
STATUS = {"verde": "#0ca30c", "ámbar": "#fab219", "rojo": "#d03b3b"}
STATUS_ICON = {"verde": "✓", "ámbar": "!", "rojo": "✕"}


def style() -> None:
    plt.rcParams.update({
        "figure.facecolor": SURFACE, "axes.facecolor": SURFACE, "savefig.facecolor": SURFACE,
        "axes.edgecolor": AXIS, "axes.linewidth": 0.8, "axes.labelcolor": INK2, "axes.titlecolor": INK,
        "axes.titlesize": 11, "axes.titleweight": "bold", "axes.titlelocation": "left",
        "axes.labelsize": 9, "axes.spines.top": False, "axes.spines.right": False,
        "axes.grid": True, "grid.color": GRID, "grid.linewidth": 0.6, "grid.linestyle": "-",
        "xtick.color": MUTED, "ytick.color": MUTED, "xtick.labelsize": 8, "ytick.labelsize": 8,
        "legend.frameon": False, "legend.fontsize": 8, "font.family": "DejaVu Sans",
        "lines.linewidth": 2.0, "figure.dpi": 110, "savefig.dpi": 200, "savefig.bbox": "tight",
    })


def _stamp(fig: Figure, text: str = "DATOS SINTÉTICOS · S.Y.N.A.P.S.E.") -> None:
    fig.text(0.995, 0.005, text, ha="right", va="bottom", fontsize=6.5, color=MUTED)


def save(fig: Figure, path: str | Path) -> Path:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(path)
    plt.close(fig)
    return path


# ─── 1. Curvas de Kaplan-Meier: real frente a sintético ──────────────────────


def km_panel(ax: Axes, real: pd.DataFrame, syn: pd.DataFrame, title: str, tau: float | None = None) -> None:
    for df, color, label in ((real, REAL, "Real"), (syn, SYN, "Sintético")):
        km = kaplan_meier(df, label)
        km.plot_survival_function(ax=ax, color=color, ci_show=True, ci_alpha=0.12, lw=2,
                                  show_censors=False, label=label)
    if tau:
        ax.set_xlim(0, tau)
    ax.set_ylim(0, 1.02)
    ax.set_title(title)
    ax.set_xlabel("Días de seguimiento")
    ax.set_ylabel("Supervivencia S(t)")
    legend = ax.get_legend()
    if legend is not None:
        legend.remove()


def km_grid(real: pd.DataFrame, syns: dict[str, pd.DataFrame], title: str, tau: float | None = None) -> Figure:
    """Rejilla de paneles pequeños: un generador por panel, cada uno frente a la curva real."""
    style()
    n = len(syns)
    cols = min(n, 4)
    rows = int(np.ceil(n / cols))
    fig, axes = plt.subplots(rows, cols, figsize=(3.2 * cols, 2.8 * rows + 0.6), sharey=True, squeeze=False)
    tau = tau or float(real["time"].max())  # mismo eje para todos: el seguimiento real
    for ax, (label, syn) in zip(axes.flat, syns.items(), strict=False):
        km_panel(ax, real, syn, label, tau)
    for ax in list(axes.flat)[n:]:
        ax.set_visible(False)
    handles = [plt.Line2D([], [], color=REAL, lw=2), plt.Line2D([], [], color=SYN, lw=2)]
    fig.legend(handles, ["Real (entrenamiento)", "Sintético"], loc="upper right", ncol=2)
    fig.suptitle(title, x=0.01, ha="left", fontsize=12, fontweight="bold", color=INK)
    fig.tight_layout(rect=(0, 0.02, 1, 0.95))
    _stamp(fig)
    return fig


# ─── 2. Forest plot: hazard ratios real frente a sintético ───────────────────


def forest(terms: pd.DataFrame, title: str) -> Figure:
    """``terms`` = salida de ``inference.compare_cox`` con columnas de IC real y sintético
    (``lower_real``, ``upper_real``, ``lower_syn``, ``upper_syn``)."""
    style()
    t = terms.reset_index(drop=True)
    y = np.arange(len(t))[::-1].astype(float)
    fig, ax = plt.subplots(figsize=(7.2, 0.42 * len(t) + 1.4))
    for offset, prefix, color, label in ((0.14, "real", REAL, "Real"), (-0.14, "syn", SYN, "Sintético")):
        coef = t["coef_real"] if prefix == "real" else t["coef_syn"]
        lo, hi = np.exp(t[f"lower_{prefix}"]), np.exp(t[f"upper_{prefix}"])
        ax.hlines(y + offset, lo, hi, color=color, lw=2)
        ax.scatter(np.exp(coef), y + offset, s=36, color=color, edgecolor=SURFACE, linewidth=2, zorder=3,
                   label=label)
    ax.axvline(1, color=AXIS, lw=1)
    ax.set_xscale("log")
    ax.set_yticks(y, t["term"])
    ax.tick_params(axis="y", colors=INK2, labelsize=9)
    ax.grid(axis="y", visible=False)
    ax.set_xlabel("Hazard ratio (IC 95 %, escala logarítmica)")
    for yi, (_, row) in zip(y, t.iterrows(), strict=True):
        if bool(row.get("decision_changed", False)):
            ax.annotate("conclusión cambiada", xy=(1, yi), xycoords=("axes fraction", "data"),
                        xytext=(4, 0), textcoords="offset points", fontsize=7.5, color=STATUS["rojo"],
                        va="center")
    ax.set_title(title)
    ax.legend(loc="lower left", bbox_to_anchor=(0, 1.0), ncol=2, borderaxespad=1.2)
    fig.tight_layout()
    _stamp(fig)
    return fig


# ─── 3. Frente utilidad-privacidad ───────────────────────────────────────────


def privacy_risk_index(df: pd.DataFrame) -> pd.Series:
    """Índice de riesgo en [0, 1]: el peor de los ataques, cada uno normalizado (AUC → 2·(AUC−0,5))."""
    parts = [2 * (df[c] - 0.5) for c in ("mia_dist_auc", "mia_dens_auc") if c in df]
    parts += [df[c] for c in ("singling_out_risk", "linkability_risk", "inference_risk") if c in df]
    return pd.concat(parts, axis=1).clip(lower=0).max(axis=1)


def pareto(metrics: pd.DataFrame, dataset: str, utility_col: str = "comb_ci_overlap_mean") -> Figure:
    style()
    d = metrics[metrics["dataset"] == dataset].copy()
    d["risk"] = privacy_risk_index(d)
    g = d.groupby(["label", "family"], sort=False).agg(
        u=(utility_col, "mean"), u_se=(utility_col, "sem"), r=("risk", "mean"), r_se=("risk", "sem")).reset_index()
    fig, ax = plt.subplots(figsize=(6.6, 4.6))
    ax.axvspan(0, 0.10, ymin=0, ymax=1, color=STATUS["verde"], alpha=0.06, lw=0)
    ax.axhline(0.5, color=AXIS, lw=0.8)
    ax.axvline(0.10, color=AXIS, lw=0.8)
    ax.text(0.005, 0.99, "zona de liberación", transform=ax.get_xaxis_transform(), fontsize=7.5,
            color=MUTED, va="top")
    placed: list[float] = []  # posiciones verticales (en puntos de pantalla) de etiquetas ya colocadas
    for _, row in g.sort_values("u", ascending=False).iterrows():
        color = FAMILY.get(row["family"], MUTED)
        ax.errorbar(row["r"], row["u"], xerr=row["r_se"], yerr=row["u_se"], fmt="none", ecolor=color,
                    elinewidth=1, alpha=0.6, linestyle="none")
        ax.scatter(row["r"], row["u"], s=64, color=color, edgecolor=SURFACE, linewidth=2, zorder=3)
        ypx = ax.transData.transform((row["r"], row["u"]))[1] * 72 / fig.dpi  # en puntos, como el desplazamiento
        dy = 4
        while any(abs((ypx + dy) - p) < 11 for p in placed):
            dy -= 11
        placed.append(ypx + dy)
        ax.annotate(row["label"], (row["r"], row["u"]), xytext=(7, dy), textcoords="offset points",
                    fontsize=8, color=INK2, va="bottom" if dy > 0 else "center",
                    arrowprops={"arrowstyle": "-", "color": AXIS, "lw": 0.6} if dy < 0 else None)
    ax.set_xlim(left=-0.02)
    ax.set_ylim(0, 1)
    ax.set_xlabel("Riesgo de reidentificación (peor ataque, 0 = ninguno)")
    ax.set_ylabel("Validez inferencial (solapamiento de IC de Cox)")
    ax.set_title(f"{dataset}: utilidad frente a privacidad (media ± EE Monte Carlo)")
    handles = [plt.Line2D([], [], marker="o", ls="", color=c, markersize=7) for c in FAMILY.values()]
    present = set(g["family"])
    keep = [(h, f) for h, f in zip(handles, FAMILY, strict=True) if f in present]
    ax.legend([h for h, _ in keep], [f for _, f in keep], loc="lower right")
    fig.tight_layout()
    _stamp(fig)
    return fig


# ─── 4. Mapa de veredictos ───────────────────────────────────────────────────


def verdict_map(metrics: pd.DataFrame) -> Figure:
    """Porcentaje de réplicas en verde por dataset y generador, con el veredicto mayoritario
    como icono + texto (el color de estado nunca va solo)."""
    style()
    order = ["verde", "ámbar", "rojo"]
    labels = list(dict.fromkeys(metrics["label"]))
    datasets = list(dict.fromkeys(metrics["dataset"]))
    fig, ax = plt.subplots(figsize=(1.25 * len(labels) + 1.8, 0.62 * len(datasets) + 1.4))
    ax.grid(False)
    for i, ds in enumerate(datasets):
        for j, lab in enumerate(labels):
            v = metrics[(metrics["dataset"] == ds) & (metrics["label"] == lab)]["verdict"]
            if v.empty:
                continue
            counts = v.value_counts()
            worst_majority = max(counts[counts == counts.max()].index, key=order.index)
            ax.add_patch(plt.Rectangle((j + 0.04, i + 0.06), 0.92, 0.88, color=STATUS[worst_majority],
                                       alpha=0.22, lw=0))
            ax.text(j + 0.5, i + 0.5, f"{STATUS_ICON[worst_majority]} {worst_majority}\n"
                                      f"{100 * (v == 'verde').mean():.0f}% verde",
                    ha="center", va="center", fontsize=7.5, color=INK)
    ax.set_xlim(0, len(labels))
    ax.set_ylim(len(datasets), 0)
    ax.set_xticks(np.arange(len(labels)) + 0.5, labels, rotation=30, ha="right", color=INK2)
    ax.set_yticks(np.arange(len(datasets)) + 0.5, datasets, color=INK2)
    ax.tick_params(length=0)
    for s in ax.spines.values():
        s.set_visible(False)
    ax.set_title("Semáforo de liberación: veredicto mayoritario por réplica")
    fig.tight_layout()
    _stamp(fig)
    return fig


# ─── 5. Barrido de ε (privacidad diferencial) ────────────────────────────────


def epsilon_sweep(metrics: pd.DataFrame, utility_col: str = "comb_ci_overlap_mean") -> Figure:
    """Una línea por dataset (máximo 3 colores + gris), validez inferencial frente a ε."""
    style()
    d = metrics[metrics["dp"].astype(bool) & metrics["epsilon"].notna()]
    fig, ax = plt.subplots(figsize=(6.2, 4.0))
    colors = ["#2a78d6", "#eb6834", "#1baf7a", MUTED]
    for color, (ds, g) in zip(colors, d.groupby("dataset", sort=False), strict=False):
        s = g.groupby("epsilon")[utility_col].agg(["mean", "sem"]).reset_index()
        ax.vlines(s["epsilon"], s["mean"] - s["sem"], s["mean"] + s["sem"], color=color, lw=1.2, alpha=0.55)
        ax.plot(s["epsilon"], s["mean"], color=color, lw=2, marker="o", markersize=6,
                markeredgecolor=SURFACE, markeredgewidth=2)
        ax.annotate(str(ds), (s["epsilon"].iloc[-1], s["mean"].iloc[-1]), xytext=(6, 0), textcoords="offset points",
                    fontsize=8, color=INK2, va="center")
    ax.set_xscale("log")
    eps = sorted(d["epsilon"].unique())
    ax.set_xticks(eps, [f"{e:g}".replace(".", ",") for e in eps])
    ax.minorticks_off()
    ax.axhline(0.5, color=AXIS, lw=0.8)
    ax.set_ylim(0, 1)
    ax.set_xlabel("Presupuesto de privacidad ε (escala log; menor = más privado)")
    ax.set_ylabel("Validez inferencial (solapamiento de IC)")
    ax.set_title("Coste inferencial de la privacidad diferencial")
    fig.tight_layout()
    _stamp(fig)
    return fig
