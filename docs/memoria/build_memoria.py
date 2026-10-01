"""Genera la memoria de la Práctica 3 (HTML -> PDF A4).

Las tablas de requisitos y de trazabilidad se leen de docs/REQUISITOS.md y
docs/TRAZABILIDAD.md, así la memoria no se desincroniza del proyecto.

Uso:  python docs/memoria/build_memoria.py [--grupo "Proyecto Valhalla"]
Requiere Playwright (Chromium o Edge):  pip install playwright
"""
from __future__ import annotations

import argparse
import html
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
DOCS = HERE.parent


def md_rows(path: Path, pattern: str) -> list[list[str]]:
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if re.match(pattern, line):
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            rows.append(cells)
    return rows


def inline_md(s: str) -> str:
    s = html.escape(s)
    s = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", s)
    s = re.sub(r"`(.+?)`", r"<code>\1</code>", s)
    return s.replace("&lt;br&gt;", "<br>")


def req_tables() -> str:
    rows = md_rows(DOCS / "REQUISITOS.md", r"\|\s*R(?:N)?F-\d+")
    out = []
    for kind, title in (("RF", "Requisitos funcionales"), ("RNF", "Requisitos no funcionales")):
        body = "".join(
            f"<tr><td class='id'>{r[0]}</td><td><b>{inline_md(r[1])}</b><br><span class='muted'>{inline_md(r[2])}</span></td>"
            f"<td class='verif'>{inline_md(r[3])}</td></tr>"
            for r in rows if r[0].startswith(kind + "-")
        )
        out.append(f"<h3>{title}</h3><table class='req'><thead><tr><th>ID</th><th>Requisito y criterio de aceptación</th>"
                   f"<th>Verificación</th></tr></thead><tbody>{body}</tbody></table>")
    return "".join(out)


def trace_table() -> tuple[str, str]:
    text = (DOCS / "TRAZABILIDAD.md").read_text(encoding="utf-8")
    summary = re.search(r"\*\*Resultado: (.+?)\*\*", text)
    rows = md_rows(DOCS / "TRAZABILIDAD.md", r"\|\s*\*\*R(?:N)?F-\d+")
    body = []
    for r in rows:
        rid = r[0].strip("*")
        tests = [t for t in r[2].split("<br>") if t.strip() and t.strip() != "—"]
        n = len(tests)
        body.append(f"<tr><td class='id'>{rid}</td><td>{inline_md(r[1])}</td><td class='num'>{n or '—'}</td>"
                    f"<td class='num'>{inline_md(r[3])}</td><td>{inline_md(r[4])}</td></tr>")
    table = ("<table class='trace'><thead><tr><th>Req.</th><th>Descripción</th><th>Pruebas</th><th>Resultado</th>"
             "<th>Verificación manual</th></tr></thead><tbody>" + "".join(body) + "</tbody></table>")
    return table, (summary.group(1) if summary else "")


def render(grupo: str) -> str:
    """HTML final de la memoria (también lo usa build_docx.py)."""
    tpl = (HERE / "memoria.html").read_text(encoding="utf-8")
    trace, trace_summary = trace_table()
    return (tpl.replace("{{GRUPO}}", grupo)
               .replace("{{REQ_TABLES}}", req_tables())
               .replace("{{TRACE_TABLE}}", trace)
               .replace("{{TRACE_SUMMARY}}", html.escape(trace_summary)))


def build(grupo: str) -> Path:
    page = render(grupo)
    out_html = HERE / "_memoria_render.html"
    out_html.write_text(page, encoding="utf-8")

    from playwright.sync_api import sync_playwright
    pdf = HERE / f"P3_Grupo{grupo.replace(' ', '')}_Memoria.pdf"  # P3_GrupoProyectoValhalla_Memoria.pdf
    with sync_playwright() as p:
        try:
            browser = p.chromium.launch()
        except Exception:
            browser = p.chromium.launch(channel="msedge")
        pg = browser.new_page()
        pg.goto(out_html.as_uri(), wait_until="networkidle")
        pg.wait_for_function("window.__mermaidDone === true", timeout=30000)
        pg.pdf(path=str(pdf), format="A4", print_background=True, display_header_footer=True,
               header_template="<span></span>",
               footer_template=("<div style='width:100%;font:8px Arial;color:#6b7c74;padding:0 18mm;"
                                "display:flex;justify-content:space-between'><span>Valhalla SOC · Memoria Práctica 3</span>"
                                "<span><span class='pageNumber'></span> / <span class='totalPages'></span></span></div>"),
               prefer_css_page_size=True)  # márgenes en el CSS: portada a sangre (@page :first)
        browser.close()
    out_html.unlink()
    return pdf


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--grupo", default="Proyecto Valhalla")
    print(build(ap.parse_args().grupo))
