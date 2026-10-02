# Grabaciones del producto real · especificación de clips

Este documento es el encargo de grabación del vídeo de la Práctica 3. Lo ejecuta una sesión
que tenga **el stack de Valhalla SOC levantado con Docker** (perfil `labs`). El resultado son
clips MP4 del producto **en ejecución real**, que el montaje (`pipeline/montar.py` + Remotion)
inserta en su escena, sincronizados con la voz en off, los rótulos de requisito y los subtítulos.

> El enunciado (apdo. 6) exige demostrar el producto real desplegado desde el repositorio:
> «una demostración sobre maquetas» puntúa como insuficiente y una «demostración manipulada»
> suspende. Por eso estos clips graban la consola de verdad, con datos del laboratorio.

## Reglas (obligatorias)

1. **Nada inventado.** No se insertan datos a mano en la base de datos ni en el SIEM para que
   «quede bonito». La actividad sale del laboratorio (atacante automático + ataques manuales al
   honeypot). Lo que el producto genere al usarlo (incidentes, comentarios, usuarios, informes,
   mensajes de chat) sí vale, porque es uso real.
2. **Ningún secreto en pantalla.** Ni el `.env`, ni contraseñas, ni tokens, ni claves de API.
   Las contraseñas se rellenan con `escribir_secreto()` (el campo muestra puntos). Los enlaces de
   invitación no se muestran completos. Las contraseñas del honeypot sí pueden verse: son
   contraseñas típicas de un atacante (`123456`, `admin`…), no credenciales reales.
3. **Ningún dato personal real.** Usuarios nuevos con nombres y correos ficticios
   (`laura.analista@valhalla.lab`, etc.).
4. **Si algo falla, se graba igual y se anota** en `REPORTE.md`. No se oculta. El enunciado
   valora mostrar las limitaciones con honestidad.
5. **Esperas largas:** se pueden recortar o acelerar, pero cada corte se anota en `CORTES.md`
   (clip, segundo y motivo). El montaje lo indicará en pantalla, como pide el enunciado.

## Cómo grabar

Herramienta: [`grabacion/grabador.py`](grabacion/grabador.py), ya probada. Lo que hace:

- Abre Chromium en modo aplicación, sin barra de direcciones, sobre un display virtual (Xvfb)
  de 1920×1080.
- Graba ese display con ffmpeg: H.264, 30 fps, CRF 18 (texto nítido) y sin audio.
- Pinta un cursor visible que sigue al ratón y marca cada clic con una onda verde.
- Las terminales **ejecutan el comando de verdad** y muestran su salida en directo.
  `interactivo()` responde a preguntas, como las contraseñas en `ssh` contra el honeypot.
- Junto a cada `.mp4` guarda un `.json` con la línea de tiempo de acciones. El montaje lo usa
  para que la voz diga «pulsamos…» justo cuando se pulsa.

**No cambies de rama en el clon donde corre el stack** (Docker monta ficheros de ese
directorio). Trae la herramienta y esta especificación en un *worktree* aparte:

```bash
cd <clon-donde-corre-el-stack>
git fetch origin claude/zen-curie-f3tw1g
git worktree add ../valhalla-video origin/claude/zen-curie-f3tw1g   # aquí van todas las salidas
cd ../valhalla-video
pip install playwright==1.56.0 pexpect     # o la versión que case con el Chromium instalado
sudo apt-get install -y xvfb ffmpeg        # si no están
python -m playwright install chromium      # solo si no hay Chromium de Playwright
```

```python
import os, sys
sys.path.insert(0, "video/grabacion")   # desde ../valhalla-video
from grabador import Grabador

with Grabador(salida="video/public/clips", url_base="http://localhost:3000") as g:
    with g.clip("c04_login"):
        g.ir("/")
        g.escribir("input[autocomplete=username]", "admin")         # ajustar selectores a la consola
        g.escribir_secreto("input[type=password]", os.environ["ADMIN_PASSWORD"])
        g.clic("button[type=submit]", texto="iniciar sesión")
        g.pausa(3)
```

