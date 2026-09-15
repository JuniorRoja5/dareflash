/**
 * Qué texto de comentario vale (PURO). Es la misma regla en la caja y en el servidor.
 */
import { describe, expect, it } from "vitest";

import { COMENTARIO_TEXTO_MAX } from "../src/config/constants";
import { limpiarComentario } from "../src/lib/comentarios";

describe("limpiarComentario", () => {
  it("recorta los espacios de los bordes", () => {
    expect(limpiarComentario("  ¡Brutal!  ")).toBe("¡Brutal!");
  });

  it("vacío o solo espacios no vale", () => {
    expect(limpiarComentario("")).toBeNull();
    expect(limpiarComentario("   \n  ")).toBeNull();
  });

  it("el tope es inclusivo: justo en el tope vale, uno más no", () => {
    expect(limpiarComentario("x".repeat(COMENTARIO_TEXTO_MAX))).toHaveLength(COMENTARIO_TEXTO_MAX);
    expect(limpiarComentario("x".repeat(COMENTARIO_TEXTO_MAX + 1))).toBeNull();
    // Los espacios de los bordes no cuentan para el tope.
    expect(limpiarComentario(`  ${"x".repeat(COMENTARIO_TEXTO_MAX)}  `)).not.toBeNull();
  });
});
