"""Extrae el logo real de la consola (icono V + rótulo VALHALLA en Alexana) como PNG transparente.

Se captura el propio componente de la pantalla de acceso a 4x, quitando solo el fondo del login.
Salida: public/marca/logo_icono.png y public/marca/logo_marca.png
"""
import asyncio

from grabador import BASE, RAIZ, abrir, async_playwright

DEST = RAIZ / "public" / "marca"
SIN_FONDO = """
html, body, #root, .login-layout, .login-hero-col, .login-screen, [class*="login-bg"] {
  background: transparent !important; background-image: none !important; }
.login-layout::before, .login-layout::after, .login-hero-col::before, .login-hero-col::after,
body::before, body::after, #root::before, #root::after { display: none !important; }
.login-form-col, .login-tagline, #__cur { visibility: hidden !important; }
.login-brand-row { display: inline-flex !important; width: auto !important; }
"""
OSCURO = """
.login-brand-row { --login-brand-text: #0d2a1f !important; --login-pro-muted: #5b7268 !important; color: #0d2a1f !important; }

"""


async def main():
    DEST.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as p:
        nav = await p.chromium.launch(channel="msedge", headless=True)
        ctx = await nav.new_context(viewport={"width": 1920, "height": 1080}, device_scale_factor=4)
        await ctx.add_init_script("try{localStorage.setItem('valhalla_theme','dark');localStorage.setItem('valhalla_lang','es')}catch(e){}")
        page = await ctx.new_page()
        await page.goto(BASE + "/", wait_until="networkidle")
        await page.wait_for_timeout(2500)
        await page.add_style_tag(content=SIN_FONDO)
        await page.wait_for_timeout(800)
        await page.locator(".login-logo-tile").screenshot(path=str(DEST / "logo_icono.png"), omit_background=True)
        await page.locator(".login-brand-row").screenshot(path=str(DEST / "logo_marca.png"), omit_background=True)
        await page.add_style_tag(content=OSCURO)
        await page.wait_for_timeout(500)
        await page.locator(".login-brand-row").screenshot(path=str(DEST / "logo_marca_oscuro.png"), omit_background=True)
        await nav.close()
    # recorte al contenido (la fila del login es más ancha que el logotipo)
    from PIL import Image
    for f in ("logo_icono.png", "logo_marca.png", "logo_marca_oscuro.png"):
        im = Image.open(DEST / f)
        im.crop(im.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()).save(DEST / f)
    print("logo en", DEST)


asyncio.run(main())
