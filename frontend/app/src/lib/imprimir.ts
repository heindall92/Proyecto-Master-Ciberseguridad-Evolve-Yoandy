/**
 * Imprime (o «Guardar como PDF») un documento de la consola.
 *
 * Los informes viven dentro de contenedores con scroll y altura fija: si se imprime la página tal
 * cual, el navegador corta en la primera pantalla o la deja en blanco. Por eso se copia el documento
 * ya pintado a un contenedor propio en <body> (#rc-print-host); las reglas @media print de
 * premium/reports.css ocultan el resto de la consola y aplican la paleta clara de impresión.
 */
export function imprimirDocumento(doc: HTMLElement | null, titulo?: string): void {
  if (!doc) return;
  document.getElementById("rc-print-host")?.remove();
  const host = document.createElement("div");
  host.id = "rc-print-host";
  host.appendChild(doc.cloneNode(true)); // copia del DOM ya pintado, sin re-interpretar HTML
  document.body.appendChild(host);
  document.body.classList.add("rc-printing");
  const prevTitle = document.title;
  if (titulo) document.title = titulo;
  const done = () => {
    document.body.classList.remove("rc-printing");
    host.remove();
    document.title = prevTitle;
    window.removeEventListener("afterprint", done);
  };
  window.addEventListener("afterprint", done);
  window.print();
}
