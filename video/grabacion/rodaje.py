"""Recorrido grabado de la consola real de Valhalla: una función por toma.

Cada toma abre la consola, hace lo que haría un analista (clics, scroll, tecleo) y deja un
clip en public/clips/ con sus marcas. Las acciones son reales: el incidente se crea de verdad,
el usuario de demostración se crea, se invita y al final se anula su invitación y se borra.

Uso: python grabacion/rodaje.py [toma ...]      (sin argumentos: todas, en orden)
"""
from __future__ import annotations

import asyncio
import re
import sys

from grabador import BASE, Toma, abrir, async_playwright

TOMAS = {}


def toma(f):
    TOMAS[f.__name__] = f
    return f


async def cargar(page, espera: float = 4.0):
    await page.goto(BASE + "/", wait_until="networkidle")
    await page.wait_for_timeout(int(espera * 1000))


async def vista(page, v: str, espera: float = 4.0):
    """Coloca la consola en una vista antes de empezar a grabar (fuera de plano)."""
    await page.evaluate("v => window.dispatchEvent(new CustomEvent('navigate-to-view', {detail: {view: v}}))", v)
    await page.wait_for_timeout(int(espera * 1000))


def btn(page, texto: str, dentro: str = ""):
    """Botón o pestaña por su texto exacto (o por su aria-label si es solo icono)."""
    exacto = re.compile(rf"^\s*{re.escape(texto)}\s*$", re.I)
    base = page.locator(dentro) if dentro else page
    return base.locator("button, [role=tab]").filter(has_text=exacto).or_(base.get_by_role("button", name=texto, exact=True))


# ───────────────────────────── tomas ─────────────────────────────

@toma
async def login(p):
    nav, page = await abrir(p, sesion=False)
    await cargar(page, 3)
    t = Toma(page, "login")
    await t.empezar()
    await t.resaltar(".login-btn", None, zoom=1.0, pausa=0.8)
    await t.clic("input.login-input >> nth=0", "Usuario")
    await t.escribir("admin")
    await t.clic("input.login-input >> nth=1", "Contraseña (prueba con una incorrecta)")
    await t.escribir("NoEsLaClave-2026", 45)
    await t.clic(".login-btn", "Credenciales incorrectas → 401", pausa=3.0)
    await t.terminar(1.5)
    await nav.close()


@toma
async def vista_general(p):
    nav, page = await abrir(p)
    await cargar(page)
    t = Toma(page, "vista_general")
    await t.empezar()
    await t.resaltar(".vx-kpi >> nth=0", "Alertas del periodo", pausa=1.6)
    await t.senalar(".vx-kpi >> nth=1", "Críticas: nivel ≥ 12", pausa=1.2)
    await t.senalar(".vx-kpi >> nth=3", "Incidentes abiertos", pausa=1.4)
    await t.senalar("text=ALERTAS WAZUH", "Alertas de Wazuh en directo", pausa=1.6)
    await t.senalar("text=VOLUMEN", "Volumen por hora", pausa=1.4)
    await t.senalar("text=SEVERIDAD", "Distribución por severidad", pausa=1.4)
    await t.senalar("text=ATACANTES", "Atacantes principales", pausa=1.6)
    await t.rueda(520, 1.6, 1100, 640)
    await t.senalar("text=MITRE ATT&CK", "Técnicas ATT&CK observadas", pausa=1.6)
    await t.senalar("text=SALUD DEL STACK", "Salud de cada servicio", pausa=1.8)
    await t.rueda(-520, 1.2)
    await t.clic(btn(page, "ÚLTIMOS 7 DÍAS"), "Cambiar el periodo", pausa=2.5)
    await t.clic(btn(page, "ÚLTIMAS 24H"), pausa=2.0)
    await t.terminar()
    await nav.close()


