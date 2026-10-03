import asyncio

from grabador import BASE, Toma, abrir, async_playwright


async def main():
    async with async_playwright() as p:
        nav, page = await abrir(p)
        await page.goto(BASE + "/", wait_until="networkidle")
        await page.wait_for_timeout(4000)
        t = Toma(page, "prueba")
        await t.empezar()
        await t.senalar("text=ALERTAS · 24 H", "Indicadores")
        await t.rueda(500, 1.5, 900, 600)
        await t.rueda(-500, 1.0)
        await t.ir("SIEM")
        await t.terminar()
        await nav.close()

asyncio.run(main())
