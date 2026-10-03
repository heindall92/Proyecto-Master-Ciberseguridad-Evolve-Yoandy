# Guion de locución — Valhalla SOC (Práctica 3)

Una grabación por escena. Lee el texto tal cual, con tu ritmo y tu acento: el vídeo se ajusta solo
a lo que dures en cada escena.

## Cómo grabar

1. OBS, como en la muestra: solo el micrófono y el audio de escritorio desactivado.
2. **Un archivo por escena.** Antes de empezar a hablar, 1 segundo de silencio; entre frase y frase, una pausa natural; al acabar, 1 segundo de silencio.
3. Si te equivocas, para y repite la escena entera; no hace falta editar nada.
4. Guarda cada archivo en `video/voz_propia/` con el **nombre exacto de la escena** (por ejemplo `s01_portada.mp4`). Valen `.mp4`, `.mkv`, `.wav`, `.m4a` y `.mp3`.
5. Puedes grabar en varios ratos y en cualquier orden. Si repites una escena, sustituye su archivo.

Cuando estén todas: `python pipeline/montar.py --voz propia` y el render final.

| Escena | Archivo | Lectura aprox. |
|---|---|---|
| Valhalla SOC | `s01_portada` | 23 s |
| El equipo | `s02_equipo` | 27 s |
| El problema | `s03_problema` | 23 s |
| Del prototipo al producto | `s04_reto` | 24 s |
| En números | `s05_cifras` | 7 s |
| Requisitos | `s06_requisitos` | 27 s |
| Arquitectura | `s08_arquitectura` | 38 s |
| Contenedores y decisiones | `s09_contenedores` | 22 s |
| Instalación desde cero | `s10_instalacion` | 22 s |
| El stack en marcha | `s10b_arranque` | 10 s |
| Acceso | `s11_login` | 14 s |
| Vista general | `s12_vista_general` | 22 s |
| SIEM | `s13_siem` | 18 s |
| Ataque al honeypot | `s14_ataque` | 17 s |
| Honeypots | `s15_honeypots` | 10 s |
| Gestión de incidentes | `s16_workspace` | 25 s |
| Runbooks | `s17_runbooks` | 11 s |
| Bloqueo de IPs | `s18_bloqueo` | 16 s |
| Inteligencia de vulnerabilidades | `s19_inteligencia` | 19 s |
| Activos | `s20_activos` | 13 s |
| Métricas y caza de amenazas | `s21_bifrost` | 20 s |
| Informes con integridad | `s22_informes` | 17 s |
| Informe GRC | `s23_grc` | 12 s |
| Usuarios, roles e invitaciones | `s24_usuarios` | 22 s |
| Perfil del analista | `s24b_perfil` | 12 s |
| Chat de equipo y asistente de IA | `s25_chat` | 19 s |
| Apariencia e idioma | `s25b_apariencia` | 8 s |
| Búsqueda y notificaciones | `s25c_busqueda` | 9 s |
| Sistema | `s26_sistema` | 8 s |
| Móvil y acceso remoto por VPN | `s27_movil` | 21 s |
| Cuando algo va mal | `s28_errores` | 23 s |
| Modelo de amenazas STRIDE | `s29_stride` | 9 s |
| Hallazgos en nuestro propio SOC | `s30_hallazgos` | 22 s |
| Cadena de suministro | `s31_dependencias` | 14 s |
| Pruebas automáticas | `s32_pruebas` | 20 s |
| Matriz de trazabilidad | `s33_trazabilidad` | 7 s |
| Limitaciones y trabajo futuro | `s34_limitaciones` | 22 s |
| Gracias | `s35_cierre` | 20 s |

Lectura total aproximada: **11 min 32 s** (más las pausas).

---

## 1. Valhalla SOC

**Archivo:** `voz_propia/s01_portada.mp4` · **En pantalla:** diapositiva animada

> Hola. Soy Yoandy Ramírez y os presento Valhalla SOC, el proyecto del grupo Proyecto Valhalla para la Práctica 3 del máster en Ciberseguridad de Evolve.
>
> Es un centro de operaciones de seguridad completo que cabe en un portátil: detecta ataques reales, los investiga con inteligencia artificial local y los convierte en informes que se pueden defender.

---

## 2. El equipo

**Archivo:** `voz_propia/s02_equipo.mp4` · **En pantalla:** diapositiva animada

