/**
 * EL PROXY Y EL IDIOMA (Fase 11 · P5a). Fija:
 *  1. TODAS las URL de hoy (cada `page.tsx` fuera del panel, sacadas del árbol de `src/app`, no de una
 *     lista a mano) pasan por el proxy, NO se redirigen y llegan a la página en castellano con su ruta
 *     (`x-df-ruta`), que es de lo que salen la canónica y el `hreflang`.
 *  2. `/es/…` → 308 a la misma ruta sin prefijo, con su query.
 *  3. Con `en`/`de` sin publicar, su prefijo da 404; y con prefijo, el panel, la API y `/ir`, 404 siempre.
 *  4. Las cabeceras `x-df-idioma` / `x-df-ruta` que manda el CLIENTE no llegan nunca: el proxy las pisa.
 *  5. Con un idioma publicado (simulado), `/en/…` se reescribe a la ruta de siempre con `x-df-idioma: en`,
 *     y lo de hoy se conserva con prefijo: la raíz por dispositivo y el gate de `/crear`.
 *
 * Para romperlo: redirigir una URL de hoy o cambiarle el idioma (rojo 1), quitar el 308 (rojo 2), dejar
 * pasar un idioma no publicado (rojo 3), no pisar la cabecera del cliente (rojo 4), o sacar una página
 * del matcher (rojo 1: se queda sin canónica).
 */
import { readdirSync, statSync } from "node:fs";
import path from "node:path";

import { getRedirectUrl, unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({ publicados: ["es"] as string[] }));
vi.mock("@/config/constants", async (original) => ({
  ...(await original<typeof import("../src/config/constants")>()),
  get IDIOMAS_PUBLICADOS() {
    return H.publicados;
  },
}));

import { SESSION_COOKIE } from "../src/config/constants";
import { config, proxy } from "../src/proxy";

const BASE = "https://plataforma.test";
const ESCRITORIO =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150 Safari/537.36";

function peticion(ruta: string, cabeceras: Record<string, string> = {}): NextRequest {
  return new NextRequest(`${BASE}${ruta}`, {
    headers: new Headers({ "user-agent": ESCRITORIO, ...cabeceras }),
  });
}

/** Lo que la página recibe: las cabeceras de la petición que el proxy sobrescribe. */
function aLaPagina(res: Response): {
  idioma: string | null;
  ruta: string | null;
  reescrita: string | null;
} {
  return {
    idioma: res.headers.get("x-middleware-request-x-df-idioma"),
    ruta: res.headers.get("x-middleware-request-x-df-ruta"),
    reescrita: res.headers.get("x-middleware-rewrite"),
  };
}

/** Las URL de HOY: cada page.tsx fuera del panel, con los segmentos dinámicos rellenos. */
function urlsDeHoy(): string[] {
  const raiz = path.join(process.cwd(), "src", "app");
  const fuera = new Set(["panel", "api"]);
  const urls: string[] = [];
  const recorrer = (dir: string, segs: string[]) => {
    for (const n of readdirSync(dir)) {
      const p = path.join(dir, n);
      if (statSync(p).isDirectory()) {
        if (segs.length === 0 && fuera.has(n)) continue;
        const seg = /^\(.*\)$/.test(n) ? null : /^\[.*\]$/.test(n) ? "muestra-1" : n;
        recorrer(p, seg === null ? segs : [...segs, seg]);
      } else if (n === "page.tsx") {
        urls.push(`/${segs.join("/")}`);
      }
    }
  };
  recorrer(raiz, []);
  return urls.sort();
}

beforeEach(() => {
  H.publicados = ["es"];
});

describe("1 · las URL de hoy responden igual, en castellano", () => {
  const urls = urlsDeHoy();

  it("el censo encuentra las páginas (si no, no probaría nada)", () => {
    expect(urls.length).toBeGreaterThanOrEqual(30);
    expect(urls).toContain("/feed");
    expect(urls).toContain("/retos/muestra-1");
  });

  it.each(urls)("%s: pasa por el proxy, sin redirección, en «es» y con su ruta", (url) => {
    expect(unstable_doesMiddlewareMatch({ config, url }), "fuera del matcher: sin canónica").toBe(
      true,
    );
    // `/crear` sin sesión ya redirigía antes de la P5a (el gate): se mira con sesión.
    const res = proxy(peticion(url, { cookie: `${SESSION_COOKIE}=token-de-prueba` }));
    expect(getRedirectUrl(res)).toBeNull();
    expect(res.status).toBe(200);
    expect(aLaPagina(res)).toEqual({ idioma: "es", ruta: url, reescrita: null });
  });

  it("con query, la ruta que llega no la lleva (la canónica va sin query)", () => {
    expect(aLaPagina(proxy(peticion("/retos?categoria=fitness"))).ruta).toBe("/retos");
  });

  it("la raíz / sigue repartiendo por dispositivo, como antes", () => {
    expect(getRedirectUrl(proxy(peticion("/")))).toBe(`${BASE}/inicio`);
  });
});

