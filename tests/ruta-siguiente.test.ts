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