@toma
async def siem(p):
    nav, page = await abrir(p)
    await cargar(page)
    t = Toma(page, "siem")
    await t.empezar()
    await t.ir("SIEM", espera=5)
    await t.resaltar(".sv-row >> nth=0", "Alertas en directo desde el indexador", zoom=1.3, pausa=1.8)
    await t.clic(btn(page, "Filtros"), "Filtros", pausa=1.6)
    await t.clic(btn(page, "Filtros"), pausa=0.6)
    await t.clic(btn(page, "Agrupar similares"), "Agrupar similares", pausa=2.0)
    await t.clic(btn(page, "Agrupar similares"), pausa=1.2)
    await t.senalar("text=MITRE ATT&CK", "Técnicas ATT&CK", pausa=2.2)
    fila = page.locator(".sv-row").filter(has_text="brute force").first
    await t.clic(fila, "Detalle de la alerta", pausa=2.6)
    escalar = page.locator("button").filter(has_text="Escalar").last   # el del detalle (los de la tabla son solo icono)
    await t.senalar("text=MITRE ATT&CK >> nth=-1", "Técnicas de la alerta", pausa=1.4)
    await t.clic(escalar, "Escalar a incidente", pausa=3.5)
    await t.terminar(1.5)
    await nav.close()


@toma
async def honeypots(p):
    nav, page = await abrir(p)
    await cargar(page)
    t = Toma(page, "honeypots")
    await t.empezar()
    await t.ir("HONEYPOTS", espera=5)
    await t.resaltar(".vx-kpi >> nth=0", None, pausa=0.4)
    kpis = page.locator(".vx-kpi")
    for i, txt in enumerate(["Sesiones", "Inicios fallidos", "Accesos logrados", "IPs atacantes"]):
        if await kpis.count() > i:
            await t.senalar(kpis.nth(i), txt, pausa=1.1)
    await t.rueda(420, 1.4, 900, 620)
    await t.senalar(btn(page, "Analizar en Inteligencia").first, "Credenciales más probadas", pausa=2.2)
    await t.rueda(480, 1.4)
    await t.espera(2.0)
    await t.rueda(-900, 1.4)
    await t.terminar()
    await nav.close()


@toma
async def workspace(p):
    nav, page = await abrir(p)
    await cargar(page)
    t = Toma(page, "workspace")
    await t.empezar()
    await t.ir("WORKSPACE", espera=4)
    await t.resaltar(".wk-stat >> nth=0", "Indicadores del equipo", zoom=1.4, pausa=1.6)
    tarjeta = page.locator(".wk-card").filter(has_text="Successful login AFTER brute force").first
    await t.senalar(tarjeta, "El incidente que acabamos de escalar", pausa=1.4)
    await t.clic(page.locator(".wk-card .wk-card__title, .wk-card h3, .wk-card h4").filter(has_text="Successful login AFTER").first, pausa=2.2)
    D = ".wk-drawer"
    await t.resaltar(f"{D} .wk-drawer__title", "Detalle del incidente", pausa=1.4)
    await t.clic(btn(page, "Investigación", D), "Cambio de fase", pausa=2.0)
    nota = page.locator(f"{D} textarea").first
    await t.clic(nota, "Notas del analista", pausa=0.3)
    await t.escribir("Fuerza bruta SSH al honeypot desde 172.19.0.2; acceso logrado con una credencial del diccionario. Se sigue el runbook.", 26)
    await t.clic(page.locator(f"{D} .wk-sec-tools").filter(has_text="Guardar").first, pausa=1.6)
    await t.senalar(page.locator(f"{D} .wk-rb__pick").first, "Runbook sugerido", pausa=1.8)
    await t.clic(btn(page, "Contención", D), "Contención", pausa=2.0)
    await t.senalar(page.locator(f"{D} .pf-timeline").first, "Historial: cada cambio queda registrado", pausa=2.4)
    await t.clic(btn(page, "Resuelto", D), "Resolver con clasificación", pausa=1.8)
    await t.clic(page.locator("button").filter(has_text="Verdadero").first, "Verdadero positivo", pausa=0.8)
    notas = page.get_by_placeholder(re.compile("Causa raíz"))
    await t.clic(notas, pausa=0.3)
    await t.escribir("Contenido: IP del laboratorio bloqueada; el honeypot no expone datos reales. Sin impacto.", 26)
    await t.clic(page.locator("button").filter(has_text=re.compile("Marcar como resuelto", re.I)).first, "Resuelto", pausa=3.0)
    await t.terminar(1.5)
    await nav.close()


