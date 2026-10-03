"""Genera las capturas del README a partir de site/index.html.

    pip install playwright && playwright install chromium   # una vez
    synapse site && python scripts/capturas.py

Con un Chromium ya instalado: CHROMIUM=/ruta/a/chrome python scripts/capturas.py
"""
from __future__ import annotations

import os
from pathlib import Path

from playwright.sync_api import Page, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
SITE = (ROOT / "site" / "index.html").as_uri()
OUT = ROOT / "docs" / "img" / "readme"

DESKTOP = [  # (fichero, vista, tema)
    ("inicio-light", "inicio", "light"), ("panel-dark", "panel", "dark"),
    ("supervivencia-light", "supervivencia", "light"), ("efectos-dark", "efectos", "dark"),
    ("semaforo-light", "semaforo", "light"), ("privacidad-dark", "privacidad", "dark"),
    ("metodo-light", "metodo", "light"), ("normativa-dark", "normativa", "dark"),
    ("ayuda-light", "ayuda", "light"), ("ajustes-dark", "ajustes", "dark"),
]


def open_view(page: Page, view: str) -> None:
    page.goto(f"{SITE}#{view}")
    page.evaluate("() => { try { localStorage.clear(); } catch (e) {} }")
    page.goto(f"{SITE}#{view}")
    page.wait_for_timeout(450)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    errors: list[str] = []
    with sync_playwright() as pw:
        exe = os.environ.get("CHROMIUM")
        browser = pw.chromium.launch(executable_path=exe) if exe else pw.chromium.launch()

        def page(width: int, height: int, scheme: str) -> Page:
            p = browser.new_page(viewport={"width": width, "height": height}, color_scheme=scheme,  # type: ignore[arg-type]
                                 device_scale_factor=1)
            p.on("pageerror", lambda e: errors.append(str(e)))
            return p

        for name, view, scheme in DESKTOP:
            p = page(1440, 900, scheme)
            open_view(p, view)
            p.screenshot(path=OUT / f"{name}.png")
            p.close()

        # Barra lateral: completa, compacta y compacta desplegada al pasar el ratón
        p = page(1440, 900, "light")
        open_view(p, "panel")
        p.screenshot(path=OUT / "rail-completa.png", clip={"x": 0, "y": 0, "width": 310, "height": 900})
        p.keyboard.press("[")
        p.mouse.move(900, 450)
        p.wait_for_timeout(400)
        p.screenshot(path=OUT / "rail-compacta.png", clip={"x": 0, "y": 0, "width": 310, "height": 900})
        p.mouse.move(40, 300)
        p.wait_for_timeout(500)
        p.screenshot(path=OUT / "rail-desplegada.png", clip={"x": 0, "y": 0, "width": 310, "height": 900})
        p.close()

        # Paleta de búsqueda
        p = page(1440, 900, "light")
        open_view(p, "panel")
        p.keyboard.press("Control+k")
        p.keyboard.type("cop")
        p.wait_for_timeout(300)
        p.screenshot(path=OUT / "busqueda-light.png")
        p.close()

        # Móvil
        for name, view in (("movil-panel", "panel"), ("movil-semaforo", "semaforo")):
            p = page(390, 844, "light")
            open_view(p, view)
            p.screenshot(path=OUT / f"{name}.png")
            p.close()
        p = page(390, 844, "light")
        open_view(p, "supervivencia")
        p.click('[data-act="drawer"]')
        p.wait_for_timeout(400)
        p.screenshot(path=OUT / "movil-menu.png")
        p.close()
        browser.close()
    if errors:
        raise SystemExit(f"errores de JavaScript: {errors}")
    print(f"✓ {len(list(OUT.glob('*.png')))} capturas en {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
