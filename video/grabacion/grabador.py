"""Grabador de clips de demostración de Valhalla SOC.

Graba el producto REAL en ejecución, a 1920x1080 y 30 fps, con calidad de texto nítida:
  · Chromium (Playwright) se abre a pantalla completa en un display virtual (Xvfb);
  · ffmpeg captura ese display (x11grab) y lo codifica en H.264 sin audio;
  · un cursor visible (inyectado en la página) sigue al ratón de Playwright y marca los clics;
  · los clips de terminal ejecutan el comando DE VERDAD y muestran su salida en directo
    en una ventana de terminal dibujada en el mismo navegador.

Cada clip deja, junto al .mp4, un .json con la línea de tiempo de acciones («t» en segundos),
que el montaje usa para sincronizar la voz con lo que pasa en pantalla.

Requisitos: pip install playwright pexpect; Xvfb y ffmpeg instalados; Chromium de Playwright.

Ejemplo:
    from grabador import Grabador
    with Grabador(salida="video/public/clips") as g:
        with g.clip("c04_login"):
            g.ir("http://localhost:3000")
            g.escribir("input[name=username]", "admin")
            g.escribir_secreto("input[type=password]", os.environ["ADMIN_PASSWORD"])
            g.clic("button[type=submit]")
"""
from __future__ import annotations

import contextlib
import html
import json
import os
import re
import shutil
import signal
import subprocess
import time
from pathlib import Path

ANCHO, ALTO, FPS = 1920, 1080, 30

# Cursor visible: Playwright mueve el ratón por CDP y el puntero de X no se ve en la captura.
CURSOR_JS = r"""
(() => {
  if (window.__vhCursor) return;
  window.__vhCursor = true;
  const pon = () => {
    if (!document.body) { requestAnimationFrame(pon); return; }
    const c = document.createElement('div');
    c.id = '__vh_cursor';
    c.innerHTML = '<svg width="30" height="30" viewBox="0 0 24 24"><path d="M4 2l15 11-6.5 1.3L9 21z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    Object.assign(c.style, {position:'fixed', left:'-100px', top:'-100px', zIndex:2147483647,
      pointerEvents:'none', filter:'drop-shadow(0 2px 3px rgba(0,0,0,.6))', transform:'translate(-3px,-2px)'});
    document.body.appendChild(c);
    addEventListener('mousemove', e => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }, true);
    addEventListener('mousedown', e => {
      const r = document.createElement('div');
      Object.assign(r.style, {position:'fixed', left:(e.clientX-22)+'px', top:(e.clientY-22)+'px', width:'44px', height:'44px',
        borderRadius:'50%', border:'3px solid #74e0a8', zIndex:2147483646, pointerEvents:'none',
        transition:'transform .45s ease-out, opacity .45s ease-out', transform:'scale(.3)', opacity:'1'});
      document.body.appendChild(r);
      requestAnimationFrame(() => { r.style.transform = 'scale(1.4)'; r.style.opacity = '0'; });
      setTimeout(() => r.remove(), 600);
    }, true);
  };
  pon();
})();
"""

TERMINAL_HTML = """<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;height:100%;background:#05090a;}
body{display:flex;align-items:center;justify-content:center;font-family:'JetBrains Mono','DejaVu Sans Mono',monospace;}
.win{width:1720px;height:940px;background:#0a1210;border:1px solid #1f3a30;border-radius:14px;box-shadow:0 30px 90px #000;display:flex;flex-direction:column;overflow:hidden}
.bar{height:44px;display:flex;align-items:center;gap:9px;padding:0 18px;background:#0e1a16;border-bottom:1px solid #1f3a30;color:#8fa89c;font-size:15px}
.dot{width:13px;height:13px;border-radius:50%}
#t{flex:1;padding:22px 28px;color:#d7e7df;font-size:21px;line-height:1.45;white-space:pre-wrap;word-break:break-all;overflow:hidden}
.p{color:#52b788}.c{color:#fff}.e{color:#ff6b78}.w{color:#ffb454}.ok{color:#74e0a8}.dim{color:#6f877c}
.cur{display:inline-block;width:11px;height:23px;background:#52b788;vertical-align:-4px;animation:b 1s steps(1) infinite}
@keyframes b{50%{opacity:0}}
</style></head><body><div class="win"><div class="bar"><span class="dot" style="background:#ff5f57"></span>
<span class="dot" style="background:#febc2e"></span><span class="dot" style="background:#28c840"></span>
<span style="margin-left:14px" id="tt"></span></div><div id="t"></div></div></body></html>"""

