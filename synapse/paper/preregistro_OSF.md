# Preregistro (borrador para OSF) — S.Y.N.A.P.S.E.

> Plantilla basada en el formato «OSF Preregistration». **Estado: borrador.** Lo revisa, completa y
> registra la investigadora principal (Maricel Meneses Gómez) **antes** de ejecutar el estudio
> confirmatorio. El estudio piloto (semillas 0–9) solo sirve para calibrar; sus resultados no
> cuentan como confirmación.

## 1. Título
Validez inferencial y riesgo de reidentificación de datos sanitarios sintéticos: un estudio de
simulación con cuatro estudios clínicos de supervivencia.

## 2. Autoría
Maricel Meneses Gómez (investigadora principal) · Yoandy Ramírez Delgado.

## 3. Preguntas de investigación
1. ¿Qué generadores de datos sintéticos conservan las conclusiones de un análisis de supervivencia
   (curvas de Kaplan-Meier, hazard ratios de Cox)?
2. ¿A qué coste en riesgo de reidentificación, medido con ataques reales?
3. ¿Existe algún generador que supere a la vez un umbral de utilidad y uno de privacidad?

## 4. Hipótesis (confirmatorias)
- **H1.** Con n < 1.000, la síntesis secuencial CART conserva los hazard ratios (solapamiento medio
  de IC con m = 5) mejor que CTGAN y TVAE.
- **H2.** La cópula con privacidad diferencial con ε ≤ 1 da un solapamiento medio de IC < 0,5 en
  los cuatro estudios.
- **H3.** El riesgo de individualización (Anonymeter) del *bootstrap* y de CART supera 0,30 en
  todos los estudios.
- **H4.** Ningún generador obtiene veredicto verde en la mayoría de réplicas en más de dos de los
  cuatro estudios.

## 5. Diseño (marco ADEMP; Morris, White y Crowther, 2019)
- **Objetivos:** los de la sección 3.
- **Mecanismo de generación de datos:** remuestreo de pacientes reales. Partición aleatoria
  estratificada por evento en 50 % entrenamiento (miembros) y 50 % control (no miembros).
- **Estimandos:** hazard ratios de Cox del análisis con los datos de entrenamiento; curva de
  Kaplan-Meier; supervivencia media restringida (RMST) a τ = percentil 90.
- **Métodos comparados:** bootstrap, marginales independientes, cópula gaussiana, CART secuencial,
  cópula con privacidad diferencial (ε ∈ {0,5; 1; 5; 10}), CTGAN, TVAE, PrivBayes (ε = 1) y AIM (ε = 1).
- **Medidas de rendimiento:**
  - solapamiento de IC (Karr et al., 2006);
  - conclusiones cambiadas;
  - distancia KM y diferencia de RMST;
  - pMSE relativo;
  - índice C en TSTR;
  - AUC de inferencia de pertenencia (distancia y densidad);
  - riesgos de Anonymeter (individualización, vinculación e inferencia);
  - copias exactas.

## 6. Datos
GBSG2 (n = 686), WHAS500 (n = 500), FLCHAIN (n = 6.524; submuestra de 2.000) y VA Lung Cancer
(n = 137). Todos son públicos y se distribuyen con `scikit-survival`. En FLCHAIN se excluye
`chapter`, que es la causa de muerte (información posterior al desenlace), y se hace un análisis de
casos completos para la creatinina.

## 7. Plan de análisis
- **Semillas confirmatorias:** 100–199 (100 réplicas por estudio y generador). **No** se reutilizan
  las del piloto.
- Media y error estándar Monte Carlo de cada medida.
- Para H1 y H3: diferencia de medias entre generadores con IC al 95 % (EE Monte Carlo).
- Para H2 y H4: proporción de réplicas por debajo o por encima del umbral, con IC de Wilson.
- **Umbrales del semáforo:** los de `src/synapse/config/study.yaml` en la versión etiquetada
  `prereg-v1`. Cualquier cambio posterior se informa como desviación.

## 8. Decisiones pendientes tras el piloto (para la investigadora principal)
1. Umbral de `decisions_changed`: el bootstrap ya cambia 0,5 conclusiones de media por pura
   variabilidad muestral. Propuesta: verde si ≤ el percentil 75 del bootstrap.
2. Si el semáforo usa el análisis de un solo sintético o el de m = 5 combinados.
3. Si se mantiene `dcr_share_excess` fuera del semáforo (inestable con n < 100).
4. Prevalencia mínima de secretos para el ataque de inferencia (propuesta: 5 %).

## 9. Desviaciones
Cualquier cambio respecto a este documento se lista aquí con fecha y justificación.
