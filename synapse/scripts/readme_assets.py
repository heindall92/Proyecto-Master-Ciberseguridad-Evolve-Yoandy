"""Genera los gráficos del README con el estilo de Apple (colores del sistema, fuente del sistema,
superficies planas, sin degradados) y glifos Lucide, los mismos de la app.

    python scripts/readme_assets.py

Identidad de S.Y.N.A.P.S.E.: azul eléctrico y, como motivo, curvas de supervivencia de
Kaplan-Meier (la escalera que baja), el lenguaje visual de la bioestadística clínica.
"""
from __future__ import annotations

import json
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "assets"
ICONS: dict[str, str] = json.loads((ROOT / "src" / "synapse" / "lucide_icons.json").read_text(encoding="utf-8"))["icons"]
FONT = ("-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI Variable Display', 'Segoe UI', "
        "'Helvetica Neue', Helvetica, Arial, sans-serif")

# Colores del sistema de Apple (modo claro)
C = {"blue": "#007AFF", "green": "#34C759", "indigo": "#5856D6", "orange": "#FF9500", "pink": "#FF2D55",
     "purple": "#AF52DE", "red": "#FF3B30", "teal": "#30B0C7", "mint": "#00C7BE", "yellow": "#FFCC00",
     "gray": "#8E8E93", "graphite": "#1D1D1F", "cyan": "#32ADE6"}
ELECTRIC = "#0A5CFF"
ACCENT = ELECTRIC
ACCENT_DARK = "#1A66FF"


def glyph(name: str) -> str:
    if name not in ICONS:
        raise KeyError(f"icono Lucide no incluido: {name} (añádelo a src/synapse/lucide_icons.json)")
    return ICONS[name]


# ─── Iconos de sección (índigo, legibles en el tema claro y oscuro de GitHub) ──
SECTION = ["heart-pulse", "route", "network", "chart-scatter", "layout-grid", "image", "rocket", "terminal",
           "shield-check", "folder-tree", "triangle-alert", "scale", "users", "book-open", "notebook-pen", "flask-conical"]


def section_icons() -> int:
    (OUT / "icons").mkdir(parents=True, exist_ok=True)
    for name in SECTION:
        (OUT / "icons" / f"{name}.svg").write_text(
            f'<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" '
            f'stroke="{ACCENT}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">{glyph(name)}</svg>\n',
            encoding="utf-8")
    return len(SECTION)


# ─── Mosaicos tipo icono de app: superficie plana con radio del 22 % ──────────
def tile(color: str, label: str, *, g: str | None = None, main: str | None = None, sub: str | None = None,
         size: int = 76, ink: str = "#FFFFFF") -> str:
    if g:
        body = (f'<g transform="translate(80 46) scale(4)" fill="none" stroke="{ink}" stroke-width="1.9" '
                f'stroke-linecap="round" stroke-linejoin="round">{glyph(g)}</g>\n'
                f'  <text x="128" y="206" text-anchor="middle" font-family="{FONT}" font-weight="600" '
                f'font-size="{27 if len(label) > 9 else 32}" letter-spacing="-0.4" fill="{ink}">{label}</text>')
    else:
        body = (f'<text x="128" y="{132 if sub else 152}" text-anchor="middle" font-family="{FONT}" font-weight="700" '
                f'font-size="{size}" letter-spacing="-2" fill="{ink}">{main}</text>')
        if sub:
            body += (f'\n  <text x="128" y="190" text-anchor="middle" font-family="{FONT}" font-weight="600" '
                     f'font-size="28" letter-spacing="-0.3" fill="{ink}" fill-opacity="0.86">{sub}</text>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256" role="img" '
            f'aria-label="{label}">\n  <title>{label}</title>\n  <rect width="256" height="256" rx="57" fill="{color}"/>\n'
            f'  {body}\n</svg>\n')


