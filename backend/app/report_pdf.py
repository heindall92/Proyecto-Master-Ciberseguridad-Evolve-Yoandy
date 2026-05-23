"""report_pdf.py — Generación de PDF profesional con Typst (informe HEIMDALL).

Seguridad: TODO dato dinámico (puede venir de atacantes: IPs, comandos, nombres)
se inserta como literal de cadena Typst y se escapa, evitando inyección de markup.
"""
from __future__ import annotations

import os
import tempfile
from typing import Any

GREEN = "#1f9d57"


def _esc(s: Any) -> str:
    """Escapa para un literal de cadena Typst (\" y \\), y elimina control chars."""
    text = str(s if s is not None else "")
    text = "".join(ch for ch in text if ch == "\n" or ch >= " ")
    return text.replace("\\", "\\\\").replace('"', '\\"').replace("\n", " ")


def _cell(s: Any) -> str:
    return f'[#"{_esc(s)}"]'


def render_heimdall_typ(d: dict[str, Any]) -> str:
    im = d.get("incident_management", {}) or {}
    iso = d.get("iso27001", {}) or {}
    wm = d.get("wazuh_metrics", {}) or {}
    controls = iso.get("controls", []) or []
    assets = d.get("top_affected_assets", []) or []
    techs = d.get("techniques_seen", []) or []

    iso_rows = "\n  ".join(
        f'{_cell(c.get("control"))}, {_cell(c.get("status"))}, {_cell(c.get("note"))},'
        for c in controls
    ) or 'table.cell(colspan: 3)[#"Sin controles"],'

    if assets:
        asset_rows = "\n  ".join(
            f'{_cell(a.get("ip"))}, {_cell(a.get("name"))}, {_cell(a.get("alerts"))},'
            for a in assets
        )
    else:
        asset_rows = 'table.cell(colspan: 3)[#"Sin actividad de ataque en la ventana"],'

    techs_str = ", ".join(str(t) for t in techs) if techs else "—"

    # Sin llaves {} ni backslashes en el markup Typst -> seguro dentro de f-string
    return f'''#set document(title: "HEIMDALL - Informe de Inteligencia SOC")
#set page(
  paper: "a4", margin: 2cm, numbering: "1 / 1",
  footer: align(center)[#text(8pt, fill: gray)[Valhalla SOC · HEIMDALL · CLASSIFIED - EYES ONLY]],
)
#set text(size: 10pt)
#set heading(numbering: "1.")

#align(center)[
  #text(26pt, fill: rgb("{GREEN}"), weight: "bold")[HEIMDALL]
  #linebreak()
  #text(11pt, fill: rgb("#444444"))[#"{_esc(d.get("subtitle"))}"]
  #linebreak()
  #text(9pt, fill: gray)[Analista: #"{_esc(d.get("analyst"))}" #h(1em) Generado: #"{_esc(d.get("generated_at"))}"]
]
#v(6pt)
#line(length: 100%, stroke: 1pt + rgb("{GREEN}"))
#v(10pt)

= Resumen ejecutivo
#grid(
  columns: (1fr, 1fr, 1fr, 1fr), gutter: 10pt,
  align(center)[#text(9pt, fill: gray)[Cumplimiento ISO]#linebreak()#text(20pt, fill: rgb("{GREEN}"), weight: "bold")[{int(iso.get("overall", 0))}%]],
  align(center)[#text(9pt, fill: gray)[Resolución media]#linebreak()#text(20pt, weight: "bold")[{int(im.get("avg_resolution_time_min", 0))} min]],
  align(center)[#text(9pt, fill: gray)[Cobertura ATTCK]#linebreak()#text(20pt, fill: rgb("{GREEN}"), weight: "bold")[{int(d.get("attack_coverage_pct", 0))}%]],
  align(center)[#text(9pt, fill: gray)[Incidentes]#linebreak()#text(20pt, weight: "bold")[{int(im.get("total_tickets", 0))}]],
)
#v(12pt)

= Cumplimiento ISO/IEC 27001
#table(
  columns: (auto, auto, 1fr), inset: 7pt, align: left + horizon,
  fill: (_, row) => if row == 0 {{ rgb("{GREEN}").lighten(70%) }} else {{ white }},
  table.header([*Control*], [*Estado*], [*Evidencia*]),
  {iso_rows}
)

= Atacantes / activos (datos reales)
#table(
  columns: (auto, 1fr, auto), inset: 7pt, align: left + horizon,
  fill: (_, row) => if row == 0 {{ rgb("{GREEN}").lighten(70%) }} else {{ white }},
  table.header([*IP / Origen*], [*Tipo de actividad*], [*Eventos*]),
  {asset_rows}
)

= Técnicas MITRE ATT&CK observadas
#text(11pt)[#"{_esc(techs_str)}"]

#v(10pt)
#align(right)[#text(8pt, fill: gray)[Alertas 24h: {int(wm.get("total_alerts_24h", 0))} #h(1em) Críticas: {int(wm.get("critical_alerts", 0))}]]
'''


def compile_pdf(typ_source: str) -> bytes:
    """Compila el documento Typst a PDF (bytes)."""
    import typst

    with tempfile.TemporaryDirectory() as tmp:
        src = os.path.join(tmp, "report.typ")
        with open(src, "w", encoding="utf-8") as f:
            f.write(typ_source)
        result = typst.compile(src)
        return result if isinstance(result, (bytes, bytearray)) else bytes(result)
