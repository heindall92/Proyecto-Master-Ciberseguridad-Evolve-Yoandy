<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/readme/cabecera-dark.svg">
    <img src="docs/assets/readme/cabecera-light.svg" alt="S.Y.N.A.P.S.E.: curvas de supervivencia de Kaplan-Meier real y sintética con su banda de confianza" width="100%">
  </picture>
</p>

<p align="center">
  <b>¿Se puede compartir un ensayo clínico sin compartir a sus pacientes? Bioestadística para comprobar si las conclusiones médicas sobreviven y ataques reales para comprobar si los pacientes siguen protegidos.</b>
</p>

<p align="center">
  <a href="site/index.html"><img alt="Abrir el explorador" src="https://img.shields.io/badge/Abrir_el_explorador-site%2Findex.html-0A5CFF?style=for-the-badge"/></a>
</p>

<p align="center">
  <img alt="Python 3.11 | 3.12" src="https://img.shields.io/badge/Python-3.11%20%7C%203.12-0A5CFF?style=flat&logo=python&logoColor=white"/>
  <a href="LICENSE"><img alt="Licencia MIT" src="https://img.shields.io/badge/licencia-MIT-1D1D1F?style=flat"/></a>
  <img alt="Kaplan-Meier · Cox" src="https://img.shields.io/badge/Kaplan--Meier%20%C2%B7%20Cox-supervivencia-5856D6?style=flat"/>
  <img alt="Cobertura ≥ 90 %" src="https://img.shields.io/badge/cobertura-%E2%89%A590%25-34C759?style=flat"/>
  <img alt="Reproducible bit a bit" src="https://img.shields.io/badge/reproducible-bit%20a%20bit-30B0C7?style=flat"/>
  <img alt="RGPD · EHDS · WP29" src="https://img.shields.io/badge/RGPD%20%C2%B7%20EHDS%20%C2%B7%20WP29-marco%20normativo-FF9500?style=flat"/>
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/readme/cifras-dark.svg">
    <img src="docs/assets/readme/cifras-light.svg" alt="320 evaluaciones completas, 4 estudios clínicos reales, 8 generadores comparados, 0 pacientes reales expuestos" width="100%">
  </picture>
</p>

<p align="center">
  <img src="docs/img/readme/inicio-light.png" alt="Explorador de S.Y.N.A.P.S.E.: hallazgos del estudio piloto" width="880"/>
</p>

El **Espacio Europeo de Datos de Salud** (Reglamento (UE) 2025/327) y la investigación clínica necesitan compartir datos de pacientes, y el **RGPD** protege los datos de salud como categoría especial. Los datos sintéticos se presentan como la solución, casi siempre con un supuesto que nadie comprueba: *si es sintético, es anónimo y sirve igual*.

S.Y.N.A.P.S.E. pone a prueba ese supuesto con dos preguntas que se responden por separado y se juzgan a la vez:

- **¿Sobreviven las conclusiones clínicas?** Se mide con la **validez inferencial**: curvas de Kaplan-Meier, intervalos de los *hazard ratios* de Cox y efectos clínicos que cambian de signo o pierden la significación.
- **¿Siguen protegidos los pacientes?** Se mide con el **riesgo de reidentificación**: ataques de pertenencia y los tres criterios de anonimización del Grupo del Artículo 29.

El resultado es un **semáforo de liberación** con base normativa: verde, ámbar o rojo, con sus motivos.

<div align="center">

## `$ cat synapse.yaml`

