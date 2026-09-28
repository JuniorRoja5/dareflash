/**
 * EL CURSOR DEL HISTORIAL DE REFERIDOS — pieza PURA, sin base de datos.
 *
 * Lo que se fija: ida y vuelta exacta; y que un cursor manipulado devuelva `null` (primera página)
 * en vez de reventar la consulta o colar algo en ella. La tupla lleva el ALTA y el ID: sin el id,
 * dos invitados registrados en el mismo milisegundo no tienen orden y la paginación los repite o se
 * los salta.
 *
 * Para romperlo: quitar el `id` del cursor (rojo en la ida y vuelta), o aceptar cualquier cadena
 * (rojo en los manipulados).
 */
import { describe, expect, it } from "vitest";

import { codificarCursorReferidos, decodificarCursorReferidos } from "../src/lib/cursor-referidos";

describe("ida y vuelta", () => {
  it("conserva el instante y el id", () => {
    const p = { altaMs: Date.UTC(2026, 8, 28, 10, 30, 0, 123), id: "cmabc123" };
    expect(decodificarCursorReferidos(codificarCursorReferidos(p))).toEqual(p);
  });

  it("el id viaja SIEMPRE: es lo que desempata dos altas del mismo milisegundo", () => {
    const ms = 1_790_000_000_000;
    const a = codificarCursorReferidos({ altaMs: ms, id: "aaa" });
    const b = codificarCursorReferidos({ altaMs: ms, id: "bbb" });
    expect(a).not.toBe(b);
    expect(decodificarCursorReferidos(a)?.id).toBe("aaa");
    expect(decodificarCursorReferidos(b)?.id).toBe("bbb");
  });
});

describe("lo que llega por la URL", () => {
  it("manipulado, vacío o con otra forma -> primera página, nunca una excepción", () => {
    for (const crudo of [
      null,
      undefined,
      "",
      "1790000000000",
      ".abc",
      "1790000000000.",
      "abc.1790000000000",
      "-1.abc",
      "1790000000000.abc def",
      "1790000000000.'; DROP TABLE",
      `${"9".repeat(20)}.abc`,
      `1790000000000.${"x".repeat(80)}`,
    ]) {
      expect(decodificarCursorReferidos(crudo), String(crudo)).toBeNull();
    }
  });

  it("un cursor válido sí pasa (para que el rechazo signifique algo)", () => {
    expect(decodificarCursorReferidos("1790000000000.cmabc_123-x")).toEqual({
      altaMs: 1_790_000_000_000,
      id: "cmabc_123-x",
    });
  });
});