describe("2 · /es/… es la misma página: 308 a la ruta sin prefijo", () => {
  it.each([
    ["/es/feed", "/feed"],
    ["/es/retos/abc-x?tab=hoy", "/retos/abc-x?tab=hoy"],
    ["/es", "/"],
  ])("%s → 308 %s", (desde, hasta) => {
    const res = proxy(peticion(desde));
    expect(res.status).toBe(308);
    expect(getRedirectUrl(res)).toBe(`${BASE}${hasta}`);
  });
});

describe("3 · lo no publicado y lo que no lleva idioma: 404", () => {
  const es404 = (res: Response) =>
    res.status === 200 && aLaPagina(res).reescrita === `${BASE}/_no-existe`;

  it.each(["/en/feed", "/en", "/de/inicio", "/de/retos/abc-x"])(
    "%s con solo «es» publicado → 404",
    (url) => {
      expect(es404(proxy(peticion(url)))).toBe(true);
    },
  );

  it.each([
    "/en/panel",
    "/en/panel/retos",
    "/en/api/auth/csrf",
    "/en/ir?a=1",
    "/de/ir",
    "/de/panel",
  ])("%s → 404 aunque el idioma estuviera publicado", (url) => {
    H.publicados = ["es", "en", "de"];
    expect(unstable_doesMiddlewareMatch({ config, url })).toBe(true);
    expect(es404(proxy(peticion(url)))).toBe(true);
  });

  it("el panel, la API y /ir sin prefijo ni pasan por el proxy (no cambian)", () => {
    for (const url of ["/panel", "/panel/retos", "/api/auth/csrf", "/ir?a=1"]) {
      expect(unstable_doesMiddlewareMatch({ config, url }), url).toBe(false);
    }
  });
});

describe("4 · las cabeceras del cliente no llegan nunca", () => {
  it.each(["/feed", "/retos/abc-x"])(
    "%s con x-df-idioma/x-df-ruta falsas → las del proxy",
    (url) => {
      const res = proxy(peticion(url, { "x-df-idioma": "en", "x-df-ruta": "/panel" }));
      expect(aLaPagina(res)).toMatchObject({ idioma: "es", ruta: url });
    },
  );

  it("también en un 404 de idioma", () => {
    const res = proxy(peticion("/en/feed", { "x-df-idioma": "en" }));
    expect(aLaPagina(res).idioma).toBe("es");
  });
});

describe("5 · con un idioma publicado (simulado)", () => {
  beforeEach(() => {
    H.publicados = ["es", "en"];
  });

  it("/en/retos/abc-x → reescrita a /retos/abc-x, en «en», con la query intacta", () => {
    const res = proxy(peticion("/en/retos/abc-x?tab=hoy", { "x-df-idioma": "de" }));
    expect(getRedirectUrl(res)).toBeNull();
    expect(aLaPagina(res)).toEqual({
      idioma: "en",
      ruta: "/retos/abc-x",
      reescrita: `${BASE}/retos/abc-x?tab=hoy`,
    });
  });

  it("/en → la portada en inglés (por dispositivo)", () => {
    expect(getRedirectUrl(proxy(peticion("/en")))).toBe(`${BASE}/en/inicio`);
  });

  it("/en/crear sin sesión → /en/entrar con la vuelta /en/crear", () => {
    expect(getRedirectUrl(proxy(peticion("/en/crear?x=1")))).toBe(
      `${BASE}/en/entrar?siguiente=%2Fen%2Fcrear%3Fx%3D1`,
    );
  });

  it("/de sigue sin publicar: 404", () => {
    expect(aLaPagina(proxy(peticion("/de/feed"))).reescrita).toBe(`${BASE}/_no-existe`);
  });
});
