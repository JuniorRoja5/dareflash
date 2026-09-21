/**
 * EL CURSOR DE LA COLA DE MODERACIÓN (puro). Lleva la TUPLA de orden completa —denunciantes y id—
 * porque la cola se ordena por un recuento que CAMBIA mientras se revisa: con un OFFSET, una denuncia
 * nueva desplazaría la ventana y la página siguiente se saltaría objetos o repetiría otros.
 *
 * Y se revalida al volver: viaja al cliente, así que un cursor manipulado tiene que caer en "primera
 * página", nunca reventar la consulta.
 */
import { describe, expect, it } from "vitest";

import { codificarCursorCola, decodificarCursorCola } from "../src/lib/cursor-cola";

describe("cursor de la cola", () => {
  it("ida y vuelta: lo que se codifica se recupera igual", () => {
    for (const p of [
      { denunciantes: 3, targetId: "cmabc123" },
      { denunciantes: 0, targetId: "x" },
      { denunciantes: 999999, targetId: "a-b_c" },
    ]) {
      expect(decodificarCursorCola(codificarCursorCola(p))).toEqual(p);
    }
  });

  it("sin cursor: primera página", () => {
    expect(decodificarCursorCola(null)).toBeNull();
    expect(decodificarCursorCola(undefined)).toBeNull();
    expect(decodificarCursorCola("")).toBeNull();
  });

  it("un cursor manipulado no rompe nada: cae en primera página", () => {
    for (const raw of [
      "3",
      ".abc",
      "3.",
      "-1.abc",
      "3.5.abc",
      "abc.3",
      "3.abc; DROP TABLE Report",
      "3.'abc'",
      `3.${"x".repeat(80)}`,
      "99999999999999999999.abc",
    ]) {
      expect(decodificarCursorCola(raw), raw).toBeNull();
    }
  });

  it("el recuento vuelve como NÚMERO, no como texto (el SQL compara números)", () => {
    const p = decodificarCursorCola("12.abc");
    expect(p?.denunciantes).toBe(12);
    expect(typeof p?.denunciantes).toBe("number");
  });
});