TILES: dict[str, str] = {
    # Bioestadística
    "kaplan-meier": tile(ELECTRIC, "Kaplan-Meier", g="chart-line"),
    "cox": tile(C["blue"], "Cox", main="HR", sub="Cox PH", size=96),
    "ic-solapamiento": tile(C["teal"], "Solapamiento IC", g="blend"),
    "combinacion": tile(C["purple"], "Combinación m", main="m = 5", sub="Raab 2016", size=64),
    "pmse": tile(C["green"], "pMSE", main="pMSE", sub="Snoke 2018", size=62),
    "tstr": tile(C["orange"], "TSTR", g="gauge"),
    # Privacidad
    "pertenencia": tile(C["red"], "Pertenencia", g="fingerprint"),
    "wp29": tile(C["graphite"], "WP29", main="WP29", sub="WP216 · 2014", size=72),
    "anonymeter": tile(C["pink"], "Anonymeter", g="scan-eye"),
    "dp": tile(C["orange"], "Privacidad diferencial", main="ε", sub="DP", size=110),
    # Datos
    "gbsg2": tile(C["pink"], "GBSG2", g="ribbon"),
    "whas500": tile(C["red"], "WHAS500", g="heart-pulse"),
    "flchain": tile(C["teal"], "FLCHAIN", g="microscope"),
    "veterans": tile(ELECTRIC, "VA Lung", g="stethoscope"),
    # Código
    "python": tile(C["blue"], "Python", main="Py", sub="3.11 · 3.12", size=96),
    "pandas": tile(C["indigo"], "pandas", g="table"),
    "lifelines": tile(C["purple"], "lifelines", g="activity"),
    "sksurv": tile(C["green"], "scikit-survival", g="chart-spline"),
    "synthcity": tile(C["teal"], "synthcity", g="wand-sparkles"),
    # Pruebas
    "pytest": tile(ELECTRIC, "pytest", g="terminal"),
    "hypothesis": tile(C["purple"], "hypothesis", g="test-tube"),
    "nbmake": tile(C["orange"], "Cuadernos", g="notebook-pen"),
    "tipos": tile(C["blue"], "mypy · ruff", g="check-check"),
    # Normativa
    "rgpd": tile(C["blue"], "RGPD", main="RGPD", sub="cdo. 26 · art. 9", size=72),
    "ehds": tile(ELECTRIC, "EHDS", main="EHDS", sub="UE 2025/327", size=72),
    "iso27559": tile(C["graphite"], "ISO/IEC 27559", main="27559", sub="ISO/IEC · 2022", size=68),
    # Publicación
    "actions": tile(C["blue"], "Actions", g="workflow"),
    "pages": tile(C["graphite"], "Pages", g="globe"),
    "git": tile(C["red"], "Git", g="git-branch"),
}


# ─── Cabecera y pie: dos curvas de Kaplan-Meier (real y sintética) ───────────
CSS = """<style>
    .km { stroke-dasharray: 3000; stroke-dashoffset: 3000; animation: dibuja 3.4s cubic-bezier(.32,.72,0,1) forwards; }
    .km2 { animation-delay: .45s; }
    .band, .cens { opacity: 0; animation: aparece 1.6s ease 1.6s forwards; }
    .t { animation: sube 1.2s cubic-bezier(.32,.72,0,1) both; }
    @keyframes dibuja { to { stroke-dashoffset: 0; } }
    @keyframes aparece { to { opacity: 1; } }
    @keyframes sube { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
    @media (prefers-reduced-motion: reduce) {
      .km { animation: none; stroke-dashoffset: 0; } .band, .cens { animation: none; opacity: 1; } .t { animation: none; }
    }
  </style>"""


def km_curve(seed: int, n: int, hazard: float, censor: float) -> list[tuple[float, float, bool]]:
    """Simula n pacientes (exponencial con censura) y devuelve la escalera de Kaplan-Meier
    [(t, S(t), censurado)] en t ∈ [0, 1]: una curva de supervivencia de verdad, no un dibujo."""
    rng = random.Random(seed)
    data = sorted((min(rng.expovariate(hazard), rng.expovariate(censor), 1.0),
                   rng.expovariate(hazard) < rng.expovariate(censor)) for _ in range(n))
    at_risk, s, out = n, 1.0, [(0.0, 1.0, False)]
    for t, event in data:
        if t >= 1.0:
            break
        if event:
            s *= 1 - 1 / at_risk
        out.append((t, s, not event))
        at_risk -= 1
    return out


def km_svg(pts: list[tuple[float, float, bool]], x0: float, x1: float, y0: float, y1: float) -> tuple[str, list[tuple[float, float]]]:
    X = lambda t: x0 + (x1 - x0) * t  # noqa: E731
    Y = lambda v: y1 - (y1 - y0) * v  # noqa: E731
    d, cens, prev = f"M{X(0):.1f} {Y(1):.1f}", [], 1.0
    for t, v, c in pts[1:]:
        d += f" H{X(t):.1f}"
        if v != prev:
            d += f" V{Y(v):.1f}"
        prev = v
        if c:
            cens.append((X(t), Y(v)))
    return d + f" H{X(1):.1f}", cens


