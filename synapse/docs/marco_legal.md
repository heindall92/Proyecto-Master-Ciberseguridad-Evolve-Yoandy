# Marco normativo

> El semáforo de S.Y.N.A.P.S.E. **apoya** una decisión: no la sustituye. La evaluación de impacto
> (art. 35 RGPD) y el criterio del delegado de protección de datos siguen siendo necesarios. Los
> umbrales son una propuesta del equipo investigador, no un estándar legal.

| Norma | Qué dice (resumen) | Cómo la usa el semáforo |
|---|---|---|
| **RGPD, considerando 26** | La información anónima queda fuera del RGPD. Para saber si una persona es identificable hay que considerar todos los medios que razonablemente pueda usar el responsable o un tercero. | Un **rojo en privacidad** significa que un medio razonable (un ataque publicado y reproducible) identifica pacientes: el conjunto sigue siendo dato personal. |
| **RGPD, art. 9** | Los datos de salud son una categoría especial. | Si no es anónimo, el sintético hereda la protección reforzada. |
| **RGPD, art. 89** | Investigación científica con garantías adecuadas, como la seudonimización o la anonimización. | Encaje del uso de sintéticos «ámbar» bajo garantías. |
| **WP29, Dictamen 05/2014 (WP216)** | Una anonimización robusta impide la individualización, la vinculabilidad y la inferencia. | Son exactamente los tres ataques de Anonymeter. |
| **Reglamento (UE) 2025/327 (EHDS)** | Uso secundario de datos de salud: se facilitan anonimizados cuando el fin lo permite; si no, seudonimizados y dentro de un entorno de tratamiento seguro. | Marca la frontera entre **verde** (candidato a anonimizado) y **ámbar** (solo en un entorno seguro). |
| **ISO/IEC 27559:2022** | Marco de desidentificación: el riesgo de reidentificación se evalúa según el contexto, los datos y el entorno. | Justifica medir el riesgo con ataques adaptados al conjunto. |
| **ISO/IEC 20889:2018** | Terminología y clasificación de técnicas de desidentificación. | Vocabulario. |
| **AEPD y EDPS (2021), «10 malentendidos sobre la anonimización»** | La anonimización no es binaria ni permanente; siempre queda un riesgo residual que hay que evaluar. | Justifica el ámbar y la reevaluación periódica. |
| **EDPB, Directrices 01/2025 sobre seudonimización** | Los datos seudonimizados siguen siendo datos personales. | El ámbar se trata como dato personal. |

## Lectura del veredicto

| Privacidad | Utilidad | Veredicto | Qué hacer |
|---|---|---|---|
| verde | verde | **verde** | Candidato a liberación como anonimizado, tras la EIPD y la validación del DPO. |
| verde | ámbar o rojo | **ámbar** | Útil para docencia o pruebas de software, no para inferencia clínica. |
| ámbar | verde o ámbar | **ámbar** | Solo en un entorno de tratamiento seguro y bajo acuerdo de uso. |
| ámbar | rojo | **rojo** | No compensa. |
| rojo | cualquiera | **rojo** | **No liberar:** sigue siendo dato personal de salud. |

Nota: los números de artículo del EHDS se citan a nivel de capítulo y de principio. Antes de citar
un artículo concreto en el paper hay que verificarlo en el texto publicado en el DOUE.
