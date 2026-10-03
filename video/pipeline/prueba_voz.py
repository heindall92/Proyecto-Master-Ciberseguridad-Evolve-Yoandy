"""Muestra corta de cada voz de Kokoro en español, para elegir antes de sintetizar todo el guion."""
import sys

import soundfile as sf

from comun import BUILD, texto_para_voz
from voz_kokoro import MODELOS, asegurar_modelos

FRASE = ("Hola. Soy Yoandy Ramírez y os presento Valhalla SOC. Wazuh detecta los ataques al honeypot, "
         "los mapea a MITRE ATT&CK y el analista abre un incidente desde la alerta.")

asegurar_modelos()
from kokoro_onnx import Kokoro  # noqa: E402

k = Kokoro(str(MODELOS / "kokoro-v1.0.onnx"), str(MODELOS / "voices-v1.0.bin"))
destino = BUILD / "muestras"
destino.mkdir(parents=True, exist_ok=True)
for voz in sys.argv[1:] or ["em_alex", "em_santa", "ef_dora"]:
    m, sr = k.create(texto_para_voz(FRASE), voice=voz, speed=1.0, lang="es")
    sf.write(destino / f"{voz}.wav", m, sr)
    print(voz, f"{len(m) / sr:.1f} s")
