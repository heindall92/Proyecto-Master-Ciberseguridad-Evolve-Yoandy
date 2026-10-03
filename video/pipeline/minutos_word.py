"""Tabla «requisito → minuto del vídeo» en Word, para copiarla a la matriz de trazabilidad de la memoria.

Lee src/generated/manifest.json (el montaje del vídeo final) y escribe out/Minutos_video_matriz.docx.
Uso (con python-docx):  python pipeline/minutos_word.py
"""
import json
from pathlib import Path

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.shared import Pt, RGBColor

RAIZ = Path(__file__).resolve().parent.parent
m = json.loads((RAIZ / "src" / "generated" / "manifest.json").read_text(encoding="utf-8"))
fps = m["fps"]
REQ = {r: n for r, n in [
    ("RF-01", "Autenticación de usuarios"), ("RF-02", "Control de acceso por roles"), ("RF-03", "Gestión de usuarios"),
    ("RF-04", "Invitaciones de un solo uso"), ("RF-05", "Ingesta de alertas de Wazuh"), ("RF-06", "Gestión de incidentes"),
    ("RF-07", "Runbooks de respuesta"), ("RF-08", "Chat de equipo"), ("RF-09", "Presencia y sesiones"),
    ("RF-10", "Informes con integridad"), ("RF-11", "Threat hunting"), ("RF-12", "Inteligencia de vulnerabilidades"),
    ("RF-13", "Bloqueo de IPs"), ("RF-14", "Métricas del SOC"), ("RF-15", "Asistente de IA local"),
    ("RF-16", "Acceso remoto por VPN"), ("RNF-01", "Protección CSRF y de sesión"), ("RNF-02", "IP real no falsificable"),
    ("RNF-03", "Validación y saneamiento de entradas"), ("RNF-04", "Auditoría"), ("RNF-05", "Datos reales"),
    ("RNF-06", "Privacidad"), ("RNF-07", "Instalación reproducible"), ("RNF-08", "Usabilidad y diseño adaptable"),
    ("RNF-09", "Rendimiento de la API"),
]}


def mmss(f: int) -> str:
    s = round(f / fps)
    return f"{s // 60:02d}:{s % 60:02d}"


minutos: dict[str, list[str]] = {r: [] for r in REQ}
for e in m["escenas"]:
    for r in e.get("req", []):
        minutos[r].append(f"{mmss(e['inicio'])} ({e['titulo']})")
# Requisitos que se ven en el vídeo aunque su escena no los etiquete
minutos["RNF-09"].append("sin escena propia: medición con curl documentada en la memoria")

doc = Document()
doc.styles["Normal"].font.name = "Calibri"
doc.styles["Normal"].font.size = Pt(10)
doc.add_heading("Evidencia en el vídeo · minuto de cada requisito", level=2)
doc.add_paragraph(f"Vídeo final ({mmss(m['duracion'])}). Copiar la columna «Minuto en el vídeo» a la columna de evidencia de la matriz de trazabilidad.")
t = doc.add_table(rows=1, cols=3)
t.style = "Light Grid Accent 1"
t.alignment = WD_TABLE_ALIGNMENT.CENTER
for c, txt in zip(t.rows[0].cells, ("Requisito", "Descripción", "Minuto en el vídeo")):
    c.text = txt
    c.paragraphs[0].runs[0].bold = True
for r, nombre in REQ.items():
    fila = t.add_row().cells
    fila[0].text, fila[1].text, fila[2].text = r, nombre, " · ".join(minutos[r]) or "—"
    fila[0].paragraphs[0].runs[0].font.color.rgb = RGBColor(0x1F, 0x8A, 0x5B)
salida = RAIZ / "out" / "Minutos_video_matriz.docx"
doc.save(salida)
print(salida)
for r in REQ:
    print(f"{r:7} {' · '.join(minutos[r])}")