@toma
async def runbooks(p):
    nav, page = await abrir(p)
    await cargar(page)
    t = Toma(page, "runbooks")
    await t.empezar()
    await t.ir("RUNBOOKS", espera=3)
    await t.resaltar(".rb-card >> nth=0", None, pausa=0.3)
    await t.clic(btn(page, "Intrusión 5"), "Por categoría", pausa=1.6)
    await t.clic(page.locator(".rb-card").filter(has_text="Brute Force SSH").first, "Brute Force SSH/Telnet", pausa=2.4)
    await t.rueda(600, 2.0, 1000, 640)
    await t.espera(1.5)
    await t.rueda(700, 2.0)
    await t.espera(1.5)
    await t.rueda(-1300, 1.4)
    await t.terminar()
    await nav.close()


@toma
async def inteligencia(p):
    nav, page = await abrir(p)
    await cargar(page)
    t = Toma(page, "inteligencia")
    await t.empezar()
    await t.ir("INTELIGENCIA", espera=3)
    await t.clic(btn(page, "Vulnerabilidades"), "CVE explotadas · CISA KEV", pausa=3.0)
    await t.rueda(380, 1.4, 1000, 620)
    await t.espera(1.6)
    await t.rueda(-380, 1.0)
    await t.clic(btn(page, "IOCs"), "Reputación de IP, dominio o hash", pausa=2.6)
    await t.clic(btn(page, "Mapa"), "Mapa de atacantes", pausa=4.0)
    await t.terminar()
    await nav.close()


@toma
async def activos(p):
    nav, page = await abrir(p)
    await cargar(page)
    t = Toma(page, "activos")
    await t.empezar()
    await t.ir("ACTIVOS", espera=4)
    await t.resaltar(".vx-kpi >> nth=0", None, pausa=0.3)
    fila = page.locator("tr, [class*=row]").filter(has_text="valhalla-linux").first
    await t.senalar(fila, "Equipo con agente de Wazuh", pausa=1.6)
    await t.clic(fila, pausa=2.6)
    await t.rueda(500, 1.6, 1000, 640)
    await t.espera(2.0)
    await t.terminar()
    await nav.close()


@toma
async def bifrost(p):
    nav, page = await abrir(p)
    await cargar(page)
    t = Toma(page, "bifrost")
    await t.empezar()
    await t.ir("BIFRÖST", espera=4)
    kpis = page.locator(".vx-kpi")
    for i, txt in enumerate(["MTTR con la fecha real de resolución", "Antigüedad de los abiertos", "Tasa de resolución", "Cobertura ATT&CK"]):
        if await kpis.count() > i:
            await t.senalar(kpis.nth(i), txt, pausa=1.2)
    consulta = page.locator("button").filter(has_text="Credenciales que funcionaron").first
    await t.clic(consulta, "Caza: credenciales que funcionaron", pausa=1.0)
    await t.clic(btn(page, "Ejecutar"), "Ejecutar sobre el SIEM", pausa=3.0)
    await t.rueda(300, 1.2, 1100, 700)
    await t.espera(1.6)
    await t.terminar()
    await nav.close()


