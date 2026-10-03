"""Comprueba la voz grabada por el autor y localiza dónde empieza cada frase.

Transcribe en local (faster-whisper) cada voz_propia/<escena>.wav, la compara con el texto del
guion (% de palabras que coinciden) y alinea las palabras para saber en qué segundo empieza y
acaba cada frase. montar.py --voz propia usa esos cortes: subtítulos y animaciones siguen la voz.

Salida: build/voz/alineacion_propia.json y un informe por pantalla.
Uso (entorno .venv-xtts):  python pipeline/transcribir.py [--modelo small]
"""
from __future__ import annotations

import argparse
import difflib
import json
import re
import subprocess
import unicodedata

import numpy as np

from comun import BUILD, RAIZ, cargar_guion, texto_para_voz


def normal(p: str) -> str:
    p = unicodedata.normalize("NFKD", p.lower())
    return re.sub(r"[^a-z0-9ñ]", "", "".join(c for c in p if not unicodedata.combining(c)))


def palabras(texto: str) -> list[str]:
    return [w for w in (normal(x) for x in texto.split()) if w]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--modelo", default="small")
    ap.add_argument("--solo", nargs="*", help="ids de escena (el resto se conserva)")
    a = ap.parse_args()
    from faster_whisper import WhisperModel

    modelo = WhisperModel(a.modelo, device="cpu", compute_type="int8")
    guion = cargar_guion()
    destino = BUILD / "voz" / "alineacion_propia.json"
    salida = json.loads(destino.read_text(encoding="utf-8")) if a.solo and destino.exists() else {}
    print(f"{'escena':20} {'coincide':>8}  observación")
    for e in guion["escenas"]:
        if a.solo and e["id"] not in a.solo:
            continue
        wav = RAIZ / "voz_propia" / f"{e['id']}.wav"
        if not wav.exists():
            print(f"{e['id']:20} {'—':>8}  FALTA EL AUDIO")
            continue
        prompt = " ".join(texto_para_voz(f) for f in e["frases"])[:800]
        # se decodifica con ffmpeg (16 kHz mono) para no depender de la versión de PyAV
        pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", str(wav), "-f", "f32le", "-ac", "1", "-ar", "16000", "-"],
                             capture_output=True, check=True).stdout
        audio = np.frombuffer(pcm, dtype=np.float32)
        segs, _ = modelo.transcribe(audio, language="es", word_timestamps=True,
                                    vad_filter=True, beam_size=5)
        oidas = [(normal(w.word), w.start, w.end) for s in segs for w in (s.words or []) if normal(w.word)]
        guion_pal, frase_de = [], []
        for i, f in enumerate(e["frases"]):
            for w in palabras(texto_para_voz(f)):
                guion_pal.append(w)
                frase_de.append(i)
        sm = difflib.SequenceMatcher(a=guion_pal, b=[o[0] for o in oidas], autojunk=False)
        mapa = {}
        for bl in sm.get_matching_blocks():
            for k in range(bl.size):
                mapa[bl.a + k] = bl.b + k
        coincide = len(mapa) / max(1, len(guion_pal))
        cortes = []
        for i in range(len(e["frases"])):
            idx = [mapa[j] for j, fr in enumerate(frase_de) if fr == i and j in mapa]
            cortes.append([oidas[min(idx)][1], oidas[max(idx)][2]] if idx else None)
        # frases sin alinear: se reparten en el hueco entre sus vecinas
        for i, c in enumerate(cortes):
            if c is None:
                ini = cortes[i - 1][1] if i and cortes[i - 1] else (oidas[0][1] if oidas else 0)
                sig = next((x for x in cortes[i + 1:] if x), None)
                fin = sig[0] if sig else (oidas[-1][2] if oidas else ini + 1)
                cortes[i] = [ini, fin]
        # instante en que se dice cada palabra del guion (las no reconocidas se interpolan entre vecinas)
        tiempos_frase = []
        for i in range(len(e["frases"])):
            idx = [j for j, fr in enumerate(frase_de) if fr == i]
            ts = [oidas[mapa[j]][1] if j in mapa else None for j in idx]
            ini, fin = cortes[i]
            conocidos = [(k, t) for k, t in enumerate(ts) if t is not None]
            for k in range(len(ts)):
                if ts[k] is None:
                    antes = max(((kk, t) for kk, t in conocidos if kk < k), default=(-1, ini))
                    despues = min(((kk, t) for kk, t in conocidos if kk > k), default=(len(ts), fin))
                    f = (k - antes[0]) / max(1, despues[0] - antes[0])
                    ts[k] = antes[1] + f * (despues[1] - antes[1])
            tiempos_frase.append([round(t, 3) for t in ts])
        faltan = [guion_pal[j] for j in range(len(guion_pal)) if j not in mapa]
        nota = "" if coincide > 0.85 else f"revisar: no se oyen bien → {' '.join(faltan[:12])}"
        print(f"{e['id']:20} {coincide:7.0%}  {nota}")
        salida[e["id"]] = {"coincide": round(coincide, 3), "frases": cortes, "palabras": tiempos_frase,
                           "transcripcion": " ".join(o[0] for o in oidas)}
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(json.dumps(salida, ensure_ascii=False, indent=1), encoding="utf-8")
    print("alineación en", destino)


if __name__ == "__main__":
    main()