API: `ir(ruta)`, `clic(selector | (x, y))`, `mover(…)`, `escribir(sel, texto)`,
`escribir_secreto(sel, valor)`, `mantener(sel, ms)` para los botones de «mantener pulsado»,
`tecla("Control+K")`, `desplazar(dy, objetivo=…)`, `pausa(s)`, `marcar("texto")` y
`captura(nombre)`. Para terminales: `t = g.terminal("título")`, `t.ejecutar(cmd, filtro=…)` y
`t.interactivo(cmd, [(patrón, respuesta), …])`.

Escribe un script por clip (o uno con todos) en `video/grabacion/clips/`, para poder repetir un
clip sin rehacer los demás. Los selectores se sacan del código de la consola
(`frontend/app/src/ui/*.tsx`): usa preferentemente textos visibles (`text=…`, `role=button[name=…]`).

### Ritmo

- Movimientos de ratón tranquilos, de 0,6 a 0,9 s, y pausas de 1 a 2 s tras cada acción para
  que se lea el resultado.
- **Duración mínima de cada clip:** la de la tabla siguiente. Es lo que dura la voz de su escena.
  Mejor que sobre (el montaje recorta o acelera hasta 1,5×) a que falte (el último fotograma se
  quedaría congelado).
- Tema **oscuro** y acento **Bosque** por defecto, salvo en el clip de personalización.
  Interfaz en **español**.

## Antes de grabar

1. Stack levantado con el perfil `labs` **al menos 20 minutos antes**, para que haya actividad
   real: alertas, sesiones del honeypot y, a ser posible, el escáner de vulnerabilidades ya
   cargado (unos 30 min tras instalar).
2. Lanza además un par de ataques manuales al honeypot (`ssh root@localhost -p 2222` con
   contraseñas típicas) unos minutos antes, para que haya fuerza bruta reciente.
3. Que haya al menos un incidente abierto para el clip del Workspace. Créalo desde una alerta
   con «+ INC»; eso es uso real del producto.
4. Usuario `admin`, con la contraseña de `ADMIN_PASSWORD` cargada en el entorno y no en pantalla.

## Clips

