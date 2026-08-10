/**
 * CATEGORIAS · fuente unica con dientes. `CATEGORIES` de config/constants (las 14 del documento
 * maestro) es la UNICA lista; `retos-datos` la adapta a la vista sin duplicarla, y ningun dato de
 * maqueta puede usar una categoria fuera de las 14. Meter una categoria invalida (p. ej. "cocina",
 * "deportes", "mascotas") en RETOS_SEED o en el feed cae en ROJO.
 */
import { describe, expect, it } from "vitest";

import { POSTS_INICIO } from "../src/app/(app)/feed/inicio-datos";
import { CATEGORIAS, RETOS_SEED } from "../src/app/(app)/(shell)/retos/retos-datos";
import { CATEGORIES } from "../src/config/constants";

const KEYS = new Set<string>(CATEGORIES.map((c) => c.key));
const LABELS = new Set<string>(CATEGORIES.map((c) => c.es));

describe("categorias: fuente unica = las 14 de config/constants", () => {
  it("son EXACTAMENTE 14 y sin duplicados", () => {
    expect(CATEGORIES).toHaveLength(14);
    expect(KEYS.size).toBe(14);
  });

  it("CATEGORIAS (retos) se DERIVA de CATEGORIES (mismas claves y etiquetas, mismo orden)", () => {
    expect(CATEGORIAS.map((c) => c.clave)).toEqual(CATEGORIES.map((c) => c.key));
    expect(CATEGORIAS.map((c) => c.nombre)).toEqual(CATEGORIES.map((c) => c.es));
  });

  it("NINGUN reto de RETOS_SEED usa una categoria fuera de las 14", () => {
    const fuera = RETOS_SEED.filter((r) => !KEYS.has(r.categoria)).map((r) => r.categoria);
    expect(fuera).toEqual([]);
  });

  it("NINGUN post del feed usa una etiqueta de categoria fuera de las 14", () => {
    const fuera = POSTS_INICIO.filter((p) => !LABELS.has(p.categoria)).map((p) => p.categoria);
    expect(fuera).toEqual([]);
  });
});
