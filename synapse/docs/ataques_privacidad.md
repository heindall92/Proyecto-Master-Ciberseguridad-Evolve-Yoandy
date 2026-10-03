# Ataques de privacidad

Un conjunto sintético es «anónimo» solo si un adversario razonable no puede usarlo contra los
pacientes reales (RGPD, considerando 26). Por eso lo medimos atacando, no aplicando reglas.

## Modelo de amenaza
- **Adversario:** tiene acceso completo al conjunto sintético publicado y a una muestra de la misma
  población (conocimiento auxiliar). No tiene acceso al generador.
- **Objetivo:** saber si un paciente concreto estaba en el entrenamiento (pertenencia), aislarlo
  (individualización), enlazar sus registros (vinculación) o deducir un atributo sensible
  (inferencia).
- **Línea base:** lo que el atacante consigue sobre pacientes de control, que el generador no vio,
  es inferencia poblacional legítima. **Solo el exceso cuenta como fuga.**

## Ataques

| Ataque | Implementación | Métrica | Referencia |
|---|---|---|---|
| Copias exactas | Distancia de Gower 0 al entrenamiento | % de sintéticos idénticos a un real | — |
| DCR | Vecino más cercano en entrenamiento frente a control | % más cerca del entrenamiento (neutro 0,5) | — |
| Pertenencia (distancia) | Puntuación = −distancia al sintético más cercano | AUC, TPR con FPR del 10 %, ventaja | Chen et al. (2020); Carlini et al. (2022) |
| Pertenencia (densidad) | log p_sint(x) − log p_ref(x), con KDE en espacio de Gower | AUC, TPR con FPR del 10 % | van Breugel et al. (2023) |
| Individualización | Anonymeter, consultas univariantes | Riesgo e IC 95 % | Giomi et al. (2023); WP216 |
| Vinculación | Anonymeter, mitades de columnas, k = 10 | Riesgo e IC 95 % | Giomi et al. (2023); WP216 |
| Inferencia | Anonymeter, cada atributo sensible del estudio | Riesgo máximo e IC 95 % | Giomi et al. (2023); WP216 |

## Validación de los propios ataques
Un ataque que no detecta lo obvio no sirve. Por eso la batería de pruebas exige que:
- el `bootstrap` (copias de filas) sea detectado por **todos** los ataques: AUC > 0,75 y copias del 100 %;
- el muestreo de `marginal` (sin dependencia entre columnas) **no** sea detectado: AUC entre 0,4 y 0,6;
- si los «sintéticos» son el propio control, el ataque de pertenencia no favorezca a los miembros.

## Artefactos detectados en el piloto
1. **DCR con n pequeño.** En VA Lung (68 pacientes por mitad), la DCR marcaba riesgo incluso con
   privacidad diferencial, porque depende de la partición concreta: los sintéticos alejados caen del
   lado con más puntos extremos. Se informa, pero **no** puntúa.
2. **Secretos raros.** El riesgo de inferencia de Anonymeter divide por (1 − acierto del control).
   Con un secreto del 1,5 % (`mgus`), ese denominador es casi nulo y un generador que no puede
   filtrar daba 0,24. Se excluyen los secretos con clase minoritaria < 5 %
   (`privacy.MIN_SECRET_PREVALENCE`).
3. **CART individualiza.** Sus valores sintéticos son valores reales tomados de las hojas, así que las
   combinaciones raras sobreviven. Es un hallazgo, no un error, y es coherente con la literatura
   sobre `synthpop` sin suavizado.

## Uso responsable
Los ataques se ejecutan solo sobre datos públicos y sobre sintéticos generados por el propio
equipo. No se intenta reidentificar a ninguna persona real fuera de este marco de evaluación.