| Clip | Mín. | Qué tiene que verse (en este orden) |
|---|---|---|
| `c01_instalacion` | 42 s | **Terminal.** `git clone` del repo en una carpeta nueva y `./install.sh` en un entorno limpio (sin `.env`, sin certificados, sin volúmenes previos), con sus 7 pasos en verde. Si la instalación completa no cabe en este entorno sin pisar el stack principal, graba `./install.sh` con `NO_LABS=1 SKIP_OLLAMA=1` en un clon limpio (anótalo en `REPORTE.md`). Acelera las descargas y anótalo en `CORTES.md`. Filtra cualquier línea que imprima secretos con `filtro=`. |
| `c02_servicios` | 26 s | **Terminal.** `docker compose --profile labs ps`, con todos los servicios *Up/healthy*. Después `curl -s localhost:8000/health`. |
| `c03_wazuh` | 31 s | Consola nativa de Wazuh en `https://localhost:5601`. Inicia sesión con `escribir_secreto` (o graba ya dentro). Muestra los agentes, el panel de alertas/eventos de seguridad con las alertas del honeypot y, si da tiempo, las reglas propias (fuerza bruta, acceso tras fuerza bruta). |
| `c04_login` | 25 s | Pantalla de acceso de Valhalla. Usuario `admin`, contraseña oculta, «Iniciar sesión» y entrada a la Vista general. |
| `c05_vista_general` | 40 s | Vista general: pasa el cursor por las 4 tarjetas, la tabla de alertas, el volumen, la severidad y los atacantes. Cambia de periodo (última hora → 24 h → 7 días). |
| `c06_interfaz` | 40 s | **Ctrl + K**: escribe «runbooks» y entra. **Campana**: abre las notificaciones. **Centro de ayuda (?)**: ábrelo y ciérralo. **ES → EN → ES**. **Apariencia**: tema claro, recorre 3 o 4 colores de acento, vuelve a oscuro + Bosque. Enseña el modo TV si se puede salir de él con limpieza. |
| `c07_siem` | 34 s | SIEM: alertas en directo, filtro por periodo y búsqueda. Abre el detalle de una alerta de fuerza bruta, el panel ATT&CK y los atacantes. Pulsa **«Escalar a incidente»** en una alerta y enseña la confirmación. |
| `c08_ataque` | 28 s | **Terminal (o la terminal a pantalla completa).** `ssh root@localhost -p 2222` con `interactivo()`: 4 o 5 contraseñas típicas fallidas (`123456`, `admin`, `password`, `root`…). Opcional pero muy recomendable: termina pasando a la consola (SIEM o Honeypots) y enseña cómo aparecen esos intentos. Si no da tiempo en un solo clip, graba también `c08b_ataque_siem`. |
| `c09_honeypots` | 27 s | Honeypots: indicadores, actividad por hora, lista de sesiones. Abre la sesión del ataque anterior (reconstrucción paso a paso) y enseña las credenciales más probadas. |
| `c10_workspace` | 40 s | Workspace: kanban. Abre un incidente, **asígnalo** a un analista, añade un **comentario**, muévelo de **Triaje → Investigación**, pulsa **«Escalar a contención»** y por último **resuélvelo con clasificación** (verdadero positivo). Enseña el historial del incidente. |
| `c11_runbooks` | 24 s | Runbooks: filtro por categoría (Intrusión). Abre **Brute Force SSH/Telnet** y desplázate por sus 5 fases NIST con los comandos. |
| `c12_bloqueo` | 31 s | Desde una alerta del atacante del laboratorio, botón **BLOCK** con `mantener()`. Enseña el resultado tal cual: confirmado por Wazuh o error, sin repetir hasta que salga bien. Si se bloquea la IP del atacante del laboratorio, desbloquéala al terminar para no romper los clips siguientes, y anótalo. |
| `c13_inteligencia` | 42 s | Inteligencia → **Vulnerabilidades** (KEV): filtros «Con exploit», abre una CVE, columna de prioridad. → **IOCs**: analiza una IP del laboratorio (si no hay clave de VirusTotal, que se vea el aviso). → **Mapa**: que se vea el mensaje de IPs privadas no geolocalizables. |
| `c14_activos` | 29 s | Activos: los dos equipos, abre `valhalla-linux-01` y sus vulnerabilidades/inventario. Pestaña **Hardening Windows (LSA)**. |
| `c15_bifrost` | 41 s | Bifröst: las 4 métricas. En threat hunting ejecuta **«Credenciales que funcionaron»** y **«IPs atacantes más activas»** (▶) y pulsa exportar. Botón **ATT&CK Navigator**. |
| `c16_informes` | 34 s | Informes → Informe SOC: periodo de 7 días, **TLP AMBER**, resumen con IA **desactivado**, «Generar informe». Enseña el identificador y la **huella SHA-256**, y pulsa el **escudo de verificación**. Abre un informe del historial. Pestaña **Ejecutivo**. |
| `c17_grc` | 26 s | Informe GRC: periodo de 30 días, matriz de riesgo 5×5, radar NIST CSF 2.0 y desplazamiento hasta el plan de tratamiento y la correspondencia ENS · ISO 27001 · NIS2 · ISO 42001. |
| `c18_usuarios` | 48 s | Usuarios: filtros por rol. **«Nuevo usuario»**: `laura.analista` con correo ficticio y rol **Analista**, «Crear e invitar»; en el panel de invitación, que **no** se lea el enlace completo. Crea también `marcos.lector` con rol **Lector**. Enseña las sesiones por dispositivo y red del admin. Intenta borrar al propio admin para que se vea la salvaguarda. |
| `c19_perfil` | 29 s | Perfil (menú del avatar): cambia la foto (cualquier imagen genérica de menos de 2 MB, sin caras reales; por ejemplo, el logo), cambia el correo por uno ficticio, «Guardar cambios», estadísticas y actividad, sesiones activas, sección de seguridad (sin cambiar la contraseña real). |
| `c20_chat` | 34 s | Chat: mensaje en el canal global, mensaje directo a otro usuario, `<script>alert(1)</script>` para que se vea neutralizado y `@ia resumen del día`. **Espera la respuesta real de la IA**: si tarda, recorta la espera y anótala en `CORTES.md`. Si da tiempo, entra con un segundo usuario en otra ventana para que se vea el mensaje llegar en directo. |
| `c21_sistema` | 21 s | Sistema → Estado (salud y latencias) → **Monitores** (abre uno y enseña el umbral editable) → **Auditoría** (las acciones de los clips anteriores registradas). |
| `c22_movil` | 32 s | La consola en **viewport móvil de 390×844** (contexto aparte con `viewport` y `is_mobile=True`, centrado en el vídeo o grabado aparte): Vista general, barra inferior, SIEM, Casos e Informes. |
| `c23_errores` | 45 s | **Terminal con `curl` contra la API** (sin secretos en pantalla): (1) POST sin token CSRF → rechazado; (2) sesión de un usuario **lector** intentando crear un runbook → 403; (3) usuario con HTML → rechazado; (4) cabecera `X-Forwarded-For: 1.2.3.4` falsa → la IP registrada sigue siendo la real. Usa las rutas reales de `backend/app/main.py` y las mismas comprobaciones que `backend/tests/`. Las cookies o tokens van en variables, sin imprimirlos. |
| `c24_pruebas` | 38 s | **Terminal.** `bash scripts/run_tests.sh`, que termina en **62 passed** y regenera `docs/TRAZABILIDAD.md`. Después `cd frontend && npm test`, que termina en **56 passed**. Si algún número no coincide, se graba tal cual y se anota. |

