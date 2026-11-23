import { describe, expect, it } from "vitest";

import { esRutaLocalSegura, rutaSiguienteSegura } from "../src/lib/ruta-siguiente";

/**
 * Anti open-redirect del `?siguiente` del login. El valor viaja en la URL (no confiable):
 * si se aceptara una URL externa, un atacante mandaria al usuario ya autenticado a otro
 * dominio. Solo se acepta una ruta LOCAL. Vectores maliciosos incluidos abajo.
 */
describe("esRutaLocalSegura", () => {
  it("acepta rutas locales normales", () => {
    expect(esRutaLocalSegura("/perfil")).toBe(true);
    expect(esRutaLocalSegura("/crear")).toBe(true);
    expect(esRutaLocalSegura("/retos/abc?tab=hoy")).toBe(true);
  });

  it("rechaza URL externas y trucos de host (open-redirect)", () => {
    expect(esRutaLocalSegura("//evil.com")).toBe(false);
    expect(esRutaLocalSegura("/\\evil")).toBe(false);
    expect(esRutaLocalSegura("\\\\evil.com")).toBe(false);
    expect(esRutaLocalSegura("https://evil")).toBe(false);
    expect(esRutaLocalSegura("http://evil.com")).toBe(false);
    expect(esRutaLocalSegura("javascript:alert(1)")).toBe(false);
    expect(esRutaLocalSegura("/a://b")).toBe(false);
  });

  it("acepta las rutas con prefijo de idioma (Fase 11 · P5a): la vuelta conserva el idioma", () => {
    expect(esRutaLocalSegura("/en/crear")).toBe(true);
    expect(esRutaLocalSegura("/de/retos/abc?tab=hoy")).toBe(true);
    expect(esRutaLocalSegura("/en/entrar?siguiente=%2Fen%2Fcrear")).toBe(true);
  });

  it("rechaza también los destinos externos CON prefijo de idioma", () => {
    for (const raro of [
      "//evil.example",
      "//en/evil",
      "/en//evil.example",
      "/en/\\evil",
      "/en/a://b",
    ]) {
      expect(esRutaLocalSegura(raro), raro).toBe(raro === "/en//evil.example");
    }
  });

  // Hueco que existía hasta la P5a: el navegador QUITA tabuladores y saltos de línea antes de resolver
  // una URL, así que "/\t/evil.example" se convertía en "//evil.example". Comprobado con `new URL`, que
  // sigue la misma especificación (WHATWG) que el navegador.
  it("rechaza espacios, caracteres de control y la «\\» en cualquier sitio (el navegador los quita)", () => {
    for (const raro of [
      "/\t/evil.example",
      "/\n/evil.example",
      "/\r/evil.example",
      " //evil.example",
      "/ruta con espacio",
      "/a\u0000b",
      "/a\u007fb",
      "/en\\..\\evil",
    ]) {
      expect(esRutaLocalSegura(raro), JSON.stringify(raro)).toBe(false);
    }
    // y la prueba de que el riesgo era real: así resuelve el navegador lo que antes pasaba el filtro
    expect(new URL("/\t/evil.example", "https://plataforma.test/entrar").host).toBe("evil.example");
  });

  it("rechaza vacío, nulo y relativo sin barra", () => {
    expect(esRutaLocalSegura("")).toBe(false);
    expect(esRutaLocalSegura(null)).toBe(false);
    expect(esRutaLocalSegura(undefined)).toBe(false);
    expect(esRutaLocalSegura("perfil")).toBe(false);
  });
});

describe("rutaSiguienteSegura", () => {
  it("devuelve la ruta local segura tal cual", () => {
    expect(rutaSiguienteSegura("/crear")).toBe("/crear");
  });

  it("cae al fallback ('/' por defecto) cuando no es segura", () => {
    expect(rutaSiguienteSegura("//evil.com")).toBe("/");
    expect(rutaSiguienteSegura(null)).toBe("/");
    expect(rutaSiguienteSegura("https://evil", "/inicio")).toBe("/inicio");
  });
});
