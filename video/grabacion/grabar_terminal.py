"""Graba sesiones de terminal reales de la VM y las convierte en clips del vídeo.

1. En la VM se ejecutan los comandos de verdad dentro de `script --log-timing` (con teclear.sh,
   que escribe cada comando con un prompt y luego lo ejecuta).
2. Se traen la salida y los tiempos, y se reproducen tal cual en xterm.js (como asciinema).
3. El grabador filma la reproducción y deja public/clips/<nombre>.mp4.

Las pausas largas (p. ej. esperando a pytest) se acortan a MAX_PAUSA para no aburrir; la salida
no se toca.

Uso: python grabacion/grabar_terminal.py [nombre ...]
"""
from __future__ import annotations

import asyncio
import base64
import json
import shlex
import subprocess
import sys
from pathlib import Path

from grabador import TMP, Toma, abrir, async_playwright

AQUI = Path(__file__).resolve().parent
MAX_PAUSA = 1.8
REMOTO = "~/valhalla-soc"

SESIONES = {
    "term_instalacion": ("/tmp", "yoandy@valhalla-soc — instalación desde el repositorio público", [
        "rm -rf /tmp/valhalla-demo",
        "git clone --depth 1 https://github.com/heindall92/Proyecto-Master-Ciberseguridad-Evolve-Yoandy.git valhalla-demo",
        "cd valhalla-demo && ls",
        "grep -o 'step \"[0-9]/7\" \"[^\"]*\"' install.sh",
    ]),
    "term_stack": (REMOTO, "yoandy@valhalla-soc — el stack en marcha", [
        "docker compose --profile labs up -d",
        "docker compose ps --format 'table {{.Service}}\\t{{.Status}}'",
        "curl -s localhost:8000/health && echo",
    ]),
    "term_ataque": (REMOTO, "atacante (red aislada lab-net) — ataque al honeypot", [
        "docker exec valhalla-attacker nmap -sV -p 2222,2223 cowrie | grep -E 'PORT|open'",
        "docker exec valhalla-attacker hydra -l root -P /tmp/valhalla-wordlist.txt -t 1 -W 1 -f -s 2222 cowrie ssh",
    ]),
    "term_pruebas": (REMOTO, "yoandy@valhalla-soc — pruebas automáticas", [
        "bash scripts/run_tests.sh",
        "grep -m1 'Resultado' docs/TRAZABILIDAD.md",
    ]),
}


def ssh(cmd: str) -> str:
    return subprocess.run(["ssh", "valhalla", cmd], capture_output=True, check=True).stdout.decode("utf-8", "replace")


def capturar(nombre: str, carpeta: str, comandos: list[str]) -> dict:
    subprocess.run(["scp", "-q", str(AQUI / "terminal" / "teclear.sh"), "valhalla:/tmp/teclear.sh"], check=True)
    args = " ".join(shlex.quote(c) for c in comandos)
    ssh(f"sed -i 's/\\r$//' /tmp/teclear.sh; cd {carpeta} && script -q --log-timing=/tmp/{nombre}.tm --log-out=/tmp/{nombre}.out "
        f"-c {shlex.quote(f'bash /tmp/teclear.sh {carpeta} {args}')} >/dev/null 2>&1; true")
    destino = TMP / "term"
    destino.mkdir(parents=True, exist_ok=True)
    for ext in ("tm", "out"):
        subprocess.run(["scp", "-q", f"valhalla:/tmp/{nombre}.{ext}", str(destino / f"{nombre}.{ext}")], check=True)
    salida = (destino / f"{nombre}.out").read_bytes()
    # `script` añade una línea «Script started…» que no está en el fichero de tiempos
    if salida.startswith(b"Script started"):
        salida = salida[salida.index(b"\n") + 1:]
    pasos, pos = [], 0
    for linea in (destino / f"{nombre}.tm").read_text().splitlines():
        partes = linea.split()
        if partes and partes[0] in ("O", "I", "S", "H"):
            if partes[0] != "O":
                continue
            partes = partes[1:]
        espera, n = float(partes[0]), int(partes[1])
        trozo = salida[pos:pos + n]
        pos += n
        pasos.append([round(min(espera, MAX_PAUSA), 3), base64.b64encode(trozo).decode()])
    return {"pasos": pasos}


async def filmar(nombre: str, titulo: str, datos: dict) -> None:
    datos["titulo"] = titulo
    html = (AQUI / "terminal" / "reproductor.html").read_text(encoding="utf-8")
    html = html.replace("<script>\n  // DATOS", f"<script>const DATOS = {json.dumps(datos)};</script>\n<script>\n  // DATOS", 1)
    pagina = TMP / "term" / f"{nombre}.html"
    pagina.write_text(html, encoding="utf-8")
    async with async_playwright() as p:
        nav, page = await abrir(p)
        await page.goto(pagina.as_uri(), wait_until="networkidle")
        await page.evaluate("document.getElementById('__cur') && (document.getElementById('__cur').style.opacity = 0)")
        await page.add_style_tag(content="#__cur{display:none!important}")
        t = Toma(page, nombre)
        await t.empezar()
        await page.wait_for_function("window.__fin === true", timeout=600000)
        await t.terminar(cola=1.5)
        await nav.close()


async def main(nombres: list[str]) -> None:
    for n in nombres or list(SESIONES):
        carpeta, titulo, comandos = SESIONES[n]
        print(f"{n}: ejecutando en la VM…", flush=True)
        datos = capturar(n, carpeta, comandos)
        await filmar(n, titulo, datos)


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1:]))
