/**
 * TopRanking — conmutador PURO con dientes (Paso C · unidad 4). Cada pestaña devuelve SU lista;
 * romper el mapeo (ignorar la clave) cae en rojo. El oro del podio ya lo garantiza `tokenPuesto`
 * (via la primitiva `FilaPuesto`), asi que aqui no hay snapshots vacios.
 */
import { describe, expect, it } from "vitest";

import {
  listaRanking,
  medallaPuesto,
  ordenPodio,
  paginar,
  puntosNivel,
  RANKING_MENSUAL,
  RANKING_RETO,
} from "../src/app/(app)/(shell)/ranking/ranking-datos";

describe("listaRanking", () => {
  it("cada pestaña devuelve SU lista (los dos sentidos)", () => {
    expect(listaRanking("mensual")).toBe(RANKING_MENSUAL);
    expect(listaRanking("reto")).toBe(RANKING_RETO);
  });

  it("las dos listas son distintas: el conmutador cambia de verdad", () => {
    expect(RANKING_MENSUAL[0]?.username).not.toBe(RANKING_RETO[0]?.username);
  });
});

describe("medallaPuesto (color por puesto del podio)", () => {
  it("1 -> oro, 2 -> plata, 3 -> bronce", () => {
    expect(medallaPuesto(1)).toBe("rank");
    expect(medallaPuesto(2)).toBe("silver");
    expect(medallaPuesto(3)).toBe("bronze");
  });

  it("fuera del podio (4+, 0, no entero) no lleva medalla", () => {
    expect(medallaPuesto(4)).toBeNull();
    expect(medallaPuesto(0)).toBeNull();
    expect(medallaPuesto(1.5)).toBeNull();
  });
});

describe("puntosNivel (el nivel sale de los globales, no de la vista)", () => {
  it("devuelve los puntos globales de la fila, no los mostrados", () => {
    expect(puntosNivel({ username: "x", puntos: 3180, puntosGlobales: 320 })).toBe(320);
  });
});

describe("ordenPodio (2 · 1 · 3)", () => {
  it("coloca [1,2,3] como [2,1,3] (2 izq, 1 centro, 3 der)", () => {
    expect(ordenPodio(["a", "b", "c"])).toEqual(["b", "a", "c"]);
  });
});

describe("paginar", () => {
  const lista = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  it("devuelve la porcion de la pagina (base 1)", () => {
    expect(paginar(lista, 1, 10)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(paginar(lista, 2, 10)).toEqual([11, 12]);
  });

  it("una pagina fuera de rango devuelve lista vacia", () => {
    expect(paginar(lista, 3, 10)).toEqual([]);
  });
});