def band_svg(pts: list[tuple[float, float, bool]], x0: float, x1: float, y0: float, y1: float, n: int) -> str:
    """Banda de confianza aproximada (Greenwood simplificado: ±1,96·√(S(1−S)/n_riesgo))."""
    X = lambda t: x0 + (x1 - x0) * t  # noqa: E731
    Y = lambda v: y1 - (y1 - y0) * max(0.0, min(1.0, v))  # noqa: E731
    up, lo = [], []
    for k, (t, v, _) in enumerate(pts):
        half = 1.96 * (v * (1 - v) / max(n - k, 1)) ** 0.5
        up.append((X(t), Y(v + half)))
        lo.append((X(t), Y(v - half)))
    up.append((X(1), up[-1][1]))
    lo.append((X(1), lo[-1][1]))
    path = "M" + " L".join(f"{a:.1f} {b:.1f}" for a, b in up) + " L" + " L".join(f"{a:.1f} {b:.1f}" for a, b in reversed(lo))
    return path + " Z"


def survival_art(x0: float, x1: float, top: float, bottom: float, ink_real: str, ink_syn: str, band: str,
                 n: int = 90, hazard: tuple[float, float] = (2.1, 2.35)) -> str:
    real = km_curve(4, n, hazard[0], 0.5)
    syn = km_curve(23, n, hazard[1], 0.5)

    def shift(d: str) -> str:  # las funciones km_svg/band_svg trabajan en [0, ancho]; se desplaza a x0
        return d
    w = x1 - x0
    d_real, c_real = km_svg(real, 0, w, top, bottom)
    d_syn, _ = km_svg(syn, 0, w, top, bottom)
    ticks = "".join(f'<path d="M{x:.1f} {y - 6:.1f} V{y + 6:.1f}"/>' for x, y in c_real[::2])
    return (f'<g transform="translate({x0} 0)">'
            f'<path class="band" d="{shift(band_svg(real, 0, w, top, bottom, n))}" fill="{band}"/>'
            f'<path class="km km2" d="{d_syn}" fill="none" stroke="{ink_syn}" stroke-width="2.5" stroke-linejoin="round"/>'
            f'<path class="km" d="{d_real}" fill="none" stroke="{ink_real}" stroke-width="3" stroke-linejoin="round"/>'
            f'<g class="cens" stroke="{ink_real}" stroke-width="2" stroke-linecap="round">{ticks}</g></g>')