@toma
async def informes(p):
    nav, page = await abrir(p)
    await cargar(page)
    t = Toma(page, "informes")
    await t.empezar()
    await t.ir("INFORMES", espera=3)
    await t.clic(btn(page, "24 h"), "Periodo", pausa=0.8)
    await t.clic(page.locator(".rc-tlp--AMBER"), "Clasificación TLP", pausa=1.0)
    await t.senalar(".vp-switch-row", "Resumen con IA: opcional (~40 s en CPU)", pausa=1.6)
    await t.clic(page.locator("button").filter(has_text="Generar informe"), "Generar informe", pausa=1.0)
    await page.wait_for_selector("button.wk-hash", timeout=90000)
    await t.espera(1.5)
    await t.senalar("button.wk-hash", "Huella SHA-256 del contenido", pausa=1.8)
    await t.clic(btn(page, "Verificar integridad"), "Verificar integridad", pausa=3.0)
    await t.rueda(700, 2.4, 1000, 650)
    await t.espera(1.2)
    await t.rueda(700, 2.4)
    await t.espera(1.2)
    await t.terminar()
    await nav.close()


@toma
async def grc(p):
    nav, page = await abrir(p)
    await cargar(page)
    await vista(page, "reports", 3)
    t = Toma(page, "grc")
    await t.empezar()
    await t.clic(btn(page, "Informe GRC"), "Informe GRC", pausa=4.0)
    await t.rueda(600, 2.2, 1000, 650)
    await t.espera(2.0)
    await t.rueda(700, 2.2)
    await t.espera(2.0)
    await t.rueda(700, 2.2)
    await t.espera(2.0)
    await t.terminar()
    await nav.close()


DEMO = "demo_analista"


@toma
async def usuarios(p):
    nav, page = await abrir(p)
    await cargar(page)
    # el enlace de Tailscale es real y válido hasta que se anula: no se deja leer en el vídeo
    await page.add_style_tag(content=".us-invite__links li:first-child code, .us-invite__msg { filter: blur(7px); }")
    t = Toma(page, "usuarios")
    await t.empezar()
    await t.ir("USUARIOS", espera=3)
    await t.senalar(".vx-kpi >> nth=1", "Quién está conectado ahora", pausa=1.4)
    await t.clic(btn(page, "Administrador 1"), "Filtrar por rol", pausa=1.2)
    await t.clic(btn(page, "Todos 4"), pausa=1.0)
    await t.senalar("text=escritorio · Windows · Edge", "Dispositivo y red de cada sesión", pausa=2.0)
    await t.clic(page.locator("button").filter(has_text="Nuevo usuario"), "Nuevo usuario", pausa=1.2)
    campos = page.locator(".wk-drawer .rb-form input")
    await t.clic(campos.nth(0), "Usuario", pausa=0.2)
    await t.escribir(DEMO)
    await t.clic(campos.nth(1), "Email", pausa=0.2)
    await t.escribir("demo_analista@valhalla.local", 40)
    sel = page.locator(".wk-drawer .rb-form select")
    await t.senalar(sel, "Rol: administrador · analista · reportero · lector", pausa=0.6)
    await sel.select_option("analista")
    await t.espera(0.8)
    await t.senalar(".us-check", "Invitación de un solo uso (24 h)", pausa=1.6)
    await t.clic(page.locator(".wk-drawer__foot button").filter(has_text="Crear e invitar"), "Crear e invitar", pausa=3.5)
    await t.resaltar(".us-invite", "Enlaces para compartir: solo se guarda su huella", pausa=3.0)
    await t.rueda(500, 1.4, 1600, 700)
    await t.espera(1.5)
    await t.clic(page.locator(".wk-drawer button").filter(has_text="Anular"), "Anular la invitación", pausa=2.0)
    await t.mantener(page.locator(".wk-drawer__foot button").filter(has_text="Eliminar"), 2.6, "Eliminar: mantener pulsado")
    await t.espera(2.5)
    await t.terminar()
    await nav.close()


