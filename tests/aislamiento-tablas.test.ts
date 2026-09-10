/**
 * `resetDb` LIMPIA TODAS LAS TABLAS, no las que alguien se acordó de apuntar.
 *
 * POR QUÉ EXISTE, con nombre y apellidos: al añadir `RankingMensual` (Fase 4) sus filas NO se
 * borraban entre tests, porque `DELETE_ORDER` es una lista escrita a mano y nadie la actualizó. El
 * síntoma no fue un error claro: un test del ranking pasaba solo y fallaba junto a otros, y otro
 * fallaba incluso en aislamiento por datos de una ejecución anterior. Un test sucio miente en las dos
 * direcciones —da verde con basura y rojo sin motivo— y se investiga a ciegas.
 *
 * La lista sigue siendo manual porque el ORDEN importa (hay claves ajenas `Restrict`: los hijos
 * primero). Lo que deja de ser manual es ACORDARSE: si el esquema gana un modelo y nadie lo añade,
 * esto se pone rojo y dice cuál.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { DELETE_ORDER } from "./helpers/db";

/** Modelos declarados en el esquema, en el orden en que aparecen. */
function modelosDelEsquema(): string[] {
  const src = readFileSync(path.resolve(__dirname, "..", "prisma", "schema.prisma"), "utf8");
  return [...src.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1] as string);
}

/**
 * Modelos que NO viven en la base de datos de la app y por tanto no se limpian. Vacío hoy: se deja
 * declarado para que una futura excepción tenga que escribirse y justificarse aquí, en vez de
 * colarse aflojando el test.
 */
const SIN_LIMPIAR = new Set<string>([]);

describe("el aislamiento entre tests no depende de que nadie se olvide", () => {
  it("todo modelo del esquema se borra en `resetDb`", () => {
    const faltan = modelosDelEsquema().filter(
      (m) => !DELETE_ORDER.includes(m) && !SIN_LIMPIAR.has(m),
    );
    // Si esto falla: añade el modelo a DELETE_ORDER, y ANTES de sus padres (las FK son `Restrict`).
    expect(faltan).toEqual([]);
  });

  it("y no se borra nada que ya no exista", () => {
    // Una tabla renombrada dejaría un DELETE contra una tabla inexistente: fallaría en TODOS los
    // tests a la vez, con un error de SQL en vez de decir qué pasó.
    const modelos = new Set(modelosDelEsquema());
    expect(DELETE_ORDER.filter((t) => !modelos.has(t))).toEqual([]);
  });

  it("sin repetidos (un borrado duplicado es ruido que esconde el orden real)", () => {
    expect(new Set(DELETE_ORDER).size).toBe(DELETE_ORDER.length);
  });
});
