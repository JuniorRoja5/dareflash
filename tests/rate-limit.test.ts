import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";
import { rateLimit } from "../src/server/security/rate-limit";

import { createTestPrisma, resetDb } from "./helpers/db";

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

describe("rate limiting", () => {
  it("permite hasta el limite y luego bloquea, dentro de la misma ventana", async () => {
    const opts = { key: "login:ip:test", limit: 3, windowMs: 60_000 };

    const r1 = await rateLimit(prisma, opts);
    const r2 = await rateLimit(prisma, opts);
    const r3 = await rateLimit(prisma, opts);
    const r4 = await rateLimit(prisma, opts);

    expect([r1.allowed, r2.allowed, r3.allowed]).toEqual([true, true, true]);
    expect(r4.allowed).toBe(false); // el 4o supera el limite de 3
    expect(r3.remaining).toBe(0);
    expect(r4.count).toBe(4);
  });

  it("ventanas distintas cuentan por separado", async () => {
    const base = { key: "login:ip:test", limit: 2, windowMs: 60_000 };
    const t0 = new Date("2026-01-01T00:00:00.000Z");
    const t1 = new Date("2026-01-01T00:01:30.000Z"); // ventana siguiente

    await rateLimit(prisma, { ...base, now: t0 });
    await rateLimit(prisma, { ...base, now: t0 });
    const bloqueado = await rateLimit(prisma, { ...base, now: t0 });
    const nuevaVentana = await rateLimit(prisma, { ...base, now: t1 });

    expect(bloqueado.allowed).toBe(false);
    expect(nuevaVentana.allowed).toBe(true); // ventana nueva, contador a 1
    expect(nuevaVentana.count).toBe(1);
  });

  it("incremento atomico bajo concurrencia: el recuento es exacto (sin perdidas)", async () => {
    const N = 30;
    const opts = { key: "register:ip:test", limit: 1000, windowMs: 60_000 };

    await Promise.all(Array.from({ length: N }, () => rateLimit(prisma, opts)));

    const rows = await prisma.rateLimit.findMany({ where: { key: "register:ip:test" } });
    expect(rows).toHaveLength(1); // una sola fila (misma ventana)
    expect(rows[0]?.count).toBe(N); // exacto, sin lost updates
  });
});
