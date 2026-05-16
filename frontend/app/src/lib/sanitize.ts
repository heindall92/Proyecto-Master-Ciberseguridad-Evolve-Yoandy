import DOMPurify from "dompurify";

/** Texto plano sin HTML (chat, notas, descripciones). */
export function sanitizePlainText(value: string): string {
  return DOMPurify.sanitize(value, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
}

/** HTML limitado para contenido enriquecido controlado. */
export function sanitizeRichHtml(value: string): string {
  return DOMPurify.sanitize(value, {
    ALLOWED_TAGS: ["b", "i", "em", "strong", "br", "p", "ul", "ol", "li", "code"],
    ALLOWED_ATTR: [],
  });
}