<table>
  <thead>
    <tr>
      <th colspan="2" align="left"><code>synapse:~$ cat synapse.yaml</code></th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td width="50%" valign="top"><code>├─ bioestadistica:</code><br><br>
        <img src="docs/assets/stack/kaplan-meier.svg" height="52" alt="Kaplan-Meier">
        <img src="docs/assets/stack/cox.svg" height="52" alt="Modelo de Cox">
        <img src="docs/assets/stack/ic-solapamiento.svg" height="52" alt="Solapamiento de IC">
        <img src="docs/assets/stack/combinacion.svg" height="52" alt="Reglas de combinación">
        <img src="docs/assets/stack/pmse.svg" height="52" alt="pMSE">
        <img src="docs/assets/stack/tstr.svg" height="52" alt="TSTR"><br>
        <sub><code>KM · RMST · log-rank · Cox · Karr 2006 · Raab 2016 · Snoke 2018 · índice C · Brier</code></sub>
      </td>
      <td width="50%" valign="top"><code>├─ privacidad:</code><br><br>
        <img src="docs/assets/stack/pertenencia.svg" height="52" alt="Inferencia de pertenencia">
        <img src="docs/assets/stack/wp29.svg" height="52" alt="WP29">
        <img src="docs/assets/stack/anonymeter.svg" height="52" alt="Anonymeter">
        <img src="docs/assets/stack/dp.svg" height="52" alt="Privacidad diferencial"><br>
        <sub><code>pertenencia (distancia y densidad) · individualización · vinculación · inferencia · ε</code></sub>
      </td>
    </tr>
    <tr>
      <td valign="top"><code>├─ datos:</code><br><br>
        <img src="docs/assets/stack/gbsg2.svg" height="52" alt="GBSG2">
        <img src="docs/assets/stack/whas500.svg" height="52" alt="WHAS500">
        <img src="docs/assets/stack/flchain.svg" height="52" alt="FLCHAIN">
        <img src="docs/assets/stack/veterans.svg" height="52" alt="VA Lung Cancer"><br>
        <sub><code>cáncer de mama · infarto · Clínica Mayo · cáncer de pulmón · públicos</code></sub>
      </td>
      <td valign="top"><code>├─ codigo:</code><br><br>
        <img src="docs/assets/stack/python.svg" height="52" alt="Python">
        <img src="docs/assets/stack/pandas.svg" height="52" alt="pandas">
        <img src="docs/assets/stack/lifelines.svg" height="52" alt="lifelines">
        <img src="docs/assets/stack/sksurv.svg" height="52" alt="scikit-survival">
        <img src="docs/assets/stack/synthcity.svg" height="52" alt="synthcity"><br>
        <sub><code>generadores propios · synthcity opcional (CTGAN, TVAE, PrivBayes, AIM)</code></sub>
      </td>
    </tr>
    <tr>
      <td valign="top"><code>├─ pruebas:</code><br><br>
        <img src="docs/assets/stack/pytest.svg" height="52" alt="pytest">
        <img src="docs/assets/stack/hypothesis.svg" height="52" alt="hypothesis">
        <img src="docs/assets/stack/nbmake.svg" height="52" alt="Cuadernos">
        <img src="docs/assets/stack/tipos.svg" height="52" alt="mypy y ruff"><br>
        <sub><code>79 pruebas · 5 cuadernos ejecutables · cobertura ≥ 90 % · mypy · ruff</code></sub>
      </td>
      <td valign="top"><code>╰─ normativa:</code><br><br>
        <img src="docs/assets/stack/rgpd.svg" height="52" alt="RGPD">
        <img src="docs/assets/stack/ehds.svg" height="52" alt="EHDS">
        <img src="docs/assets/stack/iso27559.svg" height="52" alt="ISO/IEC 27559">
        <img src="docs/assets/stack/actions.svg" height="52" alt="GitHub Actions"><br>
        <sub><code>RGPD cdo. 26 · WP216 · EHDS · ISO/IEC 27559 · CI en cada cambio</code></sub>
      </td>
    </tr>
  </tbody>
  <tfoot>
    <tr>
      <td colspan="2"><code>version: 0.1.0&nbsp;&nbsp;·&nbsp;&nbsp;estudios: 4&nbsp;&nbsp;·&nbsp;&nbsp;réplicas: 320&nbsp;&nbsp;·&nbsp;&nbsp;idiomas: es, en&nbsp;&nbsp;·&nbsp;&nbsp;licencia: MIT</code></td>
    </tr>
  </tfoot>
</table>

</div>

---

## Índice