ANSI = re.compile(r"\x1b\[[0-9;?]*[A-Za-z]|\x1b\][^\x07]*\x07|\r")


class Grabador:
    def __init__(self, salida: str | Path = "video/public/clips", display: str = ":99", url_base: str = "http://localhost:3000"):
        self.salida = Path(salida)
        self.salida.mkdir(parents=True, exist_ok=True)
        self.display = display
        self.url_base = url_base.rstrip("/")
        self._xvfb = None
        self._ffmpeg = None
        self._eventos: list[dict] = []
        self._t0 = 0.0
        self._clip = None

    # ── ciclo de vida ────────────────────────────────────────────────────────
    def __enter__(self) -> "Grabador":
        if not shutil.which("ffmpeg"):
            raise SystemExit("Falta ffmpeg")
        if not os.environ.get("VH_DISPLAY_EXISTENTE"):
            self._xvfb = subprocess.Popen(
                ["Xvfb", self.display, "-screen", "0", f"{ANCHO}x{ALTO}x24", "-nolisten", "tcp"],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            time.sleep(1.2)
        os.environ["DISPLAY"] = self.display
        from playwright.sync_api import sync_playwright

        self._pw = sync_playwright().start()
        # Ventana en modo aplicación (--app): sin pestañas ni barra de direcciones en la grabación.
        import tempfile

        self._perfil = tempfile.mkdtemp(prefix="vh-chromium-")
        self.contexto = self._pw.chromium.launch_persistent_context(
            self._perfil,
            headless=False,
            no_viewport=True,
            locale="es-ES",
            ignore_https_errors=True,
            ignore_default_args=["--enable-automation"],
            args=[f"--app=data:text/html,<body style='background:%23070d0b'>", f"--window-size={ANCHO},{ALTO}",
                  "--window-position=0,0", "--kiosk", "--disable-infobars", "--hide-scrollbars",
                  "--force-device-scale-factor=1", "--ignore-certificate-errors", "--no-first-run",
                  "--disable-features=Translate", "--autoplay-policy=no-user-gesture-required"],
        )
        self.contexto.add_init_script(CURSOR_JS)
        self.page = self.contexto.pages[0] if self.contexto.pages else self.contexto.new_page()
        dims = self.page.evaluate("[innerWidth, innerHeight]")
        if abs(dims[0] - ANCHO) > 2 or abs(dims[1] - ALTO) > 2:
            print(f"Aviso: el área de la página mide {dims}, no {ANCHO}x{ALTO}")
        return self

    def __exit__(self, *exc) -> None:
        with contextlib.suppress(Exception):
            self.contexto.close()
            self._pw.stop()
        if self._xvfb:
            self._xvfb.send_signal(signal.SIGTERM)

    # ── grabación ────────────────────────────────────────────────────────────
    @contextlib.contextmanager
    def clip(self, nombre: str, preroll: float = 0.6):
        """Graba todo lo que ocurre dentro del bloque en <salida>/<nombre>.mp4."""
        mp4 = self.salida / f"{nombre}.mp4"
        self._clip = nombre
        self._eventos = []
        self._ffmpeg = subprocess.Popen(
            ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "x11grab", "-draw_mouse", "0",
             "-framerate", str(FPS), "-video_size", f"{ANCHO}x{ALTO}", "-i", f"{self.display}.0",
             "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p",
             "-movflags", "+faststart", str(mp4)],
            stdin=subprocess.PIPE)
        self._t0 = time.monotonic()
        time.sleep(preroll)
        self.marcar("inicio")
        try:
            yield self
        finally:
            self.marcar("fin")
            time.sleep(0.6)
            self._ffmpeg.communicate(b"q", timeout=30)
            (self.salida / f"{nombre}.json").write_text(
                json.dumps({"clip": nombre, "eventos": self._eventos}, ensure_ascii=False, indent=1), encoding="utf-8")
            print(f"✔ {mp4}  ({self._eventos[-1]['t']:.1f} s, {mp4.stat().st_size / 1e6:.1f} MB)")
            self._clip = None

    def marcar(self, accion: str) -> None:
        """Anota un momento en la línea de tiempo del clip (para sincronizar la voz)."""
        self._eventos.append({"t": round(time.monotonic() - self._t0, 2), "accion": accion})

    def pausa(self, s: float) -> None:
        time.sleep(s)

    # ── acciones en la consola ───────────────────────────────────────────────
    def ir(self, ruta: str, esperar: float = 1.5) -> None:
        url = ruta if re.match(r"^[a-z]+://", ruta) else self.url_base + ruta
        self.page.goto(url, wait_until="networkidle")
        self.marcar(f"ir {ruta}")
        time.sleep(esperar)

    def _centro(self, objetivo) -> tuple[float, float]:
        if isinstance(objetivo, tuple):
            return objetivo
        loc = self.page.locator(objetivo).first if isinstance(objetivo, str) else objetivo
        loc.scroll_into_view_if_needed()
        caja = loc.bounding_box()
        if not caja:
            raise RuntimeError(f"No visible: {objetivo}")
        return caja["x"] + caja["width"] / 2, caja["y"] + caja["height"] / 2

    def mover(self, objetivo, duracion: float = 0.7) -> None:
        """Mueve el ratón con trayectoria suave (selector, locator o (x, y))."""
        x, y = self._centro(objetivo)
        pasos = max(8, int(duracion * 60))
        self.page.mouse.move(x, y, steps=pasos)

    def clic(self, objetivo, antes: float = 0.25, despues: float = 0.9, texto: str | None = None) -> None:
        self.mover(objetivo)
        time.sleep(antes)
        self.marcar(texto or f"clic {objetivo if isinstance(objetivo, str) else ''}")
        self.page.mouse.down()
        time.sleep(0.08)
        self.page.mouse.up()
        time.sleep(despues)

    def mantener(self, objetivo, ms: int = 1600, texto: str | None = None) -> None:
        """Para los botones de «mantener pulsado» (borrar, bloquear)."""
        self.mover(objetivo)
        time.sleep(0.3)
        self.marcar(texto or "mantener pulsado")
        self.page.mouse.down()
        time.sleep(ms / 1000)
        self.page.mouse.up()
        time.sleep(1.0)

    def escribir(self, objetivo, texto: str, retardo_ms: int = 55) -> None:
        self.clic(objetivo, despues=0.2)
        self.page.keyboard.type(texto, delay=retardo_ms)
        self.marcar(f"escribir {texto[:30]}")
        time.sleep(0.4)

    def escribir_secreto(self, objetivo, secreto: str) -> None:
        """Rellena un campo de contraseña sin teclearlo visiblemente ni registrarlo en la línea de tiempo."""
        self.clic(objetivo, despues=0.2)
        self.page.locator(objetivo).first.fill(secreto) if isinstance(objetivo, str) else objetivo.fill(secreto)
        self.marcar("contraseña (oculta)")
        time.sleep(0.4)

    def tecla(self, combinacion: str, despues: float = 0.8) -> None:
        self.marcar(f"tecla {combinacion}")
        self.page.keyboard.press(combinacion)
        time.sleep(despues)

    def desplazar(self, dy: int, duracion: float = 1.2, objetivo=None) -> None:
        """Desplazamiento suave con la rueda (sobre `objetivo` si se indica)."""
        if objetivo is not None:
            self.mover(objetivo, 0.4)
        pasos = max(6, int(duracion * 30))
        for _ in range(pasos):
            self.page.mouse.wheel(0, dy / pasos)
            time.sleep(duracion / pasos)
        self.marcar(f"desplazar {dy}")

    def captura(self, nombre: str, carpeta: str | Path = "video/public/capturas_v2") -> None:
        """Captura PNG limpia (sin cursor) de la pantalla actual."""
        Path(carpeta).mkdir(parents=True, exist_ok=True)
        self.page.evaluate("document.getElementById('__vh_cursor')?.style.setProperty('display','none')")
        self.page.screenshot(path=str(Path(carpeta) / f"{nombre}.png"))
        self.page.evaluate("document.getElementById('__vh_cursor')?.style.removeProperty('display')")

    # ── terminal real ────────────────────────────────────────────────────────
    def terminal(self, titulo: str = "valhalla-soc") -> "Terminal":
        return Terminal(self, titulo)


