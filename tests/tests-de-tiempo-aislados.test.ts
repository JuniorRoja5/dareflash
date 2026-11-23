/**
 * LOS TESTS QUE MIDEN TIEMPO CORREN SOLOS (Fase 11 · PTA2) — censo estructural.
 *
 * Todo fichero que importa `tests/helpers/tiempo-argon2` mide tiempo, y pertenece SOLO al proyecto
 * `tiempo` de vitest: un worker, su propia BD, detrás de todos los demás grupos. Si uno se queda en el
 * proyecto general, vuelve a medir con otros tres workers quemando CPU al lado, y el margen frente a
 * `H/2` se erosiona con cada test que entra en la suite, sin que nada falle hasta el día que falla.
 *
 * Fija: (1) la lista `TESTS_DE_TIEMPO` es EXACTAMENTE la de los ficheros que importan el helper (el
 * fallo nombra el que sobra o falta); (2) el proyecto `node` los excluye y el `tiempo` incluye esos y
 * solo esos; (3) `tiempo` tiene un worker, su BD y el último `groupOrder`.
 *
 * Para romperlo: quitar un fichero de `TESTS_DE_TIEMPO` (rojo 1, lo nombra), quitar el `exclude` del
 * proyecto `node` (rojo 2), o darle a `tiempo` más workers o el mismo grupo que otro (rojo 3).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { SUFIJO_BD_TIEMPO, TESTS_DE_TIEMPO } from "./helpers/tests-de-tiempo";
import config from "../vitest.config";

const RAIZ = process.cwd();
const HELPER = "tests/helpers/tiempo-argon2.ts";

function ficheros(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? ficheros(p) : /\.tsx?$/.test(n) ? [p] : [];
  });
}

const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** Los ficheros de tests/ que IMPORTAN el helper de tiempo (sin contar comentarios ni el propio helper). */
const importanElHelper = ficheros(path.join(RAIZ, "tests"))
  .map((p) => path.relative(RAIZ, p).replaceAll("\\", "/"))
  .filter((rel) => rel !== HELPER)
  .filter((rel) =>
    /from\s+["'][^"']*helpers\/tiempo-argon2["']/.test(
      sinComentarios(readFileSync(path.join(RAIZ, rel), "utf8")),
    ),
  )
  .sort();

type Proyecto = {
  test: {
    name: string;
    include?: string[];
    exclude?: string[];
    maxWorkers?: number;
    pool?: string;
    globalSetup?: string[];
    env?: Record<string, string>;
    sequence?: { groupOrder?: number };
  };
};
const proyectos = (config as unknown as { test: { projects: Proyecto[] } }).test.projects;
const proyecto = (nombre: string) => {
  const p = proyectos.find((x) => x.test.name === nombre);
  if (!p) throw new Error(`no hay proyecto «${nombre}» en vitest.config.ts`);
  return p.test;
};

describe("los tests que miden tiempo están en su proyecto, y solo ahí", () => {
  it("el censo encuentra los ficheros de tiempo (si no, no probaría nada)", () => {
    expect(importanElHelper.length).toBeGreaterThanOrEqual(2);
  });

  it("todo fichero que importa tiempo-argon2 está en TESTS_DE_TIEMPO", () => {
    const fuera = importanElHelper.filter(
      (f) => !(TESTS_DE_TIEMPO as readonly string[]).includes(f),
    );
    expect(fuera, `miden tiempo pero corren en el proyecto general: ${fuera.join(", ")}`).toEqual(
      [],
    );
  });

  it("y TESTS_DE_TIEMPO no lleva nada que no mida tiempo", () => {
    const sobran = TESTS_DE_TIEMPO.filter((f) => !importanElHelper.includes(f));
    expect(sobran, `en la lista de tiempo sin importar el helper: ${sobran.join(", ")}`).toEqual(
      [],
    );
  });

  it("el proyecto `node` los EXCLUYE (no corren dos veces ni en paralelo)", () => {
    const node = proyecto("node");
    for (const f of importanElHelper) {
      expect(node.exclude ?? [], `el proyecto node no excluye ${f}`).toContain(f);
    }
  });

  it("el proyecto `tiempo` incluye esos y solo esos", () => {
    expect([...(proyecto("tiempo").include ?? [])].sort()).toEqual(importanElHelper);
  });

  it("`tiempo`: un solo worker, forks, su BD y su globalSetup", () => {
    const t = proyecto("tiempo");
    expect(t.maxWorkers).toBe(1);
    expect(t.pool).toBe("forks");
    expect(t.env?.["BD_TEST_SUFIJO"]).toBe(SUFIJO_BD_TIEMPO);
    expect(t.globalSetup).toEqual(["./tests/global-setup-tiempo.ts"]);
  });

  it("`tiempo` es el ÚLTIMO grupo: empieza cuando los demás han terminado", () => {
    const suyo = proyecto("tiempo").sequence?.groupOrder ?? 0;
    for (const p of proyectos.filter((x) => x.test.name !== "tiempo")) {
      expect(suyo, `«tiempo» no va detrás de «${p.test.name}»`).toBeGreaterThan(
        p.test.sequence?.groupOrder ?? 0,
      );
    }
  });
});
