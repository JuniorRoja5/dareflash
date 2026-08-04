/**
 * TopRanking — conmutador PURO con dientes (Paso C · unidad 4). Cada pestaña devuelve SU lista;
 * romper el mapeo (ignorar la clave) cae en rojo. El oro del podio ya lo garantiza `tokenPuesto`
 * (via la primitiva `FilaPuesto`), asi que aqui no hay snapshots vacios.
 */
import { describe, expect, it } from "vitest";

import {
  listaRanking,
  RANKING_MENSUAL,
  RANKING_RETO,
} from "../src/app/(app)/ranking/ranking-datos";

describe("listaRanking", () => {
  it("cada pestaña devuelve SU lista (los dos sentidos)", () => {
    expect(listaRanking("mensual")).toBe(RANKING_MENSUAL);
    expect(listaRanking("reto")).toBe(RANKING_RETO);
  });

  it("las dos listas son distintas: el conmutador cambia de verdad", () => {
    expect(RANKING_MENSUAL[0]?.username).not.toBe(RANKING_RETO[0]?.username);
  });
});
