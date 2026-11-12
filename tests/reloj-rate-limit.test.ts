/**
 * UN TEST QUE LLENA UN CUBO DE RATE-LIMIT REAL CONGELA EL RELOJ (fallo real: CI de main en `f4a45ce`).
 *
 * `rateLimit` cuenta por VENTANA FIJA alineada al reloj. Un test que llena el cubo con N llamadas y
 * espera que la N+1 dé 429 falla de forma intermitente si entre ellas cae un borde de ventana: la
 * última abre una ventana nueva y vacía. Pasó con `buscar-endpoint` (ventana de un minuto, fichero de
 * 15:56:58.8 a 15:57:00.5): verde en local y en la rama, rojo en main con el mismo SHA. El arreglo es
 * `congelarReloj()` (helpers/reloj.ts), y este fichero lo hace OBLIGATORIO y demuestra por qué.
 *
 * Para romperlo a propósito: quitar el `congelarReloj()` de `buscar-endpoint` (rojo el censo); que
 * `congelarReloj` congele un instante en el borde (rojo el de «lejos de los bordes»).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";
import { rateLimit } from "../src/server/security/rate-limit";

import { createTestPrisma, resetDb } from "./helpers/db";
import { congelarReloj, LEJOS_DE_LOS_BORDES, soltarReloj } from "./helpers/reloj";

const TESTS = join(process.cwd(), "tests");

function ficheros(dir = TESTS): { nombre: string; src: string }[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return ficheros(p);
    if (!/\.test\.tsx?$/.test(n)) return [];
    return [{ nombre: relative(TESTS, p).split(sep).join("/"), src: readFileSync(p, "utf8") }];
  });
}

const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** Lleva una RUTA de verdad hasta el 429. */
const llegaAl429DeUnaRuta = (src: string) => /src\/app\/api\//.test(src) && /toBe\(429\)/.test(src);
/** …con el limitador DOBLADO (entonces no hay ventana real que cruzar). */
const doblaElLimitador = (src: string) =>
  /mocks\.rateLimit|rateLimit:\s*vi\.fn|vi\.mock\(\s*["']@\/server\/security\/rate-limit["']/.test(
    src,
  );

describe("el censo", () => {
  const todos = ficheros().map((f) => ({ ...f, codigo: sinComentarios(f.src) }));
  const conLimitadorReal = todos.filter(
    (f) => llegaAl429DeUnaRuta(f.codigo) && !doblaElLimitador(f.codigo),
  );

  it("los que conocemos están en el censo (si no, el detector está roto)", () => {
    const nombres = conLimitadorReal.map((f) => f.nombre);
    for (const n of [
      "buscar-endpoint.test.ts",
      "register-ratelimit.test.ts",
      "registro-cuenta-existente.test.ts",
    ]) {
      expect(nombres, n).toContain(n);
    }
  });

  it("todo test que lleva una ruta real hasta el 429 congela el reloj", () => {
    const sinReloj = conLimitadorReal
      .filter((f) => !/congelarReloj\(/.test(f.codigo) || !/soltarReloj\(/.test(f.codigo))
      .map((f) => f.nombre);
    // Si esto falla: `congelarReloj()` antes de llenar el cubo, y `soltarReloj()` en `afterEach`.
    expect(sinReloj).toEqual([]);
  });
});

describe("por qué (el mecanismo, contra la BD)", () => {
  let prisma: PrismaClient;
  beforeAll(() => {
    prisma = createTestPrisma();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });
  beforeEach(async () => {
    await resetDb(prisma);
  });
  afterEach(() => {
    soltarReloj();
  });

  const VENTANA = { limit: 3, windowMs: 60_000 };

  it("cruzar un borde de ventana VACÍA el cubo: la llamada siguiente pasa (lo que vio CI)", async () => {
    const antes = new Date("2026-11-12T15:56:59.900Z");
    const despues = new Date("2026-11-12T15:57:00.100Z");
    for (let i = 0; i < VENTANA.limit; i++) {
      await rateLimit(prisma, { key: "k", ...VENTANA, now: antes });
    }
    expect((await rateLimit(prisma, { key: "k", ...VENTANA, now: antes })).allowed).toBe(false);
    expect((await rateLimit(prisma, { key: "k", ...VENTANA, now: despues })).allowed).toBe(true);
  });

  it("con el reloj congelado, todas caen en la MISMA ventana y la de más corta", async () => {
    congelarReloj();
    for (let i = 0; i < VENTANA.limit; i++) await rateLimit(prisma, { key: "k", ...VENTANA });
    expect((await rateLimit(prisma, { key: "k", ...VENTANA })).allowed).toBe(false);
  });

  it("el instante congelado está lejos de los bordes de minuto, hora y día", () => {
    const d = LEJOS_DE_LOS_BORDES;
    expect(d.getUTCSeconds()).toBeGreaterThanOrEqual(15);
    expect(d.getUTCSeconds()).toBeLessThanOrEqual(45);
    expect(d.getUTCMinutes()).toBeGreaterThanOrEqual(15);
    expect(d.getUTCMinutes()).toBeLessThanOrEqual(45);
    expect(d.getUTCHours()).toBeGreaterThanOrEqual(6);
    expect(d.getUTCHours()).toBeLessThanOrEqual(18);
  });
});
