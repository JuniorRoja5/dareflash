/**
 * LAS BDs DE TEST SE RECREAN EN CADA EJECUCIÓN. Nunca se reutilizan.
 *
 * POR QUÉ ES ESTRUCTURAL Y NO SE DEJA A LOS TESTS DE COMPORTAMIENTO: el fallo que esto evita solo
 * aparece con una BD que arrastra historia de ejecuciones anteriores. Con el arreglo puesto, cada
 * ejecución arranca limpia, así que `buscar.test.ts` ya no puede ponerse rojo por sí solo aunque
 * alguien quite el arreglo — seguiría en verde varias ejecuciones y volvería a fallar semanas después,
 * "intermitente", que es exactamente como se presentó la primera vez. Este test es lo único que se
 * pone rojo en el mismo commit que deshace la decisión.
 *
 * EL FALLO (medido el 2026-09-11): borrar filas en InnoDB no borra sus entradas del índice FULLTEXT,
 * solo apunta su DOC_ID en una lista de borrados que nada purga, y `MATCH ... AGAINST` descarta todo
 * resultado con un DOC_ID de esa lista. Con `resetDb` borrando en cada test y las BDs viviendo para
 * siempre, `dareflash_test_1` acumuló 6.380 DOC_ID borrados — y a una fila nueva InnoDB le asignó
 * uno de ellos. La fila existía, pero el FULLTEXT la daba por borrada. Ver `tests/global-setup.ts`.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/** Solo CÓDIGO: el comentario que explica el arreglo menciona las dos sentencias. */
function codigoDelSetup(): string {
  return readFileSync(path.resolve(__dirname, "global-setup.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("globalSetup: cada BD de test nace limpia", () => {
  it("borra la BD antes de crearla", () => {
    const src = codigoDelSetup();
    const drop = src.indexOf("DROP DATABASE IF EXISTS");
    const create = src.indexOf("CREATE DATABASE");
    expect(drop).toBeGreaterThan(-1);
    expect(create).toBeGreaterThan(-1);
    // El orden importa: crear y luego borrar dejaría el servidor sin la BD.
    expect(drop).toBeLessThan(create);
  });

  it("no vuelve a `IF NOT EXISTS`, que es justo lo que dejaba vivir la BD para siempre", () => {
    expect(codigoDelSetup()).not.toMatch(/CREATE DATABASE IF NOT EXISTS/);
  });

  it("borra y crea DENTRO del mismo recorrido de BDs, no solo una de ellas", () => {
    // Si el DROP quedara fuera del bucle (por ejemplo, solo para la BD base), las de worker —que son
    // las que usan los tests— seguirían heredando estado.
    const src = codigoDelSetup();
    const bucle = /for \(const n of nombres\) \{([\s\S]*?)\n {4}\}/.exec(src)?.[1] ?? "";
    expect(bucle).toContain("DROP DATABASE IF EXISTS");
    expect(bucle).toContain("CREATE DATABASE");
  });
});
