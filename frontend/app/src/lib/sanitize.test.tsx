import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { sanitizePlainText, sanitizeRichHtml } from "./sanitize";

/** Cargas XSS clásicas. */
const PAYLOADS = [
  "<script>alert(1)</script>",
  '<img src=x onerror="alert(1)">',
  '<svg onload="alert(1)"></svg>',
  '<a href="javascript:alert(1)">pulsa</a>',
  '<iframe src="https://evil.example"></iframe>',
  '<p style="background:url(javascript:alert(1))">x</p>',
];

describe("sanitizePlainText (texto que se pinta como nodo de texto: chat, notas)", () => {
  it.each(PAYLOADS)("un payload se muestra literal y no crea elementos: %s", (payload) => {
    const { container } = render(<div>{sanitizePlainText(payload)}</div>);
    expect(container.firstElementChild!.children).toHaveLength(0);
    expect(container.textContent).toBe(payload);
  });

  it("no mutila comandos ni IOC que el analista pega en el chat", () => {
    for (const text of ["1 < 2", "if (a<b && c>d) exit", "cat < /etc/passwd > /tmp/x", "<3 gracias", "&lt;ya escapado&gt;", "ataque desde 1.2.3.4 & 5.6.7.8"]) {
      expect(sanitizePlainText(text)).toBe(text);
    }
  });

  it("elimina la reordenación bidi que disfraza extensiones (Trojan Source)", () => {
    expect(sanitizePlainText("factura‮fdp.exe")).toBe("facturafdp.exe");
    expect(sanitizePlainText("a⁦b⁩c‪d")).toBe("abcd");
  });

  it("elimina caracteres de control pero respeta saltos de línea, tabuladores y emojis", () => {
    expect(sanitizePlainText("ok\u0000\u0007\u001B[31m\u007F")).toBe("ok[31m");
    expect(sanitizePlainText("línea 1\nlínea 2\r\n\tfin 🛡️ ✔")).toBe("línea 1\nlínea 2\r\n\tfin 🛡️ ✔");
  });
});

describe("sanitizeRichHtml (lo único que puede ir a innerHTML)", () => {
  it("mantiene el formato permitido", () => {
    expect(sanitizeRichHtml("<p><strong>Crítico</strong><br><code>nmap -sV</code></p>"))
      .toBe("<p><strong>Crítico</strong><br><code>nmap -sV</code></p>");
  });

  it.each(PAYLOADS)("elimina scripts, manejadores y enlaces: %s", (payload) => {
    const out = sanitizeRichHtml(payload);
    expect(out).not.toMatch(/<(script|img|svg|a|iframe)\b/i);
    expect(out).not.toMatch(/onerror|onload|javascript:|style=/i);
  });

  it("quita cualquier atributo de las etiquetas permitidas", () => {
    expect(sanitizeRichHtml('<b class="x" onclick="alert(1)">hola</b>')).toBe("<b>hola</b>");
  });
});
