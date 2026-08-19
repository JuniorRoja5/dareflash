/**
 * Slug cosmético de reto (M2). PURO. Con dientes: normaliza acentos, minúsculas, no-alfanumérico -> "-",
 * colapsa/recorta guiones, acota longitud.
 */
import { describe, expect, it } from "vitest";

import { slugDesdeTitulo, SLUG_MAX } from "../src/lib/reto-slug";

describe("slugDesdeTitulo", () => {
  it("minúsculas, sin acentos, espacios y símbolos -> guion, sin guiones en extremos", () => {
    expect(slugDesdeTitulo("Tu mejor salto (box jump)")).toBe("tu-mejor-salto-box-jump");
    expect(slugDesdeTitulo("Coreografía del reto")).toBe("coreografia-del-reto");
    expect(slugDesdeTitulo("  ¡Hola, Mundo!  ")).toBe("hola-mundo");
  });

  it("colapsa guiones consecutivos", () => {
    expect(slugDesdeTitulo("a---b   c")).toBe("a-b-c");
  });

  it("acota a SLUG_MAX y no deja guion final tras el corte", () => {
    const largo = slugDesdeTitulo("palabra ".repeat(30));
    expect(largo.length).toBeLessThanOrEqual(SLUG_MAX);
    expect(largo.endsWith("-")).toBe(false);
  });

  it("título sin caracteres válidos -> cadena vacía (el que llama decide el fallback)", () => {
    expect(slugDesdeTitulo("🏋️🎭")).toBe("");
  });
});