- [Cómo funciona](#-cómo-funciona)
- [Mapa mental](#-mapa-mental)
- [Hallazgos del estudio piloto](#-hallazgos-del-estudio-piloto)
- [El explorador](#-el-explorador)
- [Capturas](#-capturas)
- [Arranque rápido](#-arranque-rápido)
- [Calidad](#-calidad)
- [Ética y privacidad](#-ética-y-privacidad)
- [Estructura](#-estructura)
- [Limitaciones](#-limitaciones)
- [Documentación](#-documentación)
- [Licencia y cita](#-licencia-y-cita)
- [Equipo](#-equipo)

---

## <img src="docs/assets/icons/route.svg" width="20" height="20" valign="middle"/> Cómo funciona

1. **Partición.** Los pacientes reales de cada estudio se dividen al azar, estratificando por evento: la mitad entrena al generador (los **miembros**) y la otra mitad no la ve nunca (el **control**).
2. **Síntesis.** Cada generador produce cinco conjuntos sintéticos del mismo tamaño que el entrenamiento.
3. **Validez inferencial.** Se repite el análisis clínico con los sintéticos y se compara con el real: curvas de Kaplan-Meier y su supervivencia media restringida, *hazard ratios* de Cox con el solapamiento de sus intervalos, y **conclusiones cambiadas**, es decir, efectos significativos que se pierden o cambian de signo. Los cinco sintéticos se combinan con las reglas de la imputación múltiple.
4. **Ataques.** Se intenta usar los sintéticos contra los pacientes reales. Solo cuenta como fuga el acierto que supera al obtenido sobre los pacientes de control.
5. **Veredicto.** Cada medida se califica en verde, ámbar o rojo con umbrales fijados de antemano. La privacidad manda: un rojo en privacidad significa «no liberar».
6. **Réplicas.** Todo se repite con diez semillas por estudio y generador, y se informa de la media con su error Monte Carlo.

## <img src="docs/assets/icons/network.svg" width="20" height="20" valign="middle"/> Mapa mental

```mermaid
%%{init: {"theme": "base", "themeVariables": {"fontFamily": "-apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial, sans-serif", "primaryColor": "#0A5CFF", "primaryTextColor": "#FFFFFF", "lineColor": "#8E8E93", "cScale0": "#0A5CFF", "cScale1": "#34C759", "cScale2": "#FF9500", "cScale3": "#AF52DE", "cScale4": "#FF3B30", "cScale5": "#30B0C7", "cScaleLabel0": "#FFFFFF", "cScaleLabel1": "#FFFFFF", "cScaleLabel2": "#FFFFFF", "cScaleLabel3": "#FFFFFF", "cScaleLabel4": "#FFFFFF", "cScaleLabel5": "#FFFFFF"}}}%%
mindmap
  root((S.Y.N.A.P.S.E.))
    Datos reales
      GBSG2 · cáncer de mama
      WHAS500 · infarto
      FLCHAIN · Clínica Mayo
      VA Lung · cáncer de pulmón
    Generadores
      Bootstrap y marginales
      Cópula gaussiana
      CART secuencial
      Privacidad diferencial ε
      CTGAN · TVAE · PrivBayes · AIM
    Validez inferencial
      Kaplan-Meier y RMST
      Hazard ratios de Cox
      Solapamiento de IC
      Conclusiones cambiadas
      Reglas de combinación
    Privacidad
      Pertenencia por distancia
      Pertenencia por densidad
      Individualización · vinculación · inferencia
    Veredicto
      RGPD considerando 26
      WP29 Dictamen 05/2014
      EHDS · entorno seguro
      ISO/IEC 27559
```

## <img src="docs/assets/icons/chart-scatter.svg" width="20" height="20" valign="middle"/> Hallazgos del estudio piloto

**4 estudios clínicos × 8 generadores × 10 réplicas = 320 evaluaciones completas.**

<p align="center"><img src="results/figures/fig_pareto_gbsg2.png" alt="Utilidad frente a privacidad en GBSG2" width="720"/></p>

- **Ningún generador es útil y seguro a la vez de forma sistemática.** Solo **2 de 320** réplicas superan todos los umbrales.
- **La utilidad se paga en privacidad.** El *bootstrap* conserva los efectos de Cox (solapamiento de IC de **0,86**), pero un ataque de pertenencia lo detecta con **AUC 0,82**. La síntesis CART conserva bien los efectos (**0,73**) y su riesgo de individualización llega a **0,74–0,80**.
- **La privacidad diferencial cuesta validez clínica.** Con **ε ≤ 1**, el solapamiento de IC cae a **0,24–0,30**: el modelo de Cox deja de decir lo mismo.
- **La cópula gaussiana es el mejor compromiso, pero no es inocua.** En GBSG2 puede borrar el efecto protector de la hormonoterapia, el resultado principal del ensayo.
- **Hallazgo metodológico.** Hasta remuestrear pacientes reales cambia **0,55** conclusiones por réplica. Exigir «cero conclusiones cambiadas» a un único sintético es demasiado estricto, y el preregistro lo corrige.

<table>
<tr>
<td width="50%"><img src="results/figures/fig_epsilon.png" alt="Coste inferencial de la privacidad diferencial"/><br/><sub><b>Privacidad diferencial</b> · validez inferencial frente a ε</sub></td>
<td width="50%"><img src="results/figures/fig_km_gbsg2.png" alt="Kaplan-Meier real frente a sintético en GBSG2"/><br/><sub><b>Kaplan-Meier</b> · real frente a cada generador (GBSG2)</sub></td>
</tr>
<tr>
<td colspan="2"><img src="results/figures/fig_semaforo.png" alt="Semáforo de liberación por estudio y generador"/><br/><sub><b>Semáforo</b> · veredicto mayoritario por estudio y generador</sub></td>
</tr>
</table>

> Resultados **exploratorios**. Las hipótesis confirmatorias se preregistran ([paper/preregistro_OSF.md](paper/preregistro_OSF.md)) y se contrastarán con semillas distintas.

## <img src="docs/assets/icons/layout-grid.svg" width="20" height="20" valign="middle"/> El explorador

Una aplicación web en **un único fichero HTML**: sin servidor, sin instalar nada y sin ninguna petición de red.

| | Vista | Contenido |
|:-:|---|---|
| <img src="docs/assets/icons/chart-scatter.svg" width="18"/> | **Panel** | Pacientes, eventos, mejor compromiso, frente utilidad-privacidad interactivo y ficha del generador con su error Monte Carlo. |
| <img src="docs/assets/icons/heart-pulse.svg" width="18"/> | **Supervivencia** | Kaplan-Meier real frente a sintético, con cursor que da la supervivencia día a día. |
| <img src="docs/assets/icons/flask-conical.svg" width="18"/> | **Efectos clínicos** | *Forest plot* de los *hazard ratios* de Cox, con los efectos cuya conclusión cambia marcados en rojo. |
| <img src="docs/assets/icons/shield-check.svg" width="18"/> | **Semáforo** | Veredicto por generador con validez, ataques y porcentaje de réplicas en verde. |
| <img src="docs/assets/icons/book-open.svg" width="18"/> | **Método, marco normativo y equipo** | Cómo se mide, qué dice cada norma y quién hace qué. |

Además: búsqueda con `Ctrl + K`, barra lateral plegable con `[`, cambio de estudio con las teclas `1` a `4`, ayuda con glosario, ajustes de tema, acento, densidad y movimiento, perfil local, interfaz en español e inglés, y modos claro y oscuro.

```bash
synapse site      # → site/index.html: ábrelo con doble clic o publícalo en GitHub Pages
```

## <img src="docs/assets/icons/image.svg" width="20" height="20" valign="middle"/> Capturas

<table>
<tr>
<td width="50%"><img src="docs/img/readme/panel-dark.png" alt="Panel en tema oscuro"/><br/><sub><b>Panel</b> · frente utilidad-privacidad y ficha del generador</sub></td>
<td width="50%"><img src="docs/img/readme/supervivencia-light.png" alt="Supervivencia"/><br/><sub><b>Supervivencia</b> · Kaplan-Meier real frente a sintético</sub></td>
</tr>
<tr>
<td><img src="docs/img/readme/efectos-dark.png" alt="Efectos clínicos"/><br/><sub><b>Efectos clínicos</b> · el efecto de la hormonoterapia, en rojo, cambia de conclusión</sub></td>
<td><img src="docs/img/readme/semaforo-light.png" alt="Semáforo"/><br/><sub><b>Semáforo</b> · veredicto y motivos por generador</sub></td>
</tr>
<tr>
<td><img src="docs/img/readme/privacidad-dark.png" alt="Privacidad"/><br/><sub><b>Privacidad</b> · resultado de cada ataque</sub></td>
<td><img src="docs/img/readme/normativa-dark.png" alt="Marco normativo"/><br/><sub><b>Marco normativo</b> · RGPD, WP29, EHDS e ISO/IEC 27559</sub></td>
</tr>
<tr>
<td><img src="docs/img/readme/metodo-light.png" alt="Método"/><br/><sub><b>Método</b> · validez inferencial, ataques y datos de partida</sub></td>
<td><img src="docs/img/readme/busqueda-light.png" alt="Búsqueda"/><br/><sub><b>Búsqueda</b> · vistas, estudios, generadores y términos con Ctrl + K</sub></td>
</tr>
<tr>
<td><img src="docs/img/readme/ayuda-light.png" alt="Ayuda"/><br/><sub><b>Ayuda</b> · preguntas frecuentes, glosario, atajos y soporte</sub></td>
<td><img src="docs/img/readme/ajustes-dark.png" alt="Ajustes"/><br/><sub><b>Ajustes</b> · tema, acento, densidad, idioma y movimiento</sub></td>
</tr>
</table>

**Barra lateral.** Flota separada de los bordes y se pliega con el botón o con `[`. Plegada, se despliega por encima del contenido al pasar el ratón.

<table>
<tr>
<td align="center" width="33%"><img src="docs/img/readme/rail-completa.png" alt="Barra lateral completa" width="200"/><br/><sub>Completa</sub></td>
<td align="center" width="33%"><img src="docs/img/readme/rail-compacta.png" alt="Barra lateral compacta" width="200"/><br/><sub>Compacta</sub></td>
<td align="center" width="33%"><img src="docs/img/readme/rail-desplegada.png" alt="Barra lateral compacta desplegada al pasar el ratón" width="200"/><br/><sub>Compacta, al pasar el ratón</sub></td>
</tr>
</table>

**Móvil.** Por debajo de 900 px, la barra lateral pasa a ser un cajón y las tablas se desplazan dentro de su tarjeta.

<table>
<tr>
<td align="center" width="33%"><img src="docs/img/readme/movil-panel.png" alt="Panel en móvil" width="230"/></td>
<td align="center" width="33%"><img src="docs/img/readme/movil-semaforo.png" alt="Semáforo en móvil" width="230"/></td>
<td align="center" width="33%"><img src="docs/img/readme/movil-menu.png" alt="Menú en móvil" width="230"/></td>
</tr>
</table>

## <img src="docs/assets/icons/rocket.svg" width="20" height="20" valign="middle"/> Arranque rápido

```bash
git clone https://github.com/maricelmeneses/synapse.git && cd synapse
python -m venv .venv && source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -e ".[dev,dash]"

synapse datasets                                           # los 4 estudios clínicos
synapse evaluate gbsg2 copula --report informe.html        # una evaluación con su informe de liberación
synapse study --seeds 10 --workers 4                       # el estudio piloto completo (~5 min)
synapse figures                                            # las figuras del paper
streamlit run app/dashboard.py                             # evalúa TU propio CSV, sin salir de tu ordenador
```

<details>
<summary><b>Desarrollo</b>: generadores profundos, cuadernos, capturas y gráficos del README</summary>

```bash
# Generadores de aprendizaje profundo (synthcity; probado con Python 3.11)
pip install -e ".[deep]"
synapse study --deep --seeds 10

# Todas las comprobaciones de la CI
make all                                  # ruff + mypy + pytest con cobertura ≥ 90 %
python -m pytest --nbmake notebooks       # los 5 cuadernos se ejecutan de principio a fin

# Regenerar cuadernos, capturas y gráficos del README
python scripts/build_notebooks.py
synapse site && python scripts/capturas.py
python scripts/readme_assets.py
```

</details>

## <img src="docs/assets/icons/terminal.svg" width="20" height="20" valign="middle"/> Calidad

| Suite | Herramienta | Comprobaciones | Qué demuestra |
|---|---|---|---|
| Datos | pytest | 7 | Tamaños y eventos publicados de los 4 estudios, partición estratificada y reproducible, exclusión de la fuga del desenlace en FLCHAIN. |
| Generadores | pytest + hypothesis | 29 | Esquema, tipos y rangos en cada sintético; reproducibilidad por semilla; la cópula conserva las correlaciones (error < 0,1); más ε da menos ruido; propiedades de la matriz de correlación. |
| Inferencia | pytest | 12 | **El Cox reproduce el HR publicado de la hormonoterapia en GBSG2 (0,71)**; valores conocidos del solapamiento de IC; las reglas de combinación ensanchan el intervalo exactamente T = v̄(1 + 1/m). |
| Privacidad | pytest | 17 | **Verdad conocida:** el *bootstrap* tiene que caer en todos los ataques y los marginales en ninguno; secretos raros excluidos; **reproducibilidad bit a bit** de toda una evaluación. |
| Aplicación | pytest + Typer | 9 | CLI completa, informe de liberación, figuras y explorador autocontenido, sin recursos externos. |
| Cuadernos | nbmake | 5 | Los cinco cuadernos de análisis se ejecutan de principio a fin en la CI. |

## <img src="docs/assets/icons/shield-check.svg" width="20" height="20" valign="middle"/> Ética y privacidad

- **Solo datos públicos.** Los cuatro estudios son clásicos de la bioestadística y se distribuyen con `scikit-survival`.
- **Ataques con propósito de evaluación.** Se lanzan solo contra sintéticos generados por el propio equipo. Nunca se intenta identificar a nadie fuera de este marco.
- **Honestidad del dato.** Cada figura, informe y vista lleva la marca **DATOS SINTÉTICOS**. Cada umbral está documentado como propuesta del equipo, no como estándar legal.
- **Todo en local.** El panel de Streamlit evalúa un CSV propio sin que el dato salga de la máquina, y el explorador no hace ninguna petición de red.
- **El veredicto no sustituye** a la evaluación de impacto (art. 35 RGPD) ni al criterio del delegado de protección de datos.

## <img src="docs/assets/icons/folder-tree.svg" width="20" height="20" valign="middle"/> Estructura

```
synapse/
├── src/synapse/
│   ├── datasets.py          GBSG2 · WHAS500 · FLCHAIN · VA Lung, con esquema y límites públicos
│   ├── generators/          bootstrap · marginal · cópula · CART · cópula con privacidad diferencial · synthcity
│   ├── inference.py         Kaplan-Meier, Cox, solapamiento de IC, reglas de combinación
│   ├── utility.py           KS/TVD, asociaciones, pMSE, TSTR (índice C y Brier integrado)
│   ├── privacy.py           DCR, pertenencia (distancia y densidad), Anonymeter (WP29)
│   ├── compliance.py        semáforo → RGPD, WP216, EHDS, ISO/IEC 27559
│   ├── experiment.py        rejilla estudio × generador × semilla, en paralelo
│   ├── viz.py · report.py   figuras del paper e informe de liberación
│   ├── site.py              explorador web autocontenido
│   └── config/study.yaml    diseño del estudio y umbrales del semáforo
├── notebooks/               01 datos · 02 generadores · 03 validez inferencial · 04 privacidad · 05 síntesis
├── paper/                   borrador IMRaD (Quarto), preregistro OSF y bibliografía
├── results/                 métricas por réplica, términos de Cox y figuras del piloto
├── site/index.html          el explorador, listo para GitHub Pages
├── app/dashboard.py         panel Streamlit para evaluar un CSV propio
├── docs/                    metodología · ataques · marco legal · guía de la IP · difusión · migración
└── scripts/                 cuadernos, capturas, gráficos del README y publicación en GitHub
```

## <img src="docs/assets/icons/triangle-alert.svg" width="20" height="20" valign="middle"/> Limitaciones

- **Estudio piloto.** Diez réplicas por combinación; el estudio confirmatorio usará las semillas y los umbrales preregistrados.
- **Cuatro estudios de tamaño moderado** (de 137 a 2.000 pacientes en el análisis). Los resultados pueden cambiar con registros clínicos grandes como MIMIC-IV.
- **Atacante sin acceso al generador.** Solo ve los datos publicados. Un atacante con acceso al modelo sería más fuerte.
- **Umbrales propuestos por el equipo.** Ninguna norma fija hoy un valor numérico de riesgo aceptable.
- **Generadores profundos** disponibles como extra opcional; su inclusión en el estudio completo queda para la fase confirmatoria.

## <img src="docs/assets/icons/notebook-pen.svg" width="20" height="20" valign="middle"/> Documentación

| Documento | Para qué |
|---|---|
| [docs/metodologia.md](docs/metodologia.md) | Protocolo, generadores y decisiones de diseño |
| [docs/ataques_privacidad.md](docs/ataques_privacidad.md) | Modelo de amenaza, ataques y artefactos detectados en el piloto |
| [docs/marco_legal.md](docs/marco_legal.md) | Qué dice cada norma y cómo la usa el semáforo |
| [docs/guia_maricel.md](docs/guia_maricel.md) | Guía de la investigadora principal: qué decidir y cómo ejecutar |
| [paper/paper.qmd](paper/paper.qmd) · [preregistro](paper/preregistro_OSF.md) | Borrador del artículo y preregistro |
| [docs/difusion_linkedin.md](docs/difusion_linkedin.md) | Cinco publicaciones para contar el proyecto |
| [docs/linea2_vulnerabilidades.md](docs/linea2_vulnerabilidades.md) | Línea futura: supervivencia de vulnerabilidades en hospitales |

## <img src="docs/assets/icons/scale.svg" width="20" height="20" valign="middle"/> Licencia y cita

[MIT](LICENSE) · © 2026 Maricel Meneses Gómez y Yoandy Ramírez Delgado. Iconos: [Lucide](https://lucide.dev) (ISC). Datos de partida: estudios clínicos públicos citados en [docs/metodologia.md](docs/metodologia.md).

```bibtex
@software{synapse2026,
  author  = {Meneses Gómez, Maricel and Ramírez Delgado, Yoandy},
  title   = {{S.Y.N.A.P.S.E.}: Statistical fidelity and security evaluation of synthetic health data},
  year    = {2026},
  url     = {https://github.com/maricelmeneses/synapse},
  version = {0.1.0}
}
```

## <img src="docs/assets/icons/users.svg" width="20" height="20" valign="middle"/> Equipo

<table>
<tr>
<td align="center" width="50%" valign="top">
<img src="https://github.com/maricelmeneses.png" alt="Maricel Meneses Gómez" width="110"/><br/>
<b>Maricel Meneses Gómez</b><br/>
<sub><b>Investigadora principal · Bioestadística y analítica de datos</b></sub><br/>
<sub>Lic. en Ciencias de la Computación · Máster en Computación Aplicada · IBM Data Analyst</sub><br/>
<sub>10 años de docencia universitaria en Computación y Estadística, 5 de ellos en la Universidad de Ciencias Médicas de Villa Clara</sub><br/><br/>
<a href="https://github.com/maricelmeneses"><img alt="GitHub" src="https://img.shields.io/badge/GitHub-1D1D1F?style=flat&logo=github&logoColor=white"/></a>
<!-- Maricel: añade aquí tu LinkedIn con este formato:
<a href="https://www.linkedin.com/in/TU-USUARIO/"><img alt="LinkedIn" src="https://img.shields.io/badge/LinkedIn-0A66C2?style=flat&logo=linkedin&logoColor=white"/></a> -->
<br/><sub>Diseño del estudio · validez inferencial · análisis de supervivencia · redacción</sub>
</td>
<td align="center" width="50%" valign="top">
<img src="https://github.com/heindall92.png" alt="Yoandy Ramírez Delgado" width="110"/><br/>
<b>Yoandy Ramírez Delgado</b><br/>
<sub><b>Privacidad ofensiva · GRC · Ingeniería</b></sub><br/>
<sub>Junior Pentester · eJPTv2 · AI Governance (ISO 42001) · ENS · SysAdmin</sub><br/><br/>
<a href="https://www.linkedin.com/in/yoandyrd92/"><img alt="LinkedIn" src="https://img.shields.io/badge/LinkedIn-0A66C2?style=flat&logo=linkedin&logoColor=white"/></a>
<a href="https://github.com/heindall92"><img alt="GitHub" src="https://img.shields.io/badge/GitHub-1D1D1F?style=flat&logo=github&logoColor=white"/></a>
<a href="https://yoandyramirez.com"><img alt="Portafolio" src="https://img.shields.io/badge/Portafolio-0A5CFF?style=flat&logo=googlechrome&logoColor=white"/></a>
<br/><sub>Ataques de reidentificación · marco normativo · software · explorador</sub>
</td>
</tr>
</table>

Errores, métricas discutibles o propuestas: abre una [*issue*](https://github.com/maricelmeneses/synapse/issues).

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/readme/pie-dark.svg">
    <img src="docs/assets/readme/pie-light.svg" alt="" width="100%">
  </picture>
</p>
