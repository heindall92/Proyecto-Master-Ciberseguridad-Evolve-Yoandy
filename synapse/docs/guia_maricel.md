# Guía de la investigadora principal

Maricel: esta guía es tu mapa del proyecto. Todo está montado para que puedas ejecutar el estudio
completo en tu ordenador y apropiarte de la parte estadística, que es la que lideras.

## 1. Instalar (una sola vez)

```bash
git clone https://github.com/maricelmeneses/synapse.git
cd synapse
python -m venv .venv
# Windows:  .venv\Scripts\activate      ·   macOS/Linux:  source .venv/bin/activate
pip install -e ".[dev,dash]"
```

Comprueba que todo funciona:

```bash
make test          # o: pytest -q
synapse datasets   # lista los cuatro estudios
```

## 2. Qué es tuyo en el código

| Fichero | Qué hace | Lo que te toca decidir |
|---|---|---|
| `src/synapse/inference.py` | Kaplan-Meier, Cox, solapamiento de IC, reglas de combinación | ¿Añadir RMST por grupos? ¿Residuos de Schoenfeld para comprobar la proporcionalidad? |
| `src/synapse/utility.py` | KS, variación total, asociaciones, pMSE, TSTR | ¿pMSE con un modelo CART además del logístico (Snoke et al., 2018)? |
| `src/synapse/config/study.yaml` | Umbrales del semáforo y diseño del estudio | **Los umbrales definitivos para el preregistro** |
| `notebooks/01`–`05` | El análisis comentado | Las interpretaciones (busca los recuadros 📝) |
| `paper/paper.qmd` | Borrador del artículo | Métodos y Resultados con tu voz |
| `paper/preregistro_OSF.md` | Hipótesis y plan de análisis | Revisarlo y registrarlo en OSF |

## 3. Tu primer día

1. Abre `notebooks/01_datos_EDA.ipynb` y completa la tarea 📝: una tabla 1 descriptiva por estudio.
2. Abre `notebooks/03_validez_inferencial.ipynb` y lee el hallazgo del piloto sobre
   `decisions_changed`: el bootstrap ya cambia conclusiones por pura variabilidad muestral.
3. Decide el umbral en `study.yaml` y anótalo en el preregistro (sección 8).
4. Haz tu primer commit:
   ```bash
   git add -A && git commit -m "analisis: tabla 1 descriptiva y umbral de conclusiones cambiadas"
   git push
   ```

## 4. Ejecutar el estudio

```bash
synapse study --seeds 10 --workers 4     # piloto: unos 5 minutos
synapse figures                           # figuras del paper en results/figures
synapse site                              # explorador web en site/index.html
python scripts/build_notebooks.py         # regenera y ejecuta los cuadernos
```

Generadores de aprendizaje profundo (opcional; probado con Python 3.11):
```bash
pip install -e ".[deep]"
synapse study --deep --seeds 10
```

## 5. Glosario rápido para las entrevistas

- **Validez inferencial:** que un análisis con sintéticos llegue a las mismas conclusiones que con
  los reales. No es lo mismo que «parecido estadístico».
- **Solapamiento de IC (Karr):** 1 si los intervalos real y sintético coinciden; 0 si son disjuntos.
- **Reglas de combinación:** como en la imputación múltiple, analizar m sintéticos y combinarlos
  da una varianza honesta.
- **Ataque de pertenencia:** adivinar si un paciente estaba en el entrenamiento. AUC 0,5 = azar.
- **Individualización, vinculación e inferencia:** los tres criterios del WP29 para decidir si un
  dato es anónimo.
- **Privacidad diferencial (ε):** garantía matemática de que ningún paciente cambia mucho el
  resultado. Menor ε = más privado = más ruido.
