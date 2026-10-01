/**
 * Privacidad: la consola no debe pedir nada a terceros al cargarse (antes Google Fonts recibía
 * la IP y el navegador de cada analista). Las fuentes salen de los paquetes @fontsource.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const EXTERNAL = /(?:src|href)\s*=\s*["'](?:https?:)?\/\//i;

describe("sin recursos de terceros", () => {
  it("index.html no carga scripts, estilos ni fuentes de otros dominios", () => {
    const html = read("../index.html");
    expect(html).not.toMatch(EXTERNAL);
    expect(html).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
  });

  it("no hay scripts inline: la CSP del gateway mantiene script-src 'self'", () => {
    const html = read("../index.html");
    for (const tag of html.match(/<script\b[^>]*>/gi) ?? []) expect(tag).toMatch(/\ssrc=/);
  });

  it("las fuentes de la interfaz están autoalojadas", () => {
    const fonts = read("./fonts.ts");
    for (const family of ["rajdhani", "jetbrains-mono", "share-tech-mono"]) {
      expect(fonts).toContain(`@fontsource/${family}/`);
    }
    expect(read("./main.tsx")).toMatch(/^import "\.\/fonts";/m);
  });

  it("ningún CSS de la aplicación importa fuentes remotas", () => {
    const css = Object.values(import.meta.glob("./**/*.css", { query: "?raw", import: "default", eager: true })) as string[];
    expect(css.length).toBeGreaterThan(10);
    for (const sheet of css) expect(sheet).not.toMatch(/@import\s+url\(\s*["']?https?:|fonts\.googleapis/);
  });
});