@toma
async def perfil(p):
    nav, page = await abrir(p)
    await cargar(page)
    t = Toma(page, "perfil")
    await t.empezar()
    await t.clic("button.vp-user", "Menú de usuario", pausa=1.2)
    await t.clic(page.locator("button.vp-menu-item").filter(has_text="Mi perfil"), "Mi perfil", pausa=3.0)
    await t.senalar("text=ASIGNADOS ABIERTOS", "Mi actividad en el SOC", pausa=1.6)
    await t.senalar("text=SESIÓN ACTUAL", "Sesión actual: dispositivo, IP y token", pausa=1.8)
    await t.senalar("text=CUENTA", "Datos de contacto", pausa=1.4)
    await t.rueda(520, 1.6, 900, 640)
    await t.senalar("text=MIS SESIONES ACTIVAS", "Sesiones abiertas en otros dispositivos", pausa=1.8)
    await t.rueda(520, 1.6)
    await t.senalar("text=SEGURIDAD", "Cambio de contraseña", pausa=1.6)
    await t.senalar("text=ACTIVIDAD RECIENTE", "Mi rastro en la auditoría", pausa=1.8)
    await t.rueda(-1040, 1.4)
    await t.terminar()
    await nav.close()


@toma
async def chat(p):
    nav, page = await abrir(p)
    await cargar(page)
    t = Toma(page, "chat")
    await t.empezar()
    await t.clic(btn(page, "Chat interno"), "Chat del equipo", pausa=1.5)
    await t.senalar(".chat-sidebar", "Canal del equipo y mensajes directos", pausa=1.6)
    entrada = page.locator(".chat-panel__input")
    await t.clic(entrada, pausa=0.3)
    await t.escribir("Equipo: el incidente #5 (fuerza bruta SSH al honeypot) pasa a contención. Sigo el runbook.", 32)
    await page.keyboard.press("Enter")
    await t.espera(1.8)
    await t.clic(entrada, pausa=0.3)
    await t.escribir("@ia explica en dos frases qué es la técnica T1110 de MITRE ATT&CK", 40)
    await page.keyboard.press("Enter")
    await t.espera(2.5)
    t.corte(True)
    try:
        await page.wait_for_function(
            "() => [...document.querySelectorAll('.chat-msg__user')].some(e => /valhalla-ia/i.test(e.textContent))"
            " && !document.querySelector('.chat-ai-typing')", timeout=240000)
    except Exception:
        print("    ⚠ chat: la IA no respondió a tiempo")
    await t.espera(0.5)
    t.corte(False)
    ultimo = page.locator(".chat-msg").last
    await t.resaltar(ultimo, "Respuesta del asistente local (Ollama)", pausa=5.0)
    await t.terminar()
    await nav.close()


@toma
async def apariencia(p):
    nav, page = await abrir(p)
    await cargar(page)
    t = Toma(page, "apariencia")
    await t.empezar()
    await t.clic(btn(page, "Apariencia"), "Apariencia", pausa=1.2)
    for color in ("Eléctrico", "Púrpura", "Ámbar", "Rojo", "Cian"):
        await t.clic(btn(page, color), f"Color de acento: {color}", pausa=1.1)
    await t.clic(btn(page, "Claro"), "Tema claro", pausa=2.2)
    await t.clic(btn(page, "English"), "Idioma: inglés", pausa=2.4)
    await t.clic(btn(page, "Español"), "Español", pausa=1.6)
    await t.clic(btn(page, "Oscuro"), "Tema oscuro", pausa=1.6)
    await t.clic(btn(page, "Bosque"), "Bosque (por defecto)", pausa=1.6)
    await page.keyboard.press("Escape")
    await t.espera(1.0)
    await t.terminar()
    await nav.close()


