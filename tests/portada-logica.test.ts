/**
 * LA PORTADA (Fase 9 · P14) — lo puro: qué cifras se enseñan, el premio corto, el orden de la rejilla y
 * qué pieza de publicidad se pinta.
 *
 * Para romperlo a propósito: enseñar cifras sin retos abiertos (rojo); ordenar la rejilla solo por premio
 * (rojo el de «cierra pronto»); pintar la casa a un invitado (rojo el de la doble invitación).
 */
import { describe, expect, it } from "vitest";

import { REJILLA_CIERRE_PRONTO_MS } from "../src/config/constants";
import {
  cifrasVisibles,
  ordenarRejilla,
  pintarPiezaEnPortada,
  premioCorto,
} from "../src/lib/portada";

describe("las cifras del hero", () => {
  it("sin retos abiertos, NINGUNA (nada de «$0 en premios»)", () => {
    expect(cifrasVisibles({ categorias: 0, retosAbiertos: 0, premiosCents: 0 })).toEqual([]);
  });

  it("con retos: premios si suman algo, retos siempre, categorías solo si hay más de una", () => {
    expect(
      cifrasVisibles({ categorias: 3, retosAbiertos: 12, premiosCents: 840_000 }).map((c) => [
        c.clave,
        c.valor,
        c.etiqueta,
      ]),
    ).toEqual([
      ["premios", 840_000, "en premios ahora"],
      ["retos", 12, "retos abiertos"],
      ["categorias", 3, "categorías"],
    ]);
    expect(
      cifrasVisibles({ categorias: 1, retosAbiertos: 1, premiosCents: 0 }).map((c) => [
        c.clave,
        c.etiqueta,
      ]),
    ).toEqual([["retos", "reto abierto"]]);
  });

  it("el premio corto: entero bajo mil dólares, en miles desde mil (sin «.0»)", () => {
    expect(premioCorto(25_000)).toBe("$250");
    expect(premioCorto(840_000)).toBe("$8.4k");
    expect(premioCorto(1_200_000)).toBe("$12k");
    expect(premioCorto(0)).toBe("$0");
  });
});

describe("el orden de la rejilla", () => {
  const AHORA = 1_000_000_000_000;
  const r = (id: string, premio: number, horas: number) => ({
    id,
    premioCents: premio,
    deadlineMs: AHORA + horas * 3_600_000,
  });

  it("primero los que cierran pronto (por premio), después el resto (por premio)", () => {
    const pronto = REJILLA_CIERRE_PRONTO_MS / 3_600_000 - 1;
    const lejos = REJILLA_CIERRE_PRONTO_MS / 3_600_000 + 24;
    const retos = [
      r("a", 90_000, lejos),
      r("b", 10_000, pronto),
      r("c", 50_000, pronto),
      r("d", 99_000, lejos),
    ];
    expect(ordenarRejilla(retos, AHORA).map((x) => x.id)).toEqual(["c", "b", "d", "a"]);
  });

  it("empate de premio: el que cierra antes", () => {
    expect(ordenarRejilla([r("a", 5, 200), r("b", 5, 100)], AHORA).map((x) => x.id)).toEqual([
      "b",
      "a",
    ]);
  });
});

describe("qué pieza de publicidad pinta la portada (la doble invitación)", () => {
  it("una campaña, a todos; la casa, solo a una empresa", () => {
    expect(pintarPiezaEnPortada({ tipo: "campana" }, false)).toBe(true);
    expect(pintarPiezaEnPortada({ tipo: "campana" }, true)).toBe(true);
    expect(pintarPiezaEnPortada({ tipo: "casa" }, false)).toBe(false);
    expect(pintarPiezaEnPortada({ tipo: "casa" }, true)).toBe(true);
  });
});