class Terminal:
    """Terminal dibujada en el navegador que ejecuta comandos reales y muestra su salida en directo."""

    def __init__(self, g: Grabador, titulo: str, prompt: str = "analista@valhalla:~/valhalla-soc$ "):
        self.g = g
        self.prompt = prompt
        g.page.set_content(TERMINAL_HTML)
        g.page.evaluate("t => document.getElementById('tt').textContent = t", titulo)
        self._linea_prompt()

    def _js_append(self, html_frag: str) -> None:
        self.g.page.evaluate(
            """h => { const t = document.getElementById('t');
                     t.querySelector('.cur')?.remove();
                     t.insertAdjacentHTML('beforeend', h + '<span class="cur"></span>');
                     while (t.scrollHeight > t.clientHeight && t.firstChild) t.removeChild(t.firstChild); }""",
            html_frag)

    def _linea_prompt(self) -> None:
        self._js_append(f'<span class="p">{html.escape(self.prompt)}</span>')

    def texto(self, s: str, clase: str = "") -> None:
        frag = html.escape(s)
        self._js_append(f'<span class="{clase}">{frag}</span>' if clase else frag)

    def teclear(self, comando: str, retardo: float = 0.045) -> None:
        for ch in comando:
            self.texto(ch, "c")
            time.sleep(retardo)
        time.sleep(0.25)
        self.texto("\n")
        self.g.marcar(f"$ {comando[:60]}")

    @staticmethod
    def _clase(linea: str) -> str:
        l = linea.lower()
        if any(k in l for k in ("error", "denied", "fail", "✗", "critical")):
            return "e"
        if any(k in l for k in ("warn", "aviso")):
            return "w"
        if any(k in l for k in (" ok", "✔", "✓", "passed", "healthy", "listo", "correct")):
            return "ok"
        return ""

    def ejecutar(self, comando: str, mostrar: str | None = None, cwd: str | None = None,
                 timeout: float = 1800, filtro=None) -> int:
        """Teclea `mostrar` (o el propio comando) y ejecuta `comando` de verdad, volcando su salida.

        `filtro(linea) -> str | None` permite ocultar líneas sensibles (devolver None) o enmascararlas.
        """
        self.teclear(mostrar or comando)
        proc = subprocess.Popen(comando, shell=True, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                text=True, bufsize=1, env={**os.environ, "TERM": "dumb", "NO_COLOR": "1"})
        inicio = time.monotonic()
        assert proc.stdout
        for linea in proc.stdout:
            linea = ANSI.sub("", linea.rstrip("\n"))
            if filtro:
                linea = filtro(linea)
                if linea is None:
                    continue
            self.texto(linea + "\n", self._clase(linea))
            if time.monotonic() - inicio > timeout:
                proc.kill()
                break
        codigo = proc.wait()
        self.g.marcar(f"fin comando (código {codigo})")
        self._linea_prompt()
        return codigo

    def interactivo(self, comando: str, guion: list[tuple[str, str]], timeout: float = 20) -> None:
        """Ejecuta un comando interactivo (p. ej. ssh al honeypot) respondiendo según `guion`.

        guion = [(patrón esperado, respuesta), …]. Las respuestas se teclean visibles.
        """
        import pexpect

        self.teclear(comando)
        hijo = pexpect.spawn(comando, encoding="utf-8", timeout=timeout, dimensions=(40, 140), echo=False)
        for patron, respuesta in guion:
            try:
                hijo.expect(patron)
            except (pexpect.TIMEOUT, pexpect.EOF):
                break
            salida = ANSI.sub("", (hijo.before or "") + (hijo.after if isinstance(hijo.after, str) else ""))
            for l in salida.splitlines(keepends=True):
                self.texto(l, self._clase(l))
            for ch in respuesta:
                self.texto(ch, "c")
                time.sleep(0.07)
            self.texto("\n")
            hijo.sendline(respuesta)
            self.g.marcar(f"respuesta {respuesta[:20]}")
        with contextlib.suppress(Exception):
            hijo.expect(pexpect.EOF, timeout=5)
            resto = ANSI.sub("", hijo.before or "")
            for l in resto.splitlines(keepends=True):
                self.texto(l, self._clase(l))
        hijo.close(force=True)
        self._linea_prompt()
