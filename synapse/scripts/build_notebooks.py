"""Genera y ejecuta los cuadernos de análisis (notebooks/*.ipynb).

    python scripts/build_notebooks.py            # crea y ejecuta los 5 cuadernos
    python scripts/build_notebooks.py --no-run   # solo los crea

Los cuadernos se escriben desde aquí para que su contenido quede bajo control de versiones de
forma legible; una vez creados, se editan directamente en Jupyter.
"""
from __future__ import annotations

import argparse
from pathlib import Path

import nbformat as nbf
from nbclient import NotebookClient

ROOT = Path(__file__).resolve().parents[1]
NB = ROOT / "notebooks"

SETUP = """import warnings; warnings.filterwarnings("ignore")
from pathlib import Path
import os, numpy as np, pandas as pd, matplotlib.pyplot as plt
ROOT = Path.cwd().parent if Path.cwd().name == "notebooks" else Path.cwd()
os.chdir(ROOT)
from synapse import datasets, generators, inference as inf, utility as ut, privacy as pv, compliance, viz
from synapse import experiment as ex
viz.style(); pd.set_option("display.precision", 3); pd.set_option("display.width", 140)
TABLES = ROOT / "results" / "tables"
metrics = pd.read_csv(TABLES / "study_metrics.csv") if (TABLES / "study_metrics.csv").exists() else None
"""


def md(s: str) -> nbf.NotebookNode:
    return nbf.v4.new_markdown_cell(s.strip())


def code(s: str) -> nbf.NotebookNode:
    return nbf.v4.new_code_cell(s.strip())