> Somos cinco. Santiago Visso, jefe de proyecto, coordinó el grupo y montó el laboratorio de ataque.
>
> Julieta Tenti creó el generador de informes ejecutivos.
>
> Rosalino Martínez hizo las integraciones de inteligencia artificial.
>
> Santiago de Prada, el honeypot Cowrie y la simulación de ataques.
>
> Y yo me he ocupado de la arquitectura, el desarrollo y la integración. Hoy lo presento en nombre de todo el equipo.

---

## 3. El problema

**Archivo:** `voz_propia/s03_problema.mp4` · **En pantalla:** diapositiva animada

> Un equipo pequeño no puede permitirse un SOC comercial, pero los ataques le llegan igual.
>
> Las herramientas abiertas, como Wazuh, existen, pero están sueltas: alguien tiene que unirlas y convertir las alertas en una respuesta.
>
> Valhalla las une en un producto que se instala con un comando, y donde todo corre en local, incluida la inteligencia artificial.

---

## 4. Del prototipo al producto

**Archivo:** `voz_propia/s04_reto.mp4` · **En pantalla:** diapositiva animada

> En las prácticas anteriores construimos un prototipo.
>
> Tenía datos de ejemplo, solo se instalaba en nuestra máquina, había secretos en el historial y ninguna prueba.
>
> El reto era convertirlo en un producto: instalable desde cero, sin datos inventados, con la seguridad analizada y cada requisito probado.
>
> Y una regla para todo: si falta un dato, la interfaz lo dice.

---

## 5. En números

**Archivo:** `voz_propia/s05_cifras.mp4` · **En pantalla:** diapositiva animada

> En números: veinticinco requisitos.
>
> Ciento dieciocho pruebas automáticas superadas.
>
> Cero vulnerabilidades conocidas en las dependencias, y once secciones rediseñadas.

---

## 6. Requisitos

**Archivo:** `voz_propia/s06_requisitos.mp4` · **En pantalla:** diapositiva animada

> Cada requisito tiene un criterio de aceptación comprobable.
>
> Dieciséis funcionales cubren el ciclo completo de un SOC: autenticación y roles, incidentes, informes, caza de amenazas, bloqueo de IPs, asistente de IA y acceso por VPN.
>
> Nueve no funcionales fijan cómo debe comportarse: seguridad de sesión, validación, auditoría, privacidad, instalación reproducible, diseño adaptable y rendimiento.
>
> Durante la demo, arriba a la derecha, veréis qué requisito se está demostrando.

---

## 7. Arquitectura

**Archivo:** `voz_propia/s08_arquitectura.mp4` · **En pantalla:** diapositiva animada

> Todo corre en local con Docker Compose.
>
> El atacante llega a Cowrie, un honeypot SSH y Telnet que registra cada contraseña y cada comando.
>
> Wazuh aplica nuestras reglas, mapeadas a MITRE ATT&CK, y guarda las alertas en el indexador.
>
> El backend en FastAPI lee el SIEM, abre incidentes y calcula las métricas, con PostgreSQL.
>
> La consola, en React, lo presenta por REST y WebSocket.
>
> La inteligencia artificial es un modelo Qwen de tres mil millones de parámetros, servido por Ollama.
>
> Y Tailscale publica la consola solo por HTTPS, a través de una VPN.

---

## 8. Contenedores y decisiones

**Archivo:** `voz_propia/s09_contenedores.mp4` · **En pantalla:** diapositiva animada

> Cada pieza expone lo mínimo.
>
> La base de datos y el indexador solo están en la red interna; la API de Wazuh y Ollama, en localhost.
>
> El atacante del laboratorio vive en su propia red aislada.
>
> La inteligencia artificial redacta, pero nunca aporta cifras.
>
> Y la autorización se decide siempre en el servidor.

---

## 9. Instalación desde cero

**Archivo:** `voz_propia/s10_instalacion.mp4` · **En pantalla:** grabación real de la consola — Instalación desde el repositorio público · **Requisitos:** RNF-07

> Todo se instala con un solo comando: install punto sh, o install punto ps1 en Windows.
>
> Genera secretos y certificados propios, levanta el stack, descarga el modelo y configura Wazuh.
>
> Desde un clon limpio, el primer intento falló por los permisos de ejecución en Git. Lo corregimos, y la instalación terminó en cinco minutos.

---

## 10. El stack en marcha

**Archivo:** `voz_propia/s10b_arranque.mp4` · **En pantalla:** grabación real de la consola — Los servicios en marcha · **Requisitos:** RNF-07

