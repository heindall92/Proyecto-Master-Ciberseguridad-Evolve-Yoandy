import DOMPurify from "dompurify";

/**
 * Caracteres invisibles que permiten suplantar contenido en texto plano: controles C0/C1
 * (salvo tabulador y saltos de línea) y los de reordenación bidireccional (U+202A–U+202E,
 * U+2066–U+2069), con los que `factura‮fdp.exe` se ve como «facturaexe.pdf» (CVE-2021-42574,
 * «Trojan Source»).
 */
// eslint-disable-next-line no-control-regex
const UNSAFE_INVISIBLES = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F‪-‮⁦-⁩]/g;

/**
 * Texto plano para pintar como nodo de texto de React (chat, notas, descripciones).
 *
 * React ya escapa el texto, así que aquí no se quita HTML: hacerlo con DOMPurify mutilaba
 * mensajes legítimos («1 < 2» salía como «1 &lt; 2» y `if (a<b && c>d)` como `if (ad)`),
 * justo lo que un analista pega en el chat: comandos, payloads e IOC. Solo se eliminan los
 * caracteres invisibles que sirven para engañar a quien lee.
 *
 * Nunca usar el resultado con innerHTML / dangerouslySetInnerHTML: para eso, `sanitizeRichHtml`.
 */
export function sanitizePlainText(value: string): string {
  return value.replace(UNSAFE_INVISIBLES, "");
}

/** HTML limitado para contenido enriquecido controlado (lo único que puede ir a innerHTML). */
export function sanitizeRichHtml(value: string): string {
  return DOMPurify.sanitize(value, {
    ALLOWED_TAGS: ["b", "i", "em", "strong", "br", "p", "ul", "ol", "li", "code"],
    ALLOWED_ATTR: [],
  });
}
