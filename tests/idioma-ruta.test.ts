/**
 * EL IDIOMA EN LA URL (Fase 11 · P5a) — la parte pura: separar el prefijo, poner el del idioma en un
 * enlace (idempotente, sin tocar lo externo ni lo que no lleva idioma) y la canónica con su `hreflang`.
 *
 * Para romperlo: comparar el prefijo sin mirar el segmento (rojo `/destacados` ≠ `/de`), prefijar dos
 * veces (rojo idempotencia), prefijar el panel o la API (rojo), o meter en el `hreflang` un idioma no
 * publicado (rojo).
 */
import { describe, expect, it } from "vitest";

import {
  alternativasDeIdioma,
  esRutaSinIdioma,
  ruta,
  rutaSinIdioma,
  separarIdioma,
} from "../src/lib/idioma-ruta";

describe("separarIdioma", () => {
  it.each([
    ["/feed", null, "/feed"],
    ["/en/feed", "en", "/feed"],
    ["/de/retos/abc-x", "de", "/retos/abc-x"],
    ["/es/feed", "es", "/feed"],
    ["/en", "en", "/"],
    ["/en/", "en", "/"],
    ["/en?x=1", "en", "/?x=1"],
    ["/", null, "/"],
    // por SEGMENTO: ninguno de estos es un prefijo de idioma
    ["/destacados", null, "/destacados"],
    ["/entrar", null, "/entrar"],
    ["/esto", null, "/esto"],
    ["/fr/feed", null, "/fr/feed"],
  ])("%s → prefijo %s, resto %s", (entrada, prefijo, resto) => {
    expect(separarIdioma(entrada)).toEqual({ prefijo, resto });
    expect(rutaSinIdioma(entrada)).toBe(resto);
  });
});

describe("ruta(idioma, href)", () => {
  it("en castellano no toca nada", () => {
    for (const h of ["/", "/retos", "/retos?x=1", "/entrar?siguiente=%2Fcrear"]) {
      expect(ruta("es", h)).toBe(h);
    }
  });

  it("en otro idioma pone su prefijo, también a la raíz, la query y el ancla", () => {
    expect(ruta("en", "/retos")).toBe("/en/retos");
    expect(ruta("de", "/u/ana.b")).toBe("/de/u/ana.b");
    expect(ruta("en", "/")).toBe("/en");
    expect(ruta("en", "/?x=1")).toBe("/en?x=1");
    expect(ruta("en", "/entrar?siguiente=%2Fcrear")).toBe("/en/entrar?siguiente=%2Fcrear");
    expect(ruta("en", "/destacados")).toBe("/en/destacados");
  });

  it("es idempotente: lo que ya trae prefijo sale igual (nunca /en/en/…)", () => {
    expect(ruta("en", "/en/retos")).toBe("/en/retos");
    expect(ruta("en", ruta("en", "/retos"))).toBe("/en/retos");
    expect(ruta("es", "/en/retos")).toBe("/en/retos");
    expect(ruta("de", "/en/retos")).toBe("/en/retos");
  });

  it("no toca lo que no lleva idioma: panel, API, /ir", () => {
    for (const h of ["/panel", "/panel/retos", "/api/auth/csrf", "/ir?a=1", "/ir/x"]) {
      expect(ruta("en", h), h).toBe(h);
      expect(esRutaSinIdioma(h.split("?")[0]!), h).toBe(true);
    }
    // por segmento: /panelito o /irlanda serían páginas normales
    expect(ruta("en", "/irlanda")).toBe("/en/irlanda");
  });

  it("no toca lo que no es una ruta interna", () => {
    for (const h of [
      "https://otro.example/x",
      "//otro.example",
      "mailto:a@b.c",
      "#arriba",
      "?pagina=2",
    ]) {
      expect(ruta("en", h), h).toBe(h);
    }
  });
});

describe("alternativasDeIdioma: canónica y hreflang", () => {
  const BASE = "https://plataforma.test/";

  it("con solo «es» publicado: la canónica, «es» y x-default (la raíz)", () => {
    expect(alternativasDeIdioma(BASE, "es", "/retos/abc-x", ["es"])).toEqual({
      canonical: "https://plataforma.test/retos/abc-x",
      languages: {
        es: "https://plataforma.test/retos/abc-x",
        "x-default": "https://plataforma.test/retos/abc-x",
      },
    });
  });

  it("con los tres publicados: cada uno con su prefijo, y la canónica es la del idioma que se mira", () => {
    const a = alternativasDeIdioma(BASE, "en", "/feed", ["es", "en", "de"]);
    expect(a.canonical).toBe("https://plataforma.test/en/feed");
    expect(a.languages).toEqual({
      es: "https://plataforma.test/feed",
      en: "https://plataforma.test/en/feed",
      de: "https://plataforma.test/de/feed",
      "x-default": "https://plataforma.test/feed",
    });
  });

  it("un idioma NO publicado no sale en el hreflang", () => {
    expect(Object.keys(alternativasDeIdioma(BASE, "es", "/feed", ["es"]).languages)).toEqual([
      "es",
      "x-default",
    ]);
  });
});