### Capturas limpias (además de los clips)

Captura con `g.captura(nombre)` cada sección a 1920×1080, sin cursor, en
`video/public/capturas_v2/`: `overview`, `siem`, `siem_detalle`, `honeypots`, `honeypot_sesion`,
`workspace`, `incidente`, `runbooks`, `runbook_detalle`, `intel_vulns`, `intel_iocs`,
`intel_mapa`, `assets`, `bifrost`, `report_soc`, `report_grc`, `users`, `profile`, `chat`,
`system`, `monitores`, `auditoria`, `ajustes_apariencia`, `overview_claro`, `wazuh`.

## Entrega

1. Archivos:
   - `video/public/clips/<clip>.mp4` y `<clip>.json`;
   - `video/public/capturas_v2/*.png`;
   - `video/grabacion/clips/*.py`, los scripts usados, para poder repetir;
   - `video/grabacion/REPORTE.md`, con qué se grabó, qué falló y qué se dejó fuera, con motivo;
   - `video/grabacion/CORTES.md`.
2. Comprueba cada clip antes de entregarlo: `ffprobe` debe dar 1920×1080 y 30 fps, la duración
   mínima tiene que cumplirse y hay que sacar 3 fotogramas y mirarlos. Ni secretos, ni barras
   del navegador, ni ventanas en negro.
3. Sube los vídeos a la rama **huérfana `video-clips`**, para no inflar el historial de `main`
   ni el de la rama del vídeo. Cada archivo debe pesar menos de 95 MB; si alguno pasa, vuelve a
   codificarlo con CRF 22. Hazlo en **otro worktree**, nunca con `git switch` en el clon del stack:
   ```bash
   cd <clon-donde-corre-el-stack>
   git worktree add --orphan -b video-clips ../valhalla-clips     # Git ≥ 2.42
   # (con Git más antiguo: git init ../valhalla-clips && cd ../valhalla-clips &&
   #  git checkout --orphan video-clips && git remote add origin <url-del-repo>)
   mkdir -p ../valhalla-clips/video/public ../valhalla-clips/video/grabacion
   cp -r ../valhalla-video/video/public/clips ../valhalla-video/video/public/capturas_v2 ../valhalla-clips/video/public/
   cp -r ../valhalla-video/video/grabacion/clips ../valhalla-video/video/grabacion/*.md ../valhalla-clips/video/grabacion/
   cd ../valhalla-clips
   git add -f video
   git commit -m "video: clips y capturas del producto real para el montaje"
   git push -u origin video-clips
   ```
   Esa rama se borra cuando el vídeo esté montado.
