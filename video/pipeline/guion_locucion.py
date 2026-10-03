"""Genera GUION_LOCUCION.md: el texto que el autor lee, escena por escena, para grabar su propia voz."""
import json

from comun import RAIZ, cargar_guion

g = cargar_guion()
QUE_SE_VE = {
    "toma": "grabación real de la consola",
}
lineas = [
    "# Guion de locución — Valhalla SOC (Práctica 3)",
    "",
    "Una grabación por escena. Lee el texto tal cual, con tu ritmo y tu acento: el vídeo se ajusta solo",
    "a lo que dures en cada escena.",
    "",
    "## Cómo grabar",
    "",
    "1. OBS, como en la muestra: solo el micrófono y el audio de escritorio desactivado.",
    "2. **Un archivo por escena.** Antes de empezar a hablar, 1 segundo de silencio; entre frase y frase, una pausa natural; al acabar, 1 segundo de silencio.",
    "3. Si te equivocas, para y repite la escena entera; no hace falta editar nada.",
    "4. Guarda cada archivo en `video/voz_propia/` con el **nombre exacto de la escena** (por ejemplo `s01_portada.mp4`). Valen `.mp4`, `.mkv`, `.wav`, `.m4a` y `.mp3`.",
    "5. Puedes grabar en varios ratos y en cualquier orden. Si repites una escena, sustituye su archivo.",
    "",
    "Cuando estén todas: `python pipeline/montar.py --voz propia` y el render final.",
    "",
    "| Escena | Archivo | Lectura aprox. |",
    "|---|---|---|",
]
total = 0
for e in g["escenas"]:
    palabras = len(" ".join(e["frases"]).split())
    seg = palabras / 2.4
    total += seg
    lineas.append(f"| {e['titulo']} | `{e['id']}` | {int(seg)} s |")
lineas += ["", f"Lectura total aproximada: **{int(total // 60)} min {int(total % 60)} s** (más las pausas).", ""]

n = 0
for e in g["escenas"]:
    n += 1
    vis = e["visual"]
    se_ve = QUE_SE_VE.get(vis.get("tipo"), "diapositiva animada")
    if vis.get("tipo") == "toma":
        se_ve += f" — {vis.get('rotulo') or e['titulo']}"
    lineas += [
        "---",
        "",
        f"## {n}. {e['titulo']}",
        "",
        f"**Archivo:** `voz_propia/{e['id']}.mp4` · **En pantalla:** {se_ve}"
        + (f" · **Requisitos:** {', '.join(e['req'])}" if e.get("req") else ""),
        "",
    ]
    for f in e["frases"]:
        lineas.append(f"> {f}")
        lineas.append(">")
    lineas[-1] = ""
(RAIZ / "GUION_LOCUCION.md").write_text("\n".join(lineas) + "\n", encoding="utf-8")
(RAIZ / "voz_propia").mkdir(exist_ok=True)
print("GUION_LOCUCION.md:", len(g["escenas"]), "escenas")
