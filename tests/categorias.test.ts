/**
 * CATEGORIAS · fuente unica con dientes. `CATEGORIES` de config/constants (las 14 del documento
 * maestro) es la UNICA lista; `retos-datos` la adapta a la vista sin duplicarla. (La maqueta de retos
 * que tambien vigilaba este fichero se fue con P14: la portada y el feed ya son reales, y su nombre de
 * categoria se resuelve desde `CATEGORIES` por construccion.)
 */
import { describe, expect, it } from "vitest";

import { CATEGORIAS } from "../src/app/(app)/(shell)/retos/retos-datos";
import { CATEGORIES } from "../src/config/constants";

const KEYS = new Set<string>(CATEGORIES.map((c) => c.key));

describe("categorias: fuente unica = las 14 de config/constants", () => {
  it("son EXACTAMENTE 14 y sin duplicados", () => {
    expect(CATEGORIES).toHaveLength(14);
    expect(KEYS.size).toBe(14);
  });

  it("CATEGORIAS (retos) se DERIVA de CATEGORIES (mismas claves y etiquetas, mismo orden)", () => {
    expect(CATEGORIAS.map((c) => c.clave)).toEqual(CATEGORIES.map((c) => c.key));
    expect(CATEGORIAS.map((c) => c.nombre)).toEqual(CATEGORIES.map((c) => c.es));
  });
});
