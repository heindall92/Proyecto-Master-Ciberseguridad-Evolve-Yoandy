"""Fotogramas de revisión: uno a mitad de cada escena indicada (o de todas) en build/fotos/."""
import json
import subprocess
import sys

from comun import BUILD, GENERADO, RAIZ

m = json.loads((GENERADO / "manifest.json").read_text(encoding="utf-8"))
ids = sys.argv[1:]
dest = BUILD / "fotos"
dest.mkdir(parents=True, exist_ok=True)
for e in m["escenas"]:
    if ids and not any(e["id"].startswith(i) for i in ids):
        continue
    f = e["inicio"] + int(e["duracion"] * 0.6)
    subprocess.run(["npx.cmd", "remotion", "still", "src/index.ts", "ValhallaSOC", str(dest / f"{e['id']}.png"),
                    f"--frame={f}", "--scale=0.5", "--log=error"], cwd=RAIZ, check=True)
    print(e["id"], f)