> En el día a día, un lanzador lo arranca todo con un doble clic.
>
> Docker compose confirma los doce contenedores en marcha, y el backend responde.

---

## 11. Acceso

**Archivo:** `voz_propia/s11_login.mp4` · **En pantalla:** grabación real de la consola — Acceso · **Requisitos:** RF-01, RNF-01

> Empezamos la demostración por el acceso.
>
> La sesión viaja en cookies HttpOnly, con un token JWT y protección CSRF.
>
> Con una contraseña incorrecta la consola lo indica, y los intentos se limitan por IP.

---

## 12. Vista general

**Archivo:** `voz_propia/s12_vista_general.mp4` · **En pantalla:** grabación real de la consola — Vista general · **Requisitos:** RNF-05

> La vista general resume el periodo: alertas, críticas, agentes e incidentes abiertos.
>
> Debajo, las alertas de Wazuh, el volumen, la severidad y los atacantes.
>
> Todo sale del SIEM. Esa regla destapó un fallo: el backend generaba unas dos mil cuatrocientas sesiones falsas al día al comprobar el honeypot. Lo corregimos, y limpiamos el SIEM.

---

## 13. SIEM

**Archivo:** `voz_propia/s13_siem.mp4` · **En pantalla:** grabación real de la consola — SIEM: alertas en directo · **Requisitos:** RF-05

> En el SIEM, las alertas llegan en directo por un webhook con secreto o firma HMAC.
>
> Podemos filtrarlas y agrupar las similares.
>
> Abrimos una crítica: acceso tras fuerza bruta, con su evento original y sus técnicas de ATT&CK.
>
> Con «escalar», se convierte en un incidente.

---

## 14. Ataque al honeypot

**Archivo:** `voz_propia/s14_ataque.mp4` · **En pantalla:** grabación real de la consola — Ataque real al honeypot · **Requisitos:** RF-05

> Ahora, un ataque real desde el contenedor atacante.
>
> Nmap encuentra el SSH y el Telnet del honeypot, e hydra prueba contraseñas típicas.
>
> Cada intento llega a Wazuh en segundos, y salta nuestra regla de fuerza bruta. Es actividad real, no datos simulados.

---

## 15. Honeypots

**Archivo:** `voz_propia/s15_honeypots.mp4` · **En pantalla:** grabación real de la consola — Honeypots · **Requisitos:** RF-05, RNF-05

> En Honeypots vemos ese ataque desde el señuelo.
>
> Sesiones, intentos fallidos, accesos logrados y actividad por hora.
>
> Y las credenciales más probadas por los atacantes.

---

## 16. Gestión de incidentes

**Archivo:** `voz_propia/s16_workspace.mp4` · **En pantalla:** grabación real de la consola — Workspace: ciclo del incidente · **Requisitos:** RF-06

> En el Workspace aparece el incidente escalado, en un tablero con las fases de respuesta.
>
> Arriba, los indicadores del equipo: fuera de SLA, sin asignar y tiempo de resolución.
>
> Lo pasamos a investigación, anotamos los hallazgos, y el caso nos sugiere el runbook adecuado.
>
> Cada cambio queda en el historial. Al resolverlo lo clasificamos como verdadero positivo, y eso alimenta las métricas.

---

## 17. Runbooks

**Archivo:** `voz_propia/s17_runbooks.mp4` · **En pantalla:** grabación real de la consola — Runbooks NIST 800-61 · **Requisitos:** RF-07

> Hay veinte runbooks, con las cinco fases de NIST 800-61 y comandos reales.
>
> El de fuerza bruta SSH tiene doce pasos. Se pueden crear y editar, con validación.

---

## 18. Bloqueo de IPs

**Archivo:** `voz_propia/s18_bloqueo.mp4` · **En pantalla:** grabación real de la consola — Contención: bloqueo de la IP · **Requisitos:** RF-13, RNF-05

> Contención: bloqueamos la IP atacante. Como es destructivo, hay que mantener pulsado.
>
> Valhalla lo aplica en Wazuh, y si Wazuh no lo confirma, no lo da por bloqueado: preferimos avisar de un fallo a mostrar una protección que no existe.

---

## 19. Inteligencia de vulnerabilidades

**Archivo:** `voz_propia/s19_inteligencia.mp4` · **En pantalla:** grabación real de la consola — Inteligencia de amenazas · **Requisitos:** RF-12

