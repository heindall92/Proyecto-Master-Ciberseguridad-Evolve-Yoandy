"""Monta la línea de tiempo del vídeo a partir del guion y de la locución.

La duración de cada escena la marca su voz: frase a frase, con pausas fijas entre frases.
Así la imagen nunca se desfasa del audio, con cualquier voz (sintética, clonada o propia).

Genera:
  public/generated/audio.wav     voz normalizada a -16 LUFS + música atenuada bajo la voz
  src/generated/manifest.json    tiempos de cada escena, frase y subtítulo (lo lee Remotion)
  out/subtitulos.srt             subtítulos para YouTube
  out/CAPITULOS.md               minuto de cada escena y de cada requisito (matriz de trazabilidad)
  out/capitulos_youtube.txt      capítulos para pegar en la descripción de YouTube

Uso:
  python pipeline/montar.py --voz kokoro      # locución sintética (voz_kokoro.py)
  python pipeline/montar.py --voz clonada     # tu voz clonada (clonar_voz.py)
  python pipeline/montar.py --voz propia      # tus grabaciones: voz_propia/<id_escena>.wav
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import resample_poly

from comun import BUILD, GENERADO, PUBLIC, RAIZ, SALIDA, cargar_guion, duracion, ffmpeg

FPS = 30
SR = 48000
ENTRADA = 0.7        # silencio al empezar cada escena (entra el titular)
PAUSA = 0.45         # entre frases
SALIDA_ESCENA = 0.9  # respiración antes del cambio de escena
ENTRADA_VIDEO = 2.5  # el logo aparece antes de la primera palabra
FINAL_VIDEO = 5.0    # el cierre se queda en pantalla
MAX_PALABRAS_SUB = 13


def leer_wav(ruta: Path) -> np.ndarray:
    datos, sr = sf.read(ruta, dtype="float32", always_2d=True)
    mono = datos.mean(axis=1)
    if sr != SR:
        from math import gcd

        g = gcd(SR, sr)
        mono = resample_poly(mono, SR // g, sr // g).astype(np.float32)
    return mono


def recortar_silencio(x: np.ndarray, umbral: float = 0.01) -> np.ndarray:
    activo = np.where(np.abs(x) > umbral)[0]
    if len(activo) == 0:
        return x
    ini = max(0, activo[0] - int(0.03 * SR))
    fin = min(len(x), activo[-1] + int(0.08 * SR))
    return x[ini:fin]


def trocear_subtitulo(texto: str) -> list[str]:
    """Divide una frase larga en trozos legibles, cortando preferentemente en signos de puntuación."""
    palabras = texto.split()
    if len(palabras) <= MAX_PALABRAS_SUB:
        return [texto]
    trozos, actual = [], []
    for i, p in enumerate(palabras):
        actual.append(p)
        restantes = len(palabras) - i - 1
        corte_natural = re.search(r"[,:;.?!…]$", p) and len(actual) >= 6
        if (corte_natural and restantes >= 4) or len(actual) >= MAX_PALABRAS_SUB:
            trozos.append(" ".join(actual))
            actual = []
    if actual:
        if len(actual) < 4 and trozos:
            trozos[-1] += " " + " ".join(actual)
        else:
            trozos.append(" ".join(actual))
    return trozos


def tiempo_srt(s: float) -> str:
    ms = int(round(s * 1000))
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    sec, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{sec:02d},{ms:03d}"


def mmss(s: float) -> str:
    m, sec = divmod(int(s), 60)
    return f"{m:02d}:{sec:02d}"


def cargar_voces(guion: dict, modo: str) -> dict[str, list[np.ndarray]]:
    """Devuelve, por escena, la lista de audios de cada frase."""
    voces: dict[str, list[np.ndarray]] = {}
    if modo in ("kokoro", "clonada"):
        indice_f = BUILD / "voz" / f"indice_{modo}.json"
        if not indice_f.exists():
            sys.exit(f"Falta {indice_f}: ejecuta antes voz_kokoro.py" + (" y clonar_voz.py" if modo == "clonada" else ""))
        indice = json.loads(indice_f.read_text(encoding="utf-8"))
        for e in guion["escenas"]:
            voces[e["id"]] = []
            for i in range(len(e["frases"])):
                ruta = BUILD / indice[f"{e['id']}#{i}"]
                voces[e["id"]].append(recortar_silencio(leer_wav(ruta)))
        return voces

    # Voz propia: una grabación por escena; se reparte entre frases según su longitud.
    carpeta = RAIZ / "voz_propia"
    for e in guion["escenas"]:
        ruta = next((p for p in sorted(carpeta.glob(f"{e['id']}.*")) if p.suffix.lower() in (".wav", ".mp3", ".m4a", ".flac", ".ogg")), None)
        if ruta is None:
            sys.exit(f"Falta la grabación {carpeta / e['id']}.wav (ver GUION_LOCUCION.md)")
        if ruta.suffix.lower() != ".wav":
            tmp = BUILD / "voz" / "propia" / f"{e['id']}.wav"
            tmp.parent.mkdir(parents=True, exist_ok=True)
            ffmpeg("-i", str(ruta), "-ac", "1", "-ar", str(SR), str(tmp))
            ruta = tmp
        audio = recortar_silencio(leer_wav(ruta))
        pesos = np.array([len(f) for f in e["frases"]], dtype=float)
        cortes = np.concatenate([[0], np.cumsum(pesos / pesos.sum())]) * len(audio)
        voces[e["id"]] = [audio[int(cortes[i]):int(cortes[i + 1])] for i in range(len(e["frases"]))]
    return voces


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--voz", choices=["kokoro", "clonada", "propia"], default="kokoro")
    p.add_argument("--musica-db", type=float, default=-24.0, help="nivel de la música respecto a la voz")
    a = p.parse_args()

    guion = cargar_guion()
    voces = cargar_voces(guion, a.voz)

    # 1. Línea de tiempo (segundos absolutos).
    t = ENTRADA_VIDEO - ENTRADA
    escenas, pistas = [], []
    for n, e in enumerate(guion["escenas"]):
        inicio = t
        cursor = inicio + ENTRADA
        frases = []
        for i, texto in enumerate(e["frases"]):
            audio = voces[e["id"]][i]
            d = len(audio) / SR
            pistas.append((cursor, audio))
            frases.append({"texto": texto, "inicio": cursor, "fin": cursor + d})
            cursor += d + PAUSA
        fin = cursor - PAUSA + (FINAL_VIDEO if n == len(guion["escenas"]) - 1 else SALIDA_ESCENA)
        escenas.append({"escena": e, "inicio": inicio, "fin": fin, "frases": frases})
        t = fin
    total = t

    # 2. Pista de voz.
    voz = np.zeros(int(total * SR) + SR, dtype=np.float32)
    for ini, audio in pistas:
        i = int(ini * SR)
        voz[i:i + len(audio)] += audio
    voz = voz[: int(total * SR)]
    tmp = BUILD / "audio"
    tmp.mkdir(parents=True, exist_ok=True)
    sf.write(tmp / "voz_cruda.wav", voz, SR)
    # Normalización EBU R128 a -16 LUFS (estándar de plataformas de vídeo), pico real -1,5 dBTP.
    ffmpeg("-i", str(tmp / "voz_cruda.wav"), "-af",
           "highpass=f=70,loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", str(SR), "-ac", "1", str(tmp / "voz.wav"))

    # 3. Música generada y mezcla con atenuación automática (sidechain) bajo la voz.
    subprocess.run([sys.executable, str(RAIZ / "pipeline" / "musica.py"), f"{total:.2f}", str(tmp / "musica.wav")], check=True)
    salida_audio = PUBLIC / "generated" / "audio.wav"
    salida_audio.parent.mkdir(parents=True, exist_ok=True)
    ffmpeg(
        "-i", str(tmp / "voz.wav"), "-i", str(tmp / "musica.wav"),
        "-filter_complex",
        f"[1:a]volume={a.musica_db}dB[m];"
        "[0:a]asplit=2[v][sc];"
        "[m][sc]sidechaincompress=threshold=0.02:ratio=6:attack=80:release=900[md];"
        "[v]pan=stereo|c0=c0|c1=c0[vs];"
        "[vs][md]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.89",
        "-ar", str(SR), str(salida_audio),
    )

    # 4. Clips reales grabados por el equipo (sustituyen a la captura de su escena).
    clips = {}
    for c in sorted((PUBLIC / "clips").glob("*.mp4")) if (PUBLIC / "clips").exists() else []:
        clips[c.stem] = {"src": f"clips/{c.name}", "duracion": round(duracion(c), 3)}

    # 5. Manifiesto para Remotion (tiempos en fotogramas, relativos a la escena).
    def f(s: float) -> int:
        return int(round(s * FPS))

    manifest = {
        "fps": FPS,
        "duracion": f(total),
        "voz": a.voz,
        "audio": "generated/audio.wav",
        "bloques": guion["bloques"],
        "escenas": [],
    }
    srt, n_sub = [], 0
    for item in escenas:
        e = item["escena"]
        ini_e = f(item["inicio"])
        subs = []
        for fr in item["frases"]:
            trozos = trocear_subtitulo(fr["texto"])
            pesos = np.array([len(x) for x in trozos], dtype=float)
            cortes = fr["inicio"] + np.concatenate([[0], np.cumsum(pesos / pesos.sum())]) * (fr["fin"] - fr["inicio"])
            for k, trozo in enumerate(trozos):
                subs.append({"texto": trozo, "inicio": f(cortes[k]) - ini_e, "fin": f(cortes[k + 1]) - ini_e})
                n_sub += 1
                srt.append(f"{n_sub}\n{tiempo_srt(cortes[k])} --> {tiempo_srt(cortes[k + 1])}\n{trozo}\n")
        manifest["escenas"].append({
            "id": e["id"],
            "bloque": e["bloque"],
            "titulo": e["titulo"],
            "req": e.get("req", []),
            "visual": e["visual"],
            "inicio": ini_e,
            "duracion": f(item["fin"]) - ini_e,
            "frases": [{"inicio": f(fr["inicio"]) - ini_e, "fin": f(fr["fin"]) - ini_e} for fr in item["frases"]],
            "subtitulos": subs,
            "clip": clips.get(e.get("clip", e["id"])),
        })
    GENERADO.mkdir(parents=True, exist_ok=True)
    (GENERADO / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")

    # 6. Subtítulos y capítulos.
    SALIDA.mkdir(parents=True, exist_ok=True)
    (SALIDA / "subtitulos.srt").write_text("\n".join(srt), encoding="utf-8")

    bloques = guion["bloques"]
    lineas = [
        "# Capítulos del vídeo y minuto de cada requisito",
        "",
        f"Generado por `pipeline/montar.py` (voz: {a.voz}). Duración total: **{mmss(total)}**.",
        "Usa la segunda tabla para la columna «Evidencia» de la matriz de trazabilidad de la memoria.",
        "",
        "## Escenas",
        "",
        "| Minuto | Bloque | Escena | Requisitos | Imagen |",
        "|---|---|---|---|---|",
    ]
    por_req: dict[str, list[str]] = {}
    for item, m in zip(escenas, manifest["escenas"]):
        e = item["escena"]
        imagen = "grabación real" if m["clip"] else (
            "captura real del producto" if e["visual"]["tipo"] == "pantalla" else "diapositiva")
        lineas.append(f"| {mmss(item['inicio'])} | {bloques[e['bloque']]} | {e['titulo']} | {', '.join(e.get('req', [])) or '—'} | {imagen} |")
        for r in e.get("req", []):
            por_req.setdefault(r, []).append(f"{mmss(item['inicio'])} ({e['titulo']})")
    orden = lambda r: (r.startswith("RNF"), int(r.split("-")[1]))
    lineas += ["", "## Requisitos → minuto del vídeo", "", "| Requisito | Minuto(s) |", "|---|---|"]
    for r in sorted(por_req, key=orden):
        lineas.append(f"| {r} | {' · '.join(por_req[r])} |")
    (SALIDA / "CAPITULOS.md").write_text("\n".join(lineas) + "\n", encoding="utf-8")

    yt, ultimo = [], None
    for item in escenas:
        e = item["escena"]
        if e["bloque"] == "demo" or e["bloque"] != ultimo:
            nombre = bloques[e["bloque"]] if e["bloque"] != "demo" else f"Demo · {e['titulo']}"
            if e["bloque"] != "demo" and e["bloque"] == "presentacion":
                nombre = "Presentación"
            inicio = 0 if not yt else item["inicio"]
            yt.append(f"{mmss(inicio)} {nombre}")
        ultimo = e["bloque"]
    (SALIDA / "capitulos_youtube.txt").write_text("\n".join(yt) + "\n", encoding="utf-8")

    print(f"Duración: {mmss(total)} ({total:.1f} s) · {len(escenas)} escenas · {n_sub} subtítulos · clips reales: {len(clips)}")


if __name__ == "__main__":
    main()
