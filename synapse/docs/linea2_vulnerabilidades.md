# Línea 2 (futura): supervivencia de vulnerabilidades en hospitales

> Idea original del proyecto conjunto, aparcada para después. La lideraría Yoandy, con Maricel como
> coautora en la parte estadística.

## Pregunta
¿Cuánto «vive» una vulnerabilidad en una red hospitalaria antes de ser parcheada, y qué variables
clínicas aceleran o frenan su cierre?

## Diseño estadístico (mejorado)
- **Unidad:** una vulnerabilidad. **Tiempo:** días desde el descubrimiento. **Censura:** la
  vulnerabilidad sigue abierta al final del seguimiento.
- **Riesgos competitivos:** parche, control compensatorio o riesgo aceptado, retirada del activo y
  explotación. Se estiman con Aalen-Johansen y Fine-Gray, no con Kaplan-Meier ingenuo.
- **Censura por intervalo:** depende de la cadencia del escáner.
- **Truncamiento por la izquierda:** la vulnerabilidad existía antes del primer escaneo.
- **Fragilidad:** efecto aleatorio por hospital o por fabricante.
- **Hazards no proporcionales:** en los equipos de soporte vital solo se puede parchear durante las
  ventanas de mantenimiento. Se comprueba con residuos de Schoenfeld y coeficientes que varían en el
  tiempo.
- **Métrica para la dirección:** RMST a 90 días («días medios de exposición en el primer
  trimestre») y probabilidad de superar el plazo de la política de parcheo.

## Covariables clínicas
- Tipo de activo: administrativo, clínico, IoMT diagnóstico o IoMT de soporte vital.
- Exposición de ePHI.
- CVSS, EPSS y pertenencia a CISA KEV.
- Priorización SSVC con el árbol del *deployer*.

## Puente GRC
Se reutiliza el crosswalk de Rosetta (ENS RD 311/2022, ISO/IEC 27001:2022, NIS2 e ISO/IEC 42001),
más MDR 2017/745 (Anexo I §17), IEC 81001-5-1 e IEC 80001-1. Ejemplo: Kerberoasting (T1558.003)
se asocia a ENS op.acc.6, a ISO A.5.17 y A.8.5, y a NIS2 art. 21.2.
**Ojo:** la cláusula A.9 es de la ISO 27001:2013 y no existe en la versión de 2022.

## Datos
Con permiso del hospital y con anonimización, o bien un simulador calibrado con verdad conocida
(estudio ADEMP), siguiendo la misma metodología de S.Y.N.A.P.S.E.