> En Inteligencia están las CVE explotadas del catálogo KEV de CISA.
>
> Se priorizan con una fórmula documentada: explotación, CVSS, exploit público y uso en ransomware.
>
> Y desde indicadores se consulta la reputación de una IP, un dominio o un hash, y el mapa sitúa a los atacantes.

---

## 20. Activos

**Archivo:** `voz_propia/s20_activos.mp4` · **En pantalla:** grabación real de la consola — Activos · **Requisitos:** RNF-05

> En Activos, los equipos con agente de Wazuh y sus vulnerabilidades reales.
>
> El escáner no analizaba nada por un catálogo desfasado; cargamos una instantánea reciente, y aparecieron las doce vulnerabilidades reales del equipo.

---

## 21. Métricas y caza de amenazas

**Archivo:** `voz_propia/s21_bifrost.mp4` · **En pantalla:** grabación real de la consola — Bifröst: métricas y caza · **Requisitos:** RF-14, RF-11

> Bifröst calcula las métricas: MTTR, antigüedad, tasa de resolución y cobertura de ATT&CK.
>
> El MTTR usa la fecha real de resolución, y la cobertura, un treinta por ciento, se muestra tal cual.
>
> Y tiene siete consultas de caza: aquí, las credenciales con las que el atacante consiguió entrar.

---

## 22. Informes con integridad

**Archivo:** `voz_propia/s22_informes.mp4` · **En pantalla:** grabación real de la consola — Informe SOC con huella SHA-256 · **Requisitos:** RF-10

> En Informes generamos un informe SOC del periodo, con su clasificación TLP.
>
> Queda congelado con una huella SHA-256, y el escudo verifica que nadie lo ha alterado.
>
> La IA puede añadir un resumen, pero las cifras las calcula siempre el backend.

---

## 23. Informe GRC

**Archivo:** `voz_propia/s23_grc.mp4` · **En pantalla:** grabación real de la consola — Informe GRC · **Requisitos:** RF-10

> El informe GRC lo traduce a gobierno y riesgo: matriz de riesgo, madurez NIST CSF 2.0 y plan de tratamiento.
>
> Con correspondencia con el ENS, ISO 27001, NIS2 e ISO 42001.

---

## 24. Usuarios, roles e invitaciones

**Archivo:** `voz_propia/s24_usuarios.mp4` · **En pantalla:** grabación real de la consola — Usuarios, roles e invitaciones · **Requisitos:** RF-02, RF-03, RF-04, RF-09

> En Usuarios hay cuatro roles, comprobados en cada endpoint del servidor.
>
> Vemos quién está conectado, desde qué dispositivo y por qué red.
>
> Damos de alta a un analista con una invitación de un solo uso, que caduca en veinticuatro horas; solo guardamos la huella del enlace.
>
> Después la anulamos, y eliminamos al usuario manteniendo pulsado.

---

## 25. Perfil del analista

**Archivo:** `voz_propia/s24b_perfil.mp4` · **En pantalla:** grabación real de la consola — Mi perfil · **Requisitos:** RF-09, RF-01

> Cada analista tiene su perfil: sus incidentes, su actividad en la auditoría y su sesión actual, con dispositivo e IP.
>
> También ve sus otras sesiones abiertas, y puede cambiar su contraseña.

---

## 26. Chat de equipo y asistente de IA

**Archivo:** `voz_propia/s25_chat.mp4` · **En pantalla:** grabación real de la consola — Chat de equipo y asistente IA · **Requisitos:** RF-08, RF-15, RNF-06

> El chat tiene canal de equipo y mensajes directos que ni el administrador puede leer.
>
> Si escribimos arroba IA, responde el asistente local, con un glosario del SOC para no inventar términos.
>
> Este requisito se verifica a mano, porque la respuesta de un modelo no es determinista.

---

## 27. Apariencia e idioma

**Archivo:** `voz_propia/s25b_apariencia.mp4` · **En pantalla:** grabación real de la consola — Tema, color e idioma · **Requisitos:** RNF-08

> Cada analista elige su color de acento, tema claro u oscuro, e idioma.
>
> La interfaz cambia al instante, sin recargar.

---

## 28. Búsqueda y notificaciones

**Archivo:** `voz_propia/s25c_busqueda.mp4` · **En pantalla:** grabación real de la consola — Búsqueda global y avisos

> Con control K se salta a cualquier sección.
>
> Y la campana avisa de los incidentes pendientes, para asignárselos o ir al Workspace.

---

## 29. Sistema