@toma
async def busqueda(p):
    nav, page = await abrir(p)
    await cargar(page)
    t = Toma(page, "busqueda")
    await t.empezar()
    await t.senalar("button.vp-search", "Búsqueda global · Ctrl K", pausa=0.8)
    await page.keyboard.press("Control+k")
    await t.espera(1.0)
    await t.escribir("runb", 120)
    await t.espera(1.2)
    await page.keyboard.press("Enter")
    await t.espera(2.5)
    await page.keyboard.press("Control+k")
    await t.espera(0.8)
    await t.escribir("usua", 120)
    await t.espera(1.0)
    await page.keyboard.press("Enter")
    await t.espera(2.5)
    await t.clic(btn(page, "NOTIFICACIONES"), "Notificaciones: incidentes pendientes", pausa=2.6)
    await t.senalar(page.locator("button").filter(has_text="ASIGNAR A MÍ").first, "Asignarse el caso", pausa=1.6)
    await t.clic(page.locator("button").filter(has_text="IR A WORKSPACE").first, "Ir al Workspace", pausa=3.0)
    await t.terminar()
    await nav.close()


@toma
async def sistema(p):
    nav, page = await abrir(p)
    await cargar(page)
    t = Toma(page, "sistema")
    await t.empezar()
    await t.ir("SISTEMA", espera=3)
    await t.clic(btn(page, "Comprobar ahora"), "Salud y latencia de cada integración", pausa=3.0)
    await t.clic(btn(page, "Monitores"), "Monitores de detección", pausa=2.6)
    await t.clic(btn(page, "Auditoría"), "Registro de auditoría", pausa=3.0)
    await t.rueda(400, 1.4, 1000, 650)
    await t.espera(1.5)
    await t.terminar()
    await nav.close()


@toma
async def movil(p):
    nav, page = await abrir(p, movil=True)
    await cargar(page)
    await page.add_style_tag(content="#__cur{display:none!important}")
    t = Toma(page, "movil", escala=2)
    await t.empezar()
    await t.espera(1.5)
    await t.rueda(900, 3.0, 195, 600)
    await t.espera(1.0)
    await t.rueda(-900, 1.6)
    nav_inf = page.locator("nav button, [class*=bottom] button")
    n = await nav_inf.count()
    for i in range(1, min(n, 4)):
        await t.clic(nav_inf.nth(i), pausa=2.4)
        await t.rueda(500, 1.6, 195, 600)
        await t.espera(0.8)
    await t.terminar()
    await nav.close()


@toma
async def bloqueo(p):
    """Bloqueo real de la IP del atacante del laboratorio; al acabar se desbloquea para que el lab siga."""
    nav, page = await abrir(p)
    await cargar(page)
    t = Toma(page, "bloqueo")
    await t.empezar()
    boton = page.locator("button.vx-hold").first
    await t.senalar(boton, "Acción destructiva: mantener pulsado", pausa=1.0)
    await t.mantener(boton, 2.4, "Bloquear 172.19.0.2")
    await t.espera(3.5)
    await t.ir("INTELIGENCIA", espera=2.5)
    await t.clic(btn(page, "IOCs"), pausa=1.5)
    await t.clic(page.locator("button").filter(has_text=re.compile(r"^\s*Bloqueado")).first, "IPs bloqueadas", pausa=3.0)
    await t.terminar()
    r = await page.evaluate("""async () => {
        const csrf = (document.cookie.match(/csrf_token=([^;]+)/) || [])[1] || '';
        const res = await fetch('/api/firewall/unblock', {method: 'POST', credentials: 'include',
            headers: {'Content-Type': 'application/json', 'X-CSRF-Token': decodeURIComponent(csrf)},
            body: JSON.stringify({ip: '172.19.0.2'})});
        return res.status + ' ' + (await res.text()).slice(0, 120);
    }""")
    print("    desbloqueo tras la toma:", r)
    await nav.close()


async def main(nombres):
    async with async_playwright() as p:
        for n in nombres or list(TOMAS):
            print(f"● {n}", flush=True)
            await TOMAS[n](p)


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1:]))
