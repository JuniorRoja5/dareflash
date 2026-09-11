/**
 * El GATE del proxy sobre /crear. Con cookie de sesión, /crear PASA —el servidor nunca manda a un
 * usuario logueado al login—; sin ella, a /entrar con la vuelta. Y /entrar NUNCA pasa por el proxy: el
 * redirect del login tiene que terminar ahí, no rebotar sobre sí mismo.
 *
 * Ojo: el re-login fantasma de producción NO salía de aquí; el servidor ya dejaba pasar a quien traía
 * la cookie. Salía del router de cliente, que guardaba este redirect pre-cargado como invitado (lo fija
 * tests/render/formulario-login.test.tsx). Esto fija la otra mitad, la del servidor.
 */
import { getRedirectUrl, unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { SESSION_COOKIE } from "../src/config/constants";
import { config, proxy } from "../src/proxy";

const BASE = "https://dareflash.com";

function peticion(
  ruta: string,
  { sesion = false, cabeceras = {} }: { sesion?: boolean; cabeceras?: Record<string, string> } = {},
): NextRequest {
  const headers = new Headers(cabeceras);
  if (sesion) headers.set("cookie", `${SESSION_COOKIE}=token-de-prueba`);
  return new NextRequest(`${BASE}${ruta}`, { headers });
}

describe("gate de /crear", () => {
  it("CON sesión, /crear pasa: ni redirect ni login", () => {
    const res = proxy(peticion("/crear", { sesion: true }));
    expect(getRedirectUrl(res)).toBeNull();
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("también en las peticiones del router (navegación RSC y prefetch)", () => {
    const variantes: Record<string, string>[] = [
      { RSC: "1" },
      { RSC: "1", "Next-Router-Prefetch": "1" },
    ];
    for (const cabeceras of variantes) {
      const res = proxy(peticion("/crear?_rsc=abc", { sesion: true, cabeceras }));
      expect(getRedirectUrl(res)).toBeNull();
    }
  });

  it("SIN sesión, /crear -> /entrar con la ruta de vuelta (query incluida)", () => {
    const res = proxy(peticion("/crear?desde=barra"));
    expect(res.status).toBe(307);
    expect(getRedirectUrl(res)).toBe(`${BASE}/entrar?siguiente=%2Fcrear%3Fdesde%3Dbarra`);
  });
});

describe("el redirect del login termina", () => {
  it("/entrar no pasa por el proxy: nada puede devolverlo a sí mismo", () => {
    for (const url of ["/entrar", "/entrar?siguiente=%2Fcrear"]) {
      expect(unstable_doesMiddlewareMatch({ config, url })).toBe(false);
    }
  });

  it("/crear sí pasa: sin el gate, el invitado llegaría a una pantalla que no puede usar", () => {
    expect(unstable_doesMiddlewareMatch({ config, url: "/crear" })).toBe(true);
    expect(unstable_doesMiddlewareMatch({ config, url: "/crear/algo" })).toBe(true);
  });
});