def header(dark: bool) -> str:
    bg = ACCENT_DARK if dark else ACCENT
    cx0, cx1, ctop, cbot = 760, 1216, 54, 236
    axis = "rgba(255,255,255,.28)"
    grid = "".join(f'<path d="M{cx0} {ctop + (cbot - ctop) * k / 4:.0f} H{cx1}" stroke="rgba(255,255,255,.10)"/>' for k in range(4))
    art = survival_art(cx0, cx1, ctop, cbot, "#FFFFFF", "#7DF0E2", "rgba(255,255,255,.13)")
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="300" viewBox="0 0 1280 300" role="img" aria-label="S.Y.N.A.P.S.E.: curvas de supervivencia real y sintética">
  <title>S.Y.N.A.P.S.E.</title>
  {CSS}
  <rect width="1280" height="300" rx="28" fill="{bg}"/>
  <g class="t">
    <g transform="translate(64 52)">
      <rect width="60" height="60" rx="14" fill="#FFFFFF"/>
      <g transform="translate(11 11) scale(1.5833)" fill="none" stroke="{bg}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">{glyph('dna')}</g>
    </g>
    <text x="62" y="170" font-family="{FONT}" font-weight="700" font-size="60" letter-spacing="-1.8" fill="#FFFFFF">S.Y.N.A.P.S.E.</text>
    <text x="64" y="206" font-family="{FONT}" font-weight="500" font-size="21" letter-spacing="-0.2" fill="#FFFFFF" fill-opacity="0.95">Validez inferencial · Riesgo de reidentificación</text>
    <text x="64" y="234" font-family="{FONT}" font-weight="500" font-size="21" letter-spacing="-0.2" fill="#FFFFFF" fill-opacity="0.95">Datos sanitarios sintéticos</text>
    <text x="64" y="266" font-family="{FONT}" font-weight="400" font-size="15" fill="#FFFFFF" fill-opacity="0.75">SYNthetic Anonymised Patients — Statistical fidelity &amp; Security Evaluation</text>
  </g>
  {grid}
  <path d="M{cx0} {ctop - 8} V{cbot} H{cx1 + 8}" fill="none" stroke="{axis}" stroke-width="1.5"/>
  <g font-family="{FONT}" font-size="12" fill="#FFFFFF" fill-opacity="0.7">
    <text x="{cx0 - 10}" y="{ctop + 4}" text-anchor="end">1,0</text><text x="{cx0 - 10}" y="{(ctop + cbot) / 2 + 4:.0f}" text-anchor="end">0,5</text>
    <text x="{cx0 - 10}" y="{cbot + 4}" text-anchor="end">0</text>
    <text x="{cx0}" y="{ctop - 18}" font-weight="600" fill-opacity="0.85">S(t)</text>
    <text x="{cx1}" y="{cbot + 22}" text-anchor="end">tiempo de seguimiento →</text>
  </g>
  {art}
  <g class="t" font-family="{FONT}" font-size="13" font-weight="500" fill="#FFFFFF" fill-opacity="0.9">
    <path d="M{cx0} 272 h24" stroke="#FFFFFF" stroke-width="3"/><text x="{cx0 + 32}" y="277">Real</text>
    <path d="M{cx0 + 86} 272 h24" stroke="#7DF0E2" stroke-width="3"/><text x="{cx0 + 118}" y="277">Sintético</text>
    <rect x="{cx0 + 200}" y="265" width="24" height="14" rx="3" fill="rgba(255,255,255,.18)"/><text x="{cx0 + 232}" y="277">IC 95 %</text>
    <path d="M{cx0 + 312} 265 V279" stroke="#FFFFFF" stroke-width="2"/><text x="{cx0 + 322}" y="277">censura</text>
  </g>
</svg>
"""


def footer(dark: bool) -> str:
    bg = ACCENT_DARK if dark else ACCENT
    art = survival_art(0, 1280, 14, 100, bg, "#30B0C7", "rgba(10,92,255,.10)", n=70, hazard=(1.2, 1.35))
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="110" viewBox="0 0 1280 110" role="img" aria-label="Fin">
  {CSS}
  {art}
</svg>
"""


def stats(dark: bool) -> str:
    k = {"bg": "#1C1C1E", "ink": "#F5F5F7", "faint": "#98989D"} if dark else {"bg": "#F5F5F7", "ink": "#1D1D1F", "faint": "#6E6E73"}
    items = [("320", "evaluaciones completas"), ("4", "estudios clínicos reales"), ("8", "generadores comparados"),
             ("0", "pacientes reales expuestos")]
    col_w = 300
    x0 = 640 - col_w * len(items) / 2
    body = "\n  ".join(
        f'<text x="{x0 + col_w * i + col_w / 2:.0f}" y="74" text-anchor="middle" font-family="{FONT}" font-weight="600" '
        f'font-size="48" letter-spacing="-1.4" fill="{k["ink"]}">{n}</text>\n  '
        f'<text x="{x0 + col_w * i + col_w / 2:.0f}" y="110" text-anchor="middle" font-family="{FONT}" font-weight="400" '
        f'font-size="19" fill="{k["faint"]}">{label}</text>' for i, (n, label) in enumerate(items))
    aria = ", ".join(f"{n} {label}" for n, label in items)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="150" viewBox="0 0 1280 150" role="img" '
            f'aria-label="{aria}">\n  <rect width="1280" height="150" rx="28" fill="{k["bg"]}"/>\n  {body}\n</svg>\n')


def main() -> None:
    n_icons = section_icons()
    (OUT / "stack").mkdir(parents=True, exist_ok=True)
    for name, svg in TILES.items():
        (OUT / "stack" / f"{name}.svg").write_text(svg, encoding="utf-8")
    (OUT / "readme").mkdir(parents=True, exist_ok=True)
    for name, fn in (("cabecera", header), ("pie", footer), ("cifras", stats)):
        (OUT / "readme" / f"{name}-light.svg").write_text(fn(False), encoding="utf-8")
        (OUT / "readme" / f"{name}-dark.svg").write_text(fn(True), encoding="utf-8")
    print(f"OK · {n_icons} iconos de sección · {len(TILES)} mosaicos · cabecera, cifras y pie en claro y oscuro")


if __name__ == "__main__":
    main()
