# Vídeo de la Práctica 3 — Valhalla SOC

Vídeo de presentación (≥ 15 min) generado con [Remotion](https://www.remotion.dev) a partir de
**grabaciones reales** de la consola y de la terminal de la VM, más diapositivas animadas y voz en off.

Nada de la demo está recreado. Así se obtienen las tomas:

- **Consola:** Edge sin ventana graba el despliegue real (`grabacion/rodaje.py`) con el screencast de DevTools.
- **Terminal:** los comandos se ejecutan en la VM dentro de `script --log-timing` y se reproducen tal cual con xterm.js (`grabacion/grabar_terminal.py`).
- **Privacidad:** los correos personales y las fotos de otras personas salen desenfocados, y el enlace de Tailscale de la invitación se tapa.

## Requisitos

- Node.js 20 o superior, ffmpeg y Python 3.11 o superior.
- `npm install` y, en `.venv`: `kokoro-onnx soundfile numpy scipy playwright`.
- La VM levantada (`Arrancar Valhalla.bat`) y `ssh valhalla` configurado.
- `build/token.txt` con un token de sesión de administrador. Se genera con:
  ```bash
  ssh valhalla 'cd ~/valhalla-soc && docker compose exec -T backend python -c "from app.auth import create_access_token_with_meta; print(create_access_token_with_meta(\"admin\")[0])"' > build/token.txt
  ```

## Flujo

| Paso | Comando | Resultado |
|---|---|---|
| 1. Guion | editar `guion/escenas.json` | escenas, frases y requisito de cada una |
| 2. Tomas de consola | `python grabacion/rodaje.py [toma ...]` | `public/clips/<toma>.mp4` + marcas `.json` |
| 3. Tomas de terminal | `python grabacion/grabar_terminal.py [sesión ...]` | `public/clips/term_*.mp4` |
| 4. Índice de tomas | `python pipeline/indice_clips.py` | `src/generated/clips.json` |
| 5. Voz | `python pipeline/voz_kokoro.py` (sintética) · o `voz_propia/<id_escena>.wav` | locución por frase |
| 6. Montaje | `python pipeline/montar.py --voz kokoro\|propia` | audio, `manifest.json`, `out/subtitulos.srt`, `out/CAPITULOS.md` |
| 7. Vista previa | `studio.cmd` → http://localhost:3100 | editor con el vídeo y cada toma |
| 8. Render | `npm run render` | `out/valhalla_soc_practica3.mp4` |

Cada escena dura lo que dura su voz. Las tomas se ajustan solas a esa duración: se recortan las
esperas marcadas (por ejemplo, la IA pensando), la velocidad se adapta entre 0,8× y 1,5×, y al
final se congela el último fotograma. Por eso cambiar la voz, sintética o la tuya, no obliga a
volver a grabar.

## Grabar con tu propia voz

1. Graba un archivo por escena, `voz_propia/<id_escena>.wav` (por ejemplo `voz_propia/s12_vista_general.wav`), leyendo las frases de esa escena en `guion/escenas.json`.
2. Ejecuta `python pipeline/montar.py --voz propia` y luego `npm run render`.

## Herramientas auxiliares

- `pipeline/hoja.py <toma>`: hoja de contactos de una toma.
- `pipeline/fotos.py [escena ...]`: fotogramas de revisión del montaje.
