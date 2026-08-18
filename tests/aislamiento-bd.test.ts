/**
 * Fija el AISLAMIENTO de la BD de tests por worker (deuda de Fase 1). Si una refactorización futura
 * rompiera el aislamiento (todos los workers volviendo a una BD compartida), estos asertos caen. La
 * prueba de que el aislamiento evita la contaminación cruzada es, además, que TODO el suite pasa en
 * VERDE con paralelismo (antes, con `fileParallelism:false` y una BD compartida, no era fiable): los
 * muchos tests que afirman conteos globales tras `resetDb` (p.ej. `auditLog.count() === 1`) solo pasan
 * en paralelo si cada worker tiene SU propia BD.
 */
import { describe, expect, it } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";

import { createTestPrisma, nombreBdWorker } from "./helpers/db";

describe("aislamiento de la BD de tests por worker", () => {
  it("nombreBdWorker deriva `<base>_<VITEST_POOL_ID>`", () => {
    const id = process.env["VITEST_POOL_ID"] ?? "1";
    expect(nombreBdWorker()).toBe(`dareflash_test_${id}`);
  });

  it("el cliente está conectado a LA BD de ESTE worker (no a una compartida)", async () => {
    const prisma: PrismaClient = createTestPrisma();
    try {
      const rows = await prisma.$queryRaw<Array<{ db: string }>>`SELECT DATABASE() AS db`;
      expect(rows[0]?.db).toBe(nombreBdWorker());
    } finally {
      await prisma.$disconnect();
    }
  });
});
