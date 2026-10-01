import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API_BASE, fetchAuth, getEvidenceDownloadUrl, login } from "./api";

type Call = { url: string; init: RequestInit };

/** fetch simulado: devuelve las respuestas en orden y guarda cada llamada. */
function mockFetch(...responses: Array<{ status: number; body?: unknown }>) {
  const calls: Call[] = [];
  const queue = [...responses];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    const r = queue.shift() ?? { status: 200, body: {} };
    return new Response(r.body === undefined ? "" : JSON.stringify(r.body), { status: r.status });
  }));
  return calls;
}

const headersOf = (c: Call) => c.init.headers as Record<string, string>;

function clearCookies() {
  for (const c of document.cookie.split(";")) {
    const name = c.split("=")[0].trim();
    if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  }
}

beforeEach(clearCookies);
afterEach(clearCookies);

describe("cliente HTTP de la API", () => {
  it("usa el mismo origen que la consola cuando no hay VITE_API_BASE_URL", () => {
    expect(API_BASE).toBe(window.location.origin);
    expect(getEvidenceDownloadUrl(7)).toBe(`${window.location.origin}/api/evidence/7/download`);
  });

  it("envía las cookies de sesión y el token CSRF del double-submit", async () => {
    document.cookie = "otra_csrf_token=falsa";
    document.cookie = "csrf_token=abc123";
    const calls = mockFetch({ status: 200, body: { ok: true } });
    await expect(fetchAuth("/api/runbooks", { method: "POST", body: "{}" })).resolves.toEqual({ ok: true });
    expect(calls[0].init.credentials).toBe("include");
    expect(headersOf(calls[0])["X-CSRF-Token"]).toBe("abc123");
    expect(headersOf(calls[0])["Content-Type"]).toBe("application/json");
  });

  it("no inventa cabecera CSRF si no hay cookie", async () => {
    const calls = mockFetch({ status: 200, body: [] });
    await fetchAuth("/api/tickets");
    expect(headersOf(calls[0])).not.toHaveProperty("X-CSRF-Token");
  });

  it("con 401 renueva la sesión una vez y repite la petición", async () => {
    const calls = mockFetch({ status: 401 }, { status: 200 }, { status: 200, body: { open: 3 } });
    await expect(fetchAuth("/api/tickets/count/open")).resolves.toEqual({ open: 3 });
    expect(calls.map((c) => new URL(c.url).pathname)).toEqual([
      "/api/tickets/count/open", "/api/auth/refresh", "/api/tickets/count/open",
    ]);
    expect(calls[1].init.method).toBe("POST");
  });

  it("si la renovación falla, propaga el 401 sin bucles", async () => {
    const calls = mockFetch({ status: 401, body: { detail: "expirada" } }, { status: 401 });
    await expect(fetchAuth("/api/users")).rejects.toThrow(/HTTP 401/);
    expect(calls).toHaveLength(2);
  });

  it("no reintenta si el 401 se repite tras renovar", async () => {
    const calls = mockFetch({ status: 401 }, { status: 200 }, { status: 401 });
    await expect(fetchAuth("/api/users")).rejects.toThrow(/HTTP 401/);
    expect(calls).toHaveLength(3);
  });

  it("varias peticiones caducadas a la vez comparten una sola renovación", async () => {
    let refreshes = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const seen = new Set<string>();
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const path = new URL(url).pathname;
      if (path === "/api/auth/refresh") { refreshes++; await gate; return new Response("", { status: 200 }); }
      if (!seen.has(path)) { seen.add(path); return new Response("", { status: 401 }); }
      return new Response(JSON.stringify({ path }), { status: 200 });
    }));
    const all = Promise.all([fetchAuth("/api/a"), fetchAuth("/api/b"), fetchAuth("/api/c")]);
    await vi.waitFor(() => expect(seen.size).toBe(3));
    release();
    await expect(all).resolves.toEqual([{ path: "/api/a" }, { path: "/api/b" }, { path: "/api/c" }]);
    expect(refreshes).toBe(1);
  });

  it("un login fallido no intenta renovar la sesión", async () => {
    const calls = mockFetch({ status: 401, body: { detail: "Credenciales inválidas" } });
    await expect(login("admin", "mala")).rejects.toThrow("HTTP 401: {\"detail\":\"Credenciales inválidas\"}");
    expect(calls).toHaveLength(1);
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ username: "admin", password: "mala" });
  });
});