NOTEBOOKS: dict[str, list[nbf.NotebookNode]] = {
    "01_datos_EDA.ipynb": [
        md("""# 01 · Los datos reales: cuatro estudios clínicos de supervivencia

**S.Y.N.A.P.S.E.** · Investigadora principal: Maricel Meneses Gómez · Colaborador: Yoandy Ramírez Delgado

Antes de sintetizar nada hay que conocer los datos reales. Este cuaderno describe los cuatro
estudios, su censura y sus curvas de Kaplan-Meier, que serán la referencia de todo lo demás."""),
        code(SETUP),
        md("## Resumen de los cuatro estudios"),
        code("""rows = []
for name in datasets.LOADERS:
    d = datasets.load(name)
    ev = d.data["event"].astype(int)
    rows.append({"estudio": name, "n": d.n, "eventos": int(ev.sum()), "% censura": round(100 * (1 - ev.mean()), 1),
                 "mediana seguimiento (días)": float(d.data["time"].median()), "covariables": len(d.covariates),
                 "fuente": d.citation.split(".")[0]})
pd.DataFrame(rows)"""),
        md("""**Lectura.** *veterans* (n = 137, 93 % de eventos) es el caso extremo de muestra pequeña:
cualquier paciente es fácil de individualizar. *flchain* (n = 6.524, 70 % censurados) es el caso
grande y muy censurado; en el estudio se submuestrea a 2.000 para que los ataques sean asumibles."""),
        md("## Curvas de Kaplan-Meier"),
        code("""fig, axes = plt.subplots(1, 4, figsize=(15, 3.4), sharey=True)
for ax, name in zip(axes, datasets.LOADERS):
    d = datasets.load(name)
    inf.kaplan_meier(d.data, name).plot_survival_function(ax=ax, color=viz.REAL, ci_alpha=.15, show_censors=False)
    ax.set_title(name); ax.set_xlabel("Días"); ax.get_legend().remove()
axes[0].set_ylabel("S(t)"); plt.tight_layout()"""),
        md("## El análisis de referencia: Cox sobre los datos reales completos"),
        code("""d = datasets.load("gbsg2")
fit = inf.fit_cox(d.data, d)
fit.assign(HR=np.exp(fit["coef"]), HR_inf=np.exp(fit["lower"]), HR_sup=np.exp(fit["upper"]))[["HR", "HR_inf", "HR_sup", "p"]]"""),
        md("""**Comprobación con la literatura.** La hormonoterapia (`horTh[yes]`) reduce el riesgo de
recidiva (HR ≈ 0,71; p = 0,007) y cada ganglio afectado lo aumenta, como en Schumacher et al. (1994).
Esta es la «verdad» que un buen sintético debería reproducir.

> 📝 **Tarea para Maricel:** añadir aquí una tabla 1 descriptiva (media ± DE o mediana [RIC] por
> variable) para cada estudio, en el formato habitual de una revista clínica."""),
    ],
    "02_generadores.ipynb": [
        md("""# 02 · Cómo genera pacientes cada método

Cinco generadores propios, de lo más simple a lo más protector, y cuatro del extra `[deep]`
(synthcity). Aquí se ajustan sobre la mitad de entrenamiento de GBSG2 y se compara a simple
vista lo que producen."""),
        code(SETUP),
        code("""d = datasets.load("gbsg2")
train, holdout = datasets.split_train_holdout(d.data, seed=0)
specs = {"bootstrap": {}, "marginal": {}, "copula": {}, "cart": {}, "dpcopula": {"epsilon": 1.0}}
syn = {g: generators.make(g, seed=0, **p).fit(train, d.schema).sample(len(train)) for g, p in specs.items()}
print("Disponibles en este entorno:", generators.available())"""),
        md("## Las mismas cinco filas, según cada generador"),
        code("""pd.concat({g: s.head(5) for g, s in syn.items()}, names=["generador", "fila"])"""),
        md("## ¿Se conservan las distribuciones marginales?"),
        code("""uni = pd.DataFrame({g: ut.univariate(train, s, d.schema).set_index("column")["value"] for g, s in syn.items()})
uni.style.background_gradient(cmap="Blues", axis=None).format("{:.3f}")"""),
        md("## ¿Y las relaciones entre variables?"),
        code("""fig, axes = plt.subplots(1, 5, figsize=(17, 3.4))
real_assoc = ut.associations(train, d.schema)
for ax, (g, s) in zip(axes, syn.items()):
    diff = (ut.associations(s, d.schema) - real_assoc).abs()
    ax.imshow(diff, vmin=0, vmax=.5, cmap="Blues"); ax.set_title(f"{g}\\n|Δ| medio = {ut.bivariate(train, s, d.schema)[0]:.3f}")
    ax.set_xticks([]); ax.set_yticks(range(len(diff)), diff.index, fontsize=7)
plt.tight_layout()"""),
        md("""**Lectura.** El muestreo de marginales clava cada variable por separado pero destruye todas las
relaciones; la cópula y CART las conservan; la cópula con privacidad diferencial (ε = 1) paga el
ruido en ambas. Que una variable «se parezca» no garantiza que el análisis clínico se mantenga:
eso se mide en el cuaderno 03."""),
    ],
    "03_validez_inferencial.ipynb": [
        md("""# 03 · Validez inferencial: ¿sobreviven las conclusiones clínicas?

Es la contribución central del proyecto. No basta con que los sintéticos «se parezcan»: un
investigador que analice los datos sintéticos debe llegar a las **mismas conclusiones** que con
los reales. Se mide en tres niveles: curvas de Kaplan-Meier, coeficientes de Cox y decisiones
clínicas (signo y significación)."""),
        code(SETUP),
        code("""d = datasets.load("gbsg2")
train, holdout = datasets.split_train_holdout(d.data, seed=0)
real_fit = inf.fit_cox(train, d)"""),
        md("## Curvas de supervivencia, real frente a sintético"),
        code("""syns = {g: generators.make(g, seed=0).fit(train, d.schema).sample(len(train)) for g in ("bootstrap", "marginal", "copula", "cart")}
syns["dpcopula(ε=1)"] = generators.make("dpcopula", seed=0, epsilon=1.0).fit(train, d.schema).sample(len(train))
viz.km_grid(train, syns, "GBSG2: Kaplan-Meier real frente a sintético");"""),
        code("""pd.DataFrame({g: inf.compare_km(train, s).as_dict() for g, s in syns.items()}).T[
    ["km_mean_abs_diff", "rmst_real", "rmst_syn", "rmst_diff", "logrank_p"]]"""),
        md("""## Coeficientes de Cox: solapamiento de intervalos (Karr et al., 2006)

Para cada efecto se calcula cuánto se solapan los IC al 95 % real y sintético (1 = idénticos,
0 = disjuntos) y si la **decisión clínica** cambia: un efecto significativo en los datos reales que
deja de serlo, o que cambia de signo, en los sintéticos."""),
        code("""cmp = {g: inf.compare_cox(real_fit, inf.fit_cox(s, d)) for g, s in syns.items()}
pd.DataFrame({g: inf.summarize_cox(c, real_fit) for g, c in cmp.items()}).T"""),
        md("""## Reglas de combinación: m = 5 sintéticos (Raab, Nowok y Dibben, 2016)

Igual que en la imputación múltiple, analizar varios sintéticos y combinarlos da una varianza
honesta: T = v̄·(k/n + 1/m). El intervalo se ensancha y el solapamiento con el real mejora."""),
        code("""gen = generators.make("copula", seed=0).fit(train, d.schema)
fits = [inf.fit_cox(gen.sample(len(train)), d) for _ in range(5)]
combined = inf.combine_synthetic(fits, n_real=len(train), n_syn=len(train))
c1, c5 = inf.compare_cox(real_fit, fits[0]), inf.compare_cox(real_fit, combined)
pd.DataFrame({"1 sintético": inf.summarize_cox(c1, real_fit), "m = 5 combinados": inf.summarize_cox(c5, real_fit)})"""),
        code("""t = c5.join(real_fit[["lower", "upper"]].add_suffix("_real")).join(combined[["lower", "upper"]].add_suffix("_syn")).reset_index()
viz.forest(t, "GBSG2 · cópula: HR real frente a sintético (m = 5 combinados)");"""),
        md("## Resultados del estudio completo (10 réplicas × 4 estudios)"),
        code("""cols = ["comb_ci_overlap_mean", "ci_overlap_mean", "decisions_changed", "comb_decisions_changed", "km_mean_abs_diff", "cindex_tstr", "cindex_trtr"]
metrics.groupby(["dataset", "label"])[cols].mean().round(3)"""),
        md("""**Hallazgo del piloto.** Incluso el *bootstrap* (copiar pacientes reales) cambia de media
0,5 conclusiones por réplica: es la variabilidad muestral normal. Por tanto, el criterio
«0 conclusiones cambiadas» del semáforo es demasiado estricto para un único sintético y debe
calibrarse frente a ese suelo antes del preregistro.

> 📝 **Decisión para Maricel (preregistro):** fijar el umbral de `decisions_changed` y decidir si el
> semáforo usa el análisis de un sintético o el de m combinados."""),
    ],
    "04_privacidad.ipynb": [
        md("""# 04 · Atacamos nuestros propios datos

Un dato sintético solo es anónimo si un adversario razonable **no** puede usarlo contra los
pacientes reales. Se ejecutan los ataques sobre la mitad de entrenamiento (miembros) y se comparan
con la mitad de control (no miembros): solo el exceso de acierto cuenta como fuga."""),
        code(SETUP),
        code("""d = datasets.load("gbsg2")
train, holdout = datasets.split_train_holdout(d.data, seed=0)
specs = {"bootstrap": {}, "marginal": {}, "copula": {}, "cart": {}, "dpcopula": {"epsilon": 1.0}}
res = {}
for g, p in specs.items():
    s = generators.make(g, seed=0, **p).fit(train, d.schema).sample(len(train))
    res[g] = pv.evaluate_privacy(train, holdout, s, d, seed=0)
pd.DataFrame(res).T[["exact_match_rate", "dcr_share_train", "mia_dist_auc", "mia_dist_tpr@10fpr", "mia_dens_auc",
                     "singling_out_risk", "linkability_risk", "inference_risk"]]"""),
        md("""**Comprobaciones de cordura.** El *bootstrap* (copiar filas) debe fallar todos los ataques y el
muestreo de marginales debe superarlos: si no fuera así, los ataques estarían mal construidos.

**Hallazgo.** CART al estilo `synthpop` tiene un riesgo de individualización tan alto como el
*bootstrap*: cada valor sintético es un valor real tomado de una hoja del árbol, así que las
combinaciones raras de valores reales sobreviven."""),
        md("## Resultados del estudio completo"),
        code("""cols = ["exact_match_rate", "mia_dist_auc", "mia_dens_auc", "singling_out_risk", "linkability_risk", "inference_risk"]
metrics.groupby(["dataset", "label"])[cols].mean().round(3)"""),
        md("""## Dos artefactos metodológicos detectados en el piloto

1. **DCR con muestras pequeñas.** En *veterans* (68 pacientes por mitad), la proporción de
   sintéticos más cercanos a entrenamiento que a control depende de la partición concreta y marcaba
   riesgo incluso con privacidad diferencial. Se informa, pero no puntúa en el semáforo.
2. **Secretos raros en Anonymeter.** Con `mgus` (1,5 % de «sí»), el riesgo de inferencia divide por
   un número casi nulo y el generador de marginales, que no puede filtrar nada, daba 0,24. Los
   secretos con clase minoritaria < 5 % se excluyen (`privacy.MIN_SECRET_PREVALENCE`)."""),
    ],
    "05_frente_pareto.ipynb": [
        md("""# 05 · El compromiso utilidad-privacidad y el semáforo

Síntesis del estudio piloto: ningún generador es a la vez útil para inferencia clínica y seguro
frente a los ataques en todos los estudios."""),
        code(SETUP),
        code("""print(len(metrics), "réplicas ·", metrics["dataset"].nunique(), "estudios ·", metrics["label"].nunique(), "generadores")
ex.summarize(metrics)"""),
        md("## Frente utilidad-privacidad por estudio"),
        code("""for name in metrics["dataset"].unique():
    viz.pareto(metrics, name)"""),
        md("## Coste inferencial de la privacidad diferencial"),
        code("""viz.epsilon_sweep(metrics);"""),
        md("## Semáforo de liberación"),
        code("""viz.verdict_map(metrics);"""),
        md("## Hipótesis del piloto (exploratorias; las confirmatorias se preregistran)"),
        code("""m = metrics.assign(n_small=metrics["n_train"] < 1000)
h1 = m[m["generator"].isin(["cart", "copula"])].groupby(["dataset", "generator"])["comb_ci_overlap_mean"].mean().unstack()
h2 = m[m["dp"] & (m["epsilon"] <= 1)].groupby("dataset")["comb_ci_overlap_mean"].mean()
h3 = m[m["generator"].isin(["bootstrap", "copula", "cart", "marginal"])].groupby("generator")["singling_out_risk"].mean()
display(h1.round(3), h2.round(3).to_frame("solapamiento con ε ≤ 1"), h3.round(3).to_frame("individualización media"))"""),
        md("""**Lectura (piloto).**

* **H1** (CART conserva mejor los HR que los métodos profundos con n < 1.000): pendiente de los
  generadores del extra `[deep]`. Frente a la cópula, CART conserva mejor los efectos de Cox en
  los cuatro estudios (solapamiento de 0,61–0,81 frente a 0,57–0,75), a costa de individualizar.
* **H2** (privacidad diferencial con ε ≤ 1 rompe la validez inferencial): consistente. El
  solapamiento cae por debajo de 0,3 en todos los estudios.
* **H3** (bootstrap y CART fallan la individualización): consistente. El riesgo de CART está entre
  0,74 y 0,80 en GBSG2, WHAS500 y FLCHAIN, y es de 0,32 en VA Lung, donde la muestra es tan pequeña
  que los árboles casi no tienen hojas con valores únicos.

> 📝 **Para Maricel:** redactar estas lecturas en la sección de Resultados del paper
> (`paper/paper.qmd`) y fijar en el preregistro las semillas del estudio confirmatorio
> (por ejemplo, 100–199), distintas de las del piloto (0–9)."""),
    ],
}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-run", action="store_true")
    args = ap.parse_args()
    NB.mkdir(exist_ok=True)
    for name, cells in NOTEBOOKS.items():
        nb = nbf.v4.new_notebook(cells=cells, metadata={"kernelspec": {"name": "python3", "display_name": "Python 3",
                                                                       "language": "python"},
                                                         "language_info": {"name": "python"}})
        if not args.no_run:
            NotebookClient(nb, timeout=900, kernel_name="python3", resources={"metadata": {"path": str(NB)}}).execute()
        nbf.write(nb, NB / name)
        print("✓", name)


if __name__ == "__main__":
    main()
