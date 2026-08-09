/**
 * Feed de Retos — filtro PURO con dientes (Paso C · unidad 2). `todos` devuelve todos; una categoria
 * devuelve solo los que coinciden; no muta la lista. Romper el filtro (ignorar la categoria) cae en
 * rojo. Las demas garantias del feed ya vienen por construccion de las primitivas (el marcador une
 * premio+tiempo, el importe es lima-solo-texto), asi que aqui no hay snapshots vacios.
 */
import { describe, expect, it } from "vitest";

import {
  buscarReto,
  CATEGORIA_TODOS,
  filtrarRetos,
} from "../src/app/(app)/(shell)/retos/retos-datos";

const RETOS = [
  { id: "a", categoria: "fitness" },
  { id: "b", categoria: "cocina" },
  { id: "c", categoria: "fitness" },
  { id: "d", categoria: "gaming" },
];

describe("filtrarRetos", () => {
  it('"todos" devuelve TODOS en el mismo orden', () => {
    expect(filtrarRetos(RETOS, CATEGORIA_TODOS).map((r) => r.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("una categoria devuelve SOLO los que coinciden (los dos sentidos)", () => {
    expect(filtrarRetos(RETOS, "fitness").map((r) => r.id)).toEqual(["a", "c"]);
    expect(filtrarRetos(RETOS, "cocina").map((r) => r.id)).toEqual(["b"]);
  });

  it("una categoria sin retos devuelve lista vacia", () => {
    expect(filtrarRetos(RETOS, "moda")).toEqual([]);
  });

  it("es estable: devuelve una copia nueva y no muta la lista original", () => {
    const salida = filtrarRetos(RETOS, CATEGORIA_TODOS);
    expect(salida).not.toBe(RETOS);
    expect(RETOS).toHaveLength(4);
  });
});

describe("buscarReto (detalle)", () => {
  it("un id EXISTENTE devuelve el reto correcto", () => {
    const reto = buscarReto("salto-en-caja");
    expect(reto?.id).toBe("salto-en-caja");
    expect(reto?.categoria).toBe("fitness");
  });

  it("un id INEXISTENTE devuelve undefined (-> 404)", () => {
    expect(buscarReto("no-existe")).toBeUndefined();
    expect(buscarReto("")).toBeUndefined();
  });
});
