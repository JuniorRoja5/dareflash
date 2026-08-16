/**
 * Cliente HTTP del navegador (helpers postJson/*Csrf), con DIENTES:
 *   - postJson NO manda CSRF; postJsonCsrf pide el token a /api/auth/csrf y lo manda en X-CSRF-Token.
 *   - forma de retorno uniforme { ok, status, code, data }; `code` sale de `error.code`.
 *   - un fallo de PARSEO del cuerpo -> data {} (no revienta).
 *   - un error de RED (fetch rechaza) se PROPAGA (lo captura cada form con su copy).
 *   - sin sesion en el paso CSRF (401) -> lanza SIN_SESION.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { delCsrf, patchJsonCsrf, postJson, postJsonCsrf } from "../src/lib/cliente-http";

type Handler = (url: string, init?: RequestInit) => Promise<unknown>;

function mockFetch(handler: Handler): void {
  global.fetch = vi.fn((url: string | URL | Request, init?: RequestInit) =>
    handler(String(url), init),
  ) as unknown as typeof fetch;
}

function res(status: number, body: unknown, parsea = true): unknown {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (!parsea) throw new Error("cuerpo no-JSON");
      return body;
    },
  };
}

/** Devuelve el `init` de la n-esima llamada a fetch. */
function initDe(n: number): RequestInit {
  const calls = (global.fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock
    .calls;
  return calls[n]![1];
}
function cab(init: RequestInit): Record<string, string> {
  return (init.headers ?? {}) as Record<string, string>;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("cliente-http", () => {
  it("postJson: POST JSON SIN CSRF; forma de retorno uniforme", async () => {
    mockFetch(async () => res(200, { hello: "world" }));
    const r = await postJson("/api/x", { a: 1 });
    expect(r).toEqual({ ok: true, status: 200, code: "", data: { hello: "world" } });
    const init = initDe(0);
    expect(init.method).toBe("POST");
    expect(cab(init)["Content-Type"]).toBe("application/json");
    expect(cab(init)["X-CSRF-Token"]).toBeUndefined(); // NO manda CSRF
    expect(JSON.parse(init.body as string)).toEqual({ a: 1 });
  });

  it("postJsonCsrf: pide el token a /api/auth/csrf y lo manda en X-CSRF-Token", async () => {
    const urls: string[] = [];
    mockFetch(async (url) => {
      urls.push(url);
      if (url === "/api/auth/csrf") return res(200, { csrfToken: "T0K3N" });
      return res(403, { error: { code: "NOPE" } });
    });
    const r = await postJsonCsrf("/api/y", { b: 2 });
    expect(urls).toEqual(["/api/auth/csrf", "/api/y"]);
    expect(cab(initDe(1))["X-CSRF-Token"]).toBe("T0K3N");
    expect(r).toMatchObject({ ok: false, status: 403, code: "NOPE" });
  });

  it("patchJsonCsrf: metodo PATCH con el token", async () => {
    mockFetch(async (url) =>
      url === "/api/auth/csrf" ? res(200, { csrfToken: "T" }) : res(200, { ok: true }),
    );
    await patchJsonCsrf("/api/perfil", { displayName: "Ana" });
    expect(initDe(1).method).toBe("PATCH");
    expect(cab(initDe(1))["X-CSRF-Token"]).toBe("T");
  });

  it("`code` se extrae de error.code; parseo fallido -> data {} sin reventar", async () => {
    mockFetch(async () => res(400, { error: { code: "VALIDATION" } }));
    expect((await postJson("/api/z", {})).code).toBe("VALIDATION");

    mockFetch(async () => res(200, undefined, false)); // json() lanza
    const r = await postJson("/api/z", {});
    expect(r.data).toEqual({});
    expect(r.ok).toBe(true);
  });

  it("error de RED (fetch rechaza) se PROPAGA", async () => {
    mockFetch(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(postJson("/api/z", {})).rejects.toThrow();
  });

  it("sin sesion en el paso CSRF (401) -> lanza SIN_SESION antes de la mutacion", async () => {
    const urls: string[] = [];
    mockFetch(async (url) => {
      urls.push(url);
      return res(401, {}); // /api/auth/csrf devuelve 401
    });
    await expect(delCsrf("/api/videos/1")).rejects.toThrow("SIN_SESION");
    expect(urls).toEqual(["/api/auth/csrf"]); // NO se llego a llamar al DELETE
  });
});
