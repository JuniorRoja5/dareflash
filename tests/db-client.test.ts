import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";

import { resetDb } from "./helpers/db";

/**
 * Prueba el SINGLETON `prisma` de src/server/db/client.ts (el Proxy perezoso), no un
 * cliente propio de tests: es el objeto que toca los ledgers en produccion y el Proxy no
 * lo probaba nada. Tres formas, porque cada una puede romperse por un motivo distinto:
 *  1) delegado de modelo (prisma.user.*)
 *  2) metodo del cliente que necesita `this` (prisma.$transaction) -> valida el .bind()
 *  3) consulta cruda (prisma.$queryRaw)
 * `server-only` esta stubbeado en vitest.config; DATABASE_URL apunta a la BD de tests.
 */
const TEST_DB_URL =
  process.env["TEST_DATABASE_URL"] ??
  "mysql://dareflash:dareflash_dev@127.0.0.1:3307/dareflash_test";

const BIRTH = new Date("2000-01-01T00:00:00.000Z");
const savedEnv = { ...process.env };

let prisma: PrismaClient;

beforeAll(async () => {
  // El Proxy lee env.DATABASE_URL en el PRIMER acceso: apuntamos a la BD de tests y damos
  // las otras obligatorias del esquema para que `env` valide.
  process.env["DATABASE_URL"] = TEST_DB_URL;
  process.env["APP_URL"] = "https://x.test";
  process.env["AUTH_SECRET"] = "x".repeat(32);
  ({ prisma } = await import("../src/server/db/client"));
});

afterAll(async () => {
  await prisma.$disconnect();
  delete (globalThis as unknown as { prisma?: unknown }).prisma;
  process.env = { ...savedEnv };
});

beforeEach(async () => {
  await resetDb(prisma);
});

describe("prisma Proxy contra la BD de tests", () => {
  it("1) delegado de modelo: user.create / findUnique", async () => {
    const created = await prisma.user.create({
      data: { email: "proxy@test.com", passwordHash: "x", birthDate: BIRTH },
      select: { id: true },
    });
    const found = await prisma.user.findUnique({
      where: { id: created.id },
      select: { email: true },
    });
    expect(found?.email).toBe("proxy@test.com");
  });

  it("2) metodo del cliente que necesita `this`: $transaction (valida el .bind del Proxy)", async () => {
    const email = "tx@test.com";
    await prisma.$transaction(async (tx) => {
      await tx.user.create({ data: { email, passwordHash: "x", birthDate: BIRTH } });
    });
    expect(await prisma.user.count({ where: { email } })).toBe(1);
  });

  it("3) consulta cruda: $queryRaw", async () => {
    const rows = await prisma.$queryRaw<Array<{ uno: number | bigint }>>`SELECT 1 AS uno`;
    expect(Number(rows[0]?.uno)).toBe(1);
  });
});
