/**
 * EL ÍNDICE QUE HACE BARATA LA PORTADA — fijado por el PLAN, no solo por el esquema.
 *
 * ┌─ EL FALLO ─────────────────────────────────────────────────────────────────────────────────────┐
 * │ `destacadosVigentes` (portada) y la lista de Boosts del panel preguntan lo mismo:              │
 * │ `WHERE expiresAt > ahora`. El índice que había era `[startsAt, expiresAt]`, y su PRIMERA        │
 * │ columna no aparece en ese filtro, así que MariaDB no podía usarlo para el rango y recorría      │
 * │ `BoostActivation` ENTERA — una tabla que guarda todo el historial de activaciones caducadas y   │
 * │ que por tanto crece para siempre. EXPLAIN en producción (3-nov, 11 filas):                     │
 * │ `type=index, possible_keys=NULL`. Con 11 filas no se nota; el coste es lineal con el historial. │
 * │                                                                                                 │
 * │ Medido en local con historial sembrado (200.100 filas, 100 vigentes), consulta de la portada:   │
 * │   con [startsAt, expiresAt]  -> 22,0 ms   (type=ALL, 199.125 filas estimadas)                   │
 * │   SIN ningún índice de los dos -> 21,9 ms (type=ALL, 199.125)                                   │
 * │   con [expiresAt, userId, startsAt] -> 1,1 ms (type=range, 100)                                 │
 * │ O sea: el viejo no aportaba NADA (igual que no tener ninguno) y el nuevo lo divide por veinte.  │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * POR QUÉ SE COMPRUEBA EL PLAN Y NO SOLO EL TEXTO DEL ESQUEMA: un `@@index` escrito en
 * `schema.prisma` puede existir y NO servir —es exactamente lo que pasaba— porque lo que decide es
 * el orden de las columnas frente al WHERE. Un test que solo busque la cadena volvería a estar verde
 * con un índice inútil. Así que aquí se le pregunta a MariaDB.
 *
 * Y el caso de abajo se AUTOCOMPRUEBA: tira el índice, confirma que el plan se degrada a recorrido
 * completo, y lo vuelve a poner. Sin eso, un detector roto (o unos datos demasiado pequeños para que
 * el optimizador se moleste) dejaría el caso en verde para siempre.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

const ESQUEMA = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8");

const INDICE = "BoostActivation_expiresAt_userId_startsAt_idx";
const COLUMNAS = "`expiresAt`, `userId`, `startsAt`";

/** Caducadas: suficientes para que recorrer la tabla sea medible frente a ir por el índice. */
const CADUCADAS = 3000;
const VIGENTES = 20;

interface FilaPlan {
  type: string;
  key: string | null;
  rows: number | bigint;
}

let prisma: PrismaClient;

/** El plan del filtro que hacen las DOS consultas de Boosts vigentes. */
async function planDelFiltro(): Promise<FilaPlan> {
  const filas = await prisma.$queryRawUnsafe<FilaPlan[]>(
    "EXPLAIN SELECT id FROM BoostActivation WHERE expiresAt > NOW()",
  );
  return filas[0]!;
}

const esRecorridoCompleto = (p: FilaPlan) => p.type === "ALL" || p.type === "index";

/** `rows` llega como BigInt y `JSON.stringify` no lo serializa: el mensaje se compone a mano. */
const describir = (p: FilaPlan) => `type=${p.type} key=${p.key ?? "NULL"} rows=${p.rows}`;

beforeAll(async () => {
  prisma = createTestPrisma();
  await resetDb(prisma);

  const dueno = await crearUsuario(prisma, { username: "la_del_boost" });
  const filas: Array<{ id: string; userId: string; startsAt: Date; expiresAt: Date }> = [];
  const ahora = Date.now();
  const HORA = 3_600_000;
  for (let i = 0; i < CADUCADAS; i += 1) {
    filas.push({
      id: `bcad${String(i).padStart(18, "0")}`,
      userId: dueno,
      startsAt: new Date(ahora - (i + 2) * HORA),
      expiresAt: new Date(ahora - (i + 1) * HORA),
    });
  }
  for (let i = 0; i < VIGENTES; i += 1) {
    filas.push({
      id: `bvig${String(i).padStart(18, "0")}`,
      userId: dueno,
      startsAt: new Date(ahora - HORA),
      expiresAt: new Date(ahora + (i + 1) * HORA),
    });
  }
  await prisma.boostActivation.createMany({ data: filas });
  // Sin estadísticas frescas el optimizador decide con cifras viejas y el plan no es el de verdad.
  await prisma.$executeRawUnsafe("ANALYZE TABLE BoostActivation");
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("el esquema declara el índice que sirve al filtro", () => {
  it("hay un `@@index` de BoostActivation cuya PRIMERA columna es `expiresAt`", () => {
    const modelo = /model BoostActivation \{([\s\S]*?)\n\}/.exec(ESQUEMA)?.[1] ?? "";
    expect(modelo, "no se encontró el modelo BoostActivation").not.toBe("");

    const indices = [...modelo.matchAll(/@@index\(\[([^\]]+)\]\)/g)].map((m) =>
      m[1]!.split(",").map((c) => c.trim()),
    );
    expect(indices.length, "el modelo se quedó sin índices").toBeGreaterThan(0);

    // La PRIMERA columna es lo único que decide si el rango puede usar el índice. Comprobar que
    // `expiresAt` aparece en alguno NO bastaría: el índice viejo la tenía, en segunda posición, y
    // era inservible.
    const lideres = indices.map((cols) => cols[0]);
    expect(lideres, `índices: ${JSON.stringify(indices)}`).toContain("expiresAt");
  });
});

describe("y MariaDB lo USA de verdad", () => {
  it("el filtro de vigentes va por RANGO sobre el índice, no recorriendo la tabla", async () => {
    const plan = await planDelFiltro();

    expect(esRecorridoCompleto(plan), describir(plan)).toBe(false);
    expect(plan.key, describir(plan)).toBe(INDICE);
    // Y mira unas pocas filas, no las miles que hay: es la diferencia que se paga en cada portada.
    expect(Number(plan.rows)).toBeLessThan(CADUCADAS / 2);
  });

  it("AUTOCOMPROBACIÓN: sin el índice el plan SÍ se degrada a recorrido completo", async () => {
    // Si este caso no pasara, el de arriba no probaría nada: querría decir que el optimizador elige
    // el mismo plan con índice y sin él (datos demasiado pequeños), o que el detector está roto.
    try {
      await prisma.$executeRawUnsafe(`DROP INDEX \`${INDICE}\` ON BoostActivation`);
      await prisma.$executeRawUnsafe("ANALYZE TABLE BoostActivation");

      const sinIndice = await planDelFiltro();
      expect(esRecorridoCompleto(sinIndice), describir(sinIndice)).toBe(true);
      expect(Number(sinIndice.rows)).toBeGreaterThan(CADUCADAS / 2);
    } finally {
      // Se restaura SIEMPRE: el resto de la suite comparte esta base de datos.
      await prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS \`${INDICE}\` ON BoostActivation(${COLUMNAS})`,
      );
      await prisma.$executeRawUnsafe("ANALYZE TABLE BoostActivation");
    }

    // Y vuelve a estar: la autocomprobación no deja la base de datos peor que la encontró.
    expect((await planDelFiltro()).key).toBe(INDICE);
  });
});
