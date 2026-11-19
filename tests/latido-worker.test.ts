/**
 * EL LATIDO DEL WORKER, ida y vuelta por la base de datos (Fase 11 · worker vigilado): lo que anota el
 * worker es lo que lee el health. `vivoS` es lo que distingue un worker sano de uno en bucle de
 * reinicios (que late y muere): sale de `desde`, que vuelve a empezar en cada arranque.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";
import {
  anotarLatido,
  CLAVE_LATIDO_WORKER,
  leerLatido,
} from "../src/server/services/latido-worker";

import { createTestPrisma, resetDb } from "./helpers/db";

const SHA = "b".repeat(40);
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

describe("el latido", () => {
  it("lo anotado se lee: commit, hace cuántos segundos y cuántos lleva vivo", async () => {
    const desde = new Date("2026-11-19T10:00:00.000Z");
    const ahora = new Date("2026-11-19T10:00:45.000Z");
    await anotarLatido(prisma, { commit: SHA, ahora, desde });
    expect(await leerLatido(prisma, new Date(ahora.getTime() + 7_000))).toEqual({
      commit: SHA,
      haceS: 7,
      vivoS: 45,
    });
  });

  it("cada latido REESCRIBE la misma fila (una sola, no una por latido)", async () => {
    const desde = new Date("2026-11-19T10:00:00.000Z");
    for (let s = 0; s < 3; s++) {
      await anotarLatido(prisma, {
        commit: SHA,
        ahora: new Date(desde.getTime() + s * 15_000),
        desde,
      });
    }
    expect(await prisma.systemState.count({ where: { key: CLAVE_LATIDO_WORKER } })).toBe(1);
  });

  it("un REINICIO vuelve a poner el tiempo vivo a cero, aunque el latido sea reciente", async () => {
    const t = new Date("2026-11-19T10:05:00.000Z");
    await anotarLatido(prisma, { commit: SHA, ahora: t, desde: new Date(t.getTime() - 2_000) });
    expect((await leerLatido(prisma, t))?.vivoS).toBe(2);
  });

  it("sin latido, `null`; un commit sin forma de SHA sale `null`, nunca tal cual", async () => {
    expect(await leerLatido(prisma, new Date())).toBeNull();
    const t = new Date("2026-11-19T10:00:00.000Z");
    await anotarLatido(prisma, { commit: "no es un sha", ahora: t, desde: t });
    expect((await leerLatido(prisma, t))?.commit).toBeNull();
  });
});
