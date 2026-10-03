"""Locución del guion con la voz clonada del autor (XTTS-v2, en local, sin enviar audio a terceros).

Entrada: build/voz/muestra/mi_voz.wav (grabación del propio autor leyendo un texto de ~2 min).
Salida:  build/voz/clonada/<clave>.wav por frase + build/voz/indice_clonada.json (lo usa montar.py --voz clonada).

Cada frase se reutiliza mientras no cambie su texto: editar el guion solo resintetiza lo editado.

Uso (con el entorno .venv-xtts):  python pipeline/clonar_voz.py [--temperatura 0.65]
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time

import numpy as np
import soundfile as sf

from comun import BUILD, cargar_guion, clave, texto_para_voz

MUESTRA = BUILD / "voz" / "muestra" / "mi_voz.wav"
REF = BUILD / "voz" / "muestra" / "ref"
DEST = BUILD / "voz" / "clonada"


def preparar_referencias() -> list[str]:
    """Normaliza la muestra y la parte en trozos de 6–12 s cortando en silencios."""
    REF.mkdir(parents=True, exist_ok=True)
    norm = REF.parent / "mi_voz_norm.wav"
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(MUESTRA), "-af",
                    "highpass=f=70,loudnorm=I=-20:TP=-2:LRA=7", "-ac", "1", "-ar", "24000", str(norm)], check=True)
    x, sr = sf.read(norm, dtype="float32")
    ventana = int(0.05 * sr)
    energia = np.sqrt(np.convolve(x ** 2, np.ones(ventana) / ventana, mode="same"))
    silencio = energia < 10 ** (-42 / 20)
    trozos, ini, i = [], None, 0
    while i < len(x):
        if ini is None and not silencio[i]:
            ini = max(0, i - int(0.1 * sr))
        if ini is not None and (i - ini) > 6 * sr and silencio[i:i + int(0.25 * sr)].all():
            trozos.append((ini, i))
            ini = None
        elif ini is not None and (i - ini) > 12 * sr:
            trozos.append((ini, i))
            ini = None
        i += int(0.01 * sr)
    for f in REF.glob("*.wav"):
        f.unlink()
    rutas = []
    for n, (a, b) in enumerate(trozos):
        r = REF / f"ref_{n:02d}.wav"
        sf.write(r, x[a:b], sr)
        rutas.append(str(r))
    print(f"{len(rutas)} trozos de referencia ({sum(b - a for a, b in trozos) / sr:.0f} s)")
    return rutas


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--temperatura", type=float, default=0.65)
    p.add_argument("--solo", nargs="*", help="ids de escena (para probar)")
    a = p.parse_args()

    os.environ.setdefault("COQUI_TOS_AGREED", "1")  # licencia CPML de Coqui: uso no comercial (trabajo académico)
    import torch
    from TTS.api import TTS

    refs = preparar_referencias()
    tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to("cpu")
    modelo = tts.synthesizer.tts_model
    lat, emb = modelo.get_conditioning_latents(audio_path=refs, gpt_cond_len=30, max_ref_length=60)

    DEST.mkdir(parents=True, exist_ok=True)
    guion = cargar_guion()
    indice_f = BUILD / "voz" / "indice_clonada.json"
    indice = json.loads(indice_f.read_text(encoding="utf-8")) if indice_f.exists() else {}
    escenas = [e for e in guion["escenas"] if not a.solo or e["id"] in a.solo]
    total = sum(len(e["frases"]) for e in escenas)
    hechas = nuevas = 0
    t0 = time.time()
    for e in escenas:
        for i, frase in enumerate(e["frases"]):
            dicho = texto_para_voz(frase)
            c = clave(dicho, "xtts", str(a.temperatura))
            wav = DEST / f"{c}.wav"
            if not wav.exists():
                with torch.inference_mode():
                    out = modelo.inference(dicho, "es", lat, emb, temperature=a.temperatura,
                                           length_penalty=1.0, repetition_penalty=5.0, top_p=0.85, speed=1.0,
                                           enable_text_splitting=True)
                sf.write(wav, np.asarray(out["wav"], dtype="float32"), 24000)
                nuevas += 1
            indice[f"{e['id']}#{i}"] = str(wav.relative_to(BUILD))
            hechas += 1
            print(f"[{hechas}/{total}] {e['id']} ({time.time() - t0:.0f} s)", flush=True)
    indice_f.write_text(json.dumps(indice, indent=1), encoding="utf-8")
    print(f"{nuevas} frases nuevas en {time.time() - t0:.0f} s")


if __name__ == "__main__":
    sys.exit(main())