**Archivo:** `voz_propia/s26_sistema.mp4` · **En pantalla:** grabación real de la consola — Sistema · **Requisitos:** RNF-05, RNF-04

> En Sistema, la salud y la latencia de cada integración.
>
> Y los monitores de detección y el registro de auditoría.

---

## 30. Móvil y acceso remoto por VPN

**Archivo:** `voz_propia/s27_movil.mp4` · **En pantalla:** grabación real de la consola — Móvil y acceso remoto por VPN · **Requisitos:** RF-16, RNF-08

> En el móvil, la consola se adapta a trescientos noventa píxeles.
>
> Desde fuera se entra por Tailscale, solo por HTTPS, con un cortafuegos que cierra a la VPN los puertos de Docker.
>
> Cada sesión muestra la cuenta de VPN, y si no coincide con la vinculada, los administradores reciben un aviso.

---

## 31. Cuando algo va mal

**Archivo:** `voz_propia/s28_errores.mp4` · **En pantalla:** diapositiva animada · **Requisitos:** RNF-01, RNF-02, RNF-03, RNF-04

> ¿Y cuando algo va mal?
>
> Sin token CSRF, la petición se rechaza; sin permisos, un 403; con HTML, se neutraliza.
>
> Una IP falsificada en la cabecera X-Forwarded-For se ignora si no viene de un proxy de confianza.
>
> Si un servicio cae, Sistema lo indica, y cada escritura queda auditada, sin guardar el cuerpo de la petición.

---

## 32. Modelo de amenazas STRIDE

**Archivo:** `voz_propia/s29_stride.mp4` · **En pantalla:** diapositiva animada

> Analizamos el propio SOC con un modelo STRIDE.
>
> Para cada categoría documentamos las amenazas, la mitigación, la prueba y el riesgo residual.

---

## 33. Hallazgos en nuestro propio SOC

**Archivo:** `voz_propia/s30_hallazgos.mp4` · **En pantalla:** diapositiva animada

> Y encontramos fallos reales.
>
> La API de Wazuh tenía la credencial de fábrica, y los usuarios de demostración del indexador, contraseñas públicas.
>
> Había claves privadas en el repositorio: reescribimos el historial, y cada instalación genera las suyas.
>
> Y el atacante compartía red con la base de datos; ahora está aislado. Todo está corregido.

---

## 34. Cadena de suministro

**Archivo:** `voz_propia/s31_dependencias.mp4` · **En pantalla:** diapositiva animada

> En las dependencias, pip-audit encontró once paquetes vulnerables.
>
> Npm audit, veintiséis avisos, y Trivy, cuarenta y nueve en la imagen. Hoy, cero.
>
> Y la integración continua lo repite en cada cambio y cada lunes.

---

## 35. Pruebas automáticas

**Archivo:** `voz_propia/s32_pruebas.mp4` · **En pantalla:** grabación real de la consola — Pruebas automáticas

> Las pruebas: al empezar había diecisiete, y once no arrancaban.
>
> Hoy el backend tiene sesenta y dos, etiquetadas por requisito y sin tocar datos reales: sesenta y dos de sesenta y dos, superadas.
>
> Más cincuenta y seis en la consola, y GitHub Actions lo ejecuta todo en cada cambio.

---

## 36. Matriz de trazabilidad

**Archivo:** `voz_propia/s33_trazabilidad.mp4` · **En pantalla:** diapositiva animada

> La matriz de trazabilidad cubre los veinticinco requisitos.
>
> Veintidós con pruebas automáticas, y tres con verificación manual documentada.

---

## 37. Limitaciones y trabajo futuro

**Archivo:** `voz_propia/s34_limitaciones.mp4` · **En pantalla:** diapositiva animada

> Las limitaciones también forman parte del producto.
>
> El catálogo de vulnerabilidades es una instantánea, la red local va por HTTP, la IA es lenta en CPU y la auditoría vive en la misma base de datos.
>
> Como trabajo futuro: actualización automática, TLS en la red local, GPU, auditoría exportada y pruebas de extremo a extremo.

---

## 38. Gracias

**Archivo:** `voz_propia/s35_cierre.mp4` · **En pantalla:** diapositiva animada

> Valhalla SOC termina como un producto instalable, auditado y verificable.
>
> Un producto no es añadir funciones, sino demostrar que funcionan, son seguras y dicen la verdad.
>
> Un SOC debe pasar el mismo análisis que exige a lo que vigila.
>
> Gracias. El código está en el repositorio, con la etiqueta v1.0-practica3.

