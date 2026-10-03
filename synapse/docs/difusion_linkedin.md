# Difusión en LinkedIn (borradores para Maricel)

Cinco publicaciones, una por semana. Cada una cuenta **un** hallazgo con **una** imagen del
proyecto. Están escritas para que Maricel las publique con su voz: cámbialas todo lo que quieras.
Etiqueta a Yoandy en las que hablen de ataques.

---

## 1 · ¿Se puede compartir un ensayo clínico sin compartir a sus pacientes?
**Imagen:** `docs/img/app-inicio.png`

> Durante diez años enseñé Estadística en una universidad de ciencias médicas. Una pregunta volvía
> siempre: ¿cómo investigamos con datos de pacientes sin exponerlos?
>
> Los datos sintéticos prometen una respuesta: pacientes «falsos» que imitan a los reales. Pero
> nadie suele comprobar dos cosas a la vez: si las conclusiones médicas se mantienen y si se puede
> reconocer a los pacientes originales.
>
> Con Yoandy Ramírez Delgado hemos construido S.Y.N.A.P.S.E. para medirlo, con cuatro estudios
> clínicos reales y públicos. En las próximas semanas compartiré lo que hemos encontrado.
> Spoiler: «sintético» no significa «anónimo».
>
> 🔗 github.com/maricelmeneses/synapse
>
> #Bioestadística #DatosSintéticos #SaludDigital #RGPD #EHDS #AnálisisDeSupervivencia

## 2 · El sintético que borró el efecto del tratamiento
**Imagen:** `results/figures/fig_forest_gbsg2_copula.png`

> En el ensayo GBSG2 (cáncer de mama), la hormonoterapia reduce el riesgo de recidiva un 29 %
> (HR = 0,71). Es la conclusión principal del estudio.
>
> Generamos pacientes sintéticos con una cópula gaussiana, uno de los métodos más usados, y
> repetimos el análisis de Cox. En algunas réplicas, el efecto protector dejó de ser significativo.
>
> Los datos «se parecían» variable a variable. La conclusión clínica, no.
>
> Por eso medimos la validez inferencial (solapamiento de intervalos, reglas de combinación como en
> la imputación múltiple), no solo el parecido estadístico.
>
> #Bioestadística #ModeloDeCox #DatosSintéticos #InvestigaciónClínica

## 3 · Así atacamos nuestros propios datos (con Yoandy)
**Imagen:** `results/figures/fig_pareto_gbsg2.png`

> Un dato sintético solo es anónimo si nadie puede usarlo contra los pacientes reales. Así que lo
> comprobamos atacándolo.
>
> Yoandy lanzó contra cada conjunto sintético ataques de inferencia de pertenencia y los tres
> criterios de anonimización del Grupo del Artículo 29 (individualización, vinculación e
> inferencia).
>
> Resultado: los métodos que mejor conservan las conclusiones son los que más pacientes delatan.
> Copiar pacientes reales da un AUC de 0,82 en el ataque de pertenencia (0,5 sería adivinar al
> azar), y el método CART alcanza un riesgo de individualización de 0,80 sobre 1.
>
> #Privacidad #Ciberseguridad #DatosSintéticos #RGPD

## 4 · El precio de la privacidad diferencial
**Imagen:** `results/figures/fig_epsilon.png`

> La privacidad diferencial ofrece una garantía matemática: ningún paciente cambia mucho el
> resultado. Tiene un precio.
>
> Con ε ≤ 1, el solapamiento entre los intervalos de confianza reales y sintéticos cae a 0,24–0,30.
> Los pacientes están protegidos, pero el modelo de Cox ya no dice lo mismo.
>
> No es un argumento contra la privacidad diferencial: es un argumento para medir y declarar el
> coste antes de publicar datos.
>
> #PrivacidadDiferencial #Bioestadística #EHDS

## 5 · Preprint y explorador abierto
**Imagen:** `docs/img/app-panel.png`

> Publicamos el preprint de S.Y.N.A.P.S.E. y su explorador web: 320 evaluaciones completas sobre
> cuatro estudios clínicos, con un semáforo de liberación basado en el RGPD, el EHDS y la
> ISO/IEC 27559.
>
> Todo el código es abierto y reproducible bit a bit.
>
> 📄 Preprint: [enlace con el DOI]
> 🔗 Explorador: [enlace de GitHub Pages]
>
> #OpenScience #Bioestadística #SaludDigital #DatosSintéticos

---

## Perfil
- **Titular sugerido:** «Bioestadística y datos de salud · Investigadora principal en S.Y.N.A.P.S.E. ·
  10 años de docencia universitaria en Estadística».
- **Destacados:** fijar el repositorio y, cuando exista, el preprint.
- **Proyectos:** S.Y.N.A.P.S.E., con el rol de investigadora principal y enlace al repositorio.
- **Aptitudes:** Análisis de supervivencia · Modelos de Cox · Python · Datos sintéticos ·
  Privacidad de datos de salud.
