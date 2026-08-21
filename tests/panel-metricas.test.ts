/**
 * Métricas del Resumen del panel (BD). Con dientes: los conteos por estado son REALES y el desglose no
 * se contradice con el total (un DRAFT cuenta como borrador y en el total; un PUBLISHED como publicado y
 * en el total; un CLOSED solo en el total). `usuarios` = filas de User.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";
import { metricasPanel } from "../src/server/services/panel-metricas";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

let prisma: PrismaClient;
let admin: string;

beforeAll(() => {
  prisma = createTestPrisma();
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
  admin = await crearUsuario(prisma, { username: "adminmetricas" });
});

async function crearReto(publicCode: string, status: string) {
  await prisma.challenge.create({
    data: {
      title: "Reto",
      slug: "reto",
      publicCode,
      category: "fitness",
      status,
      prizeCurrency: "USD",
      startsAt: new Date("2026-01-01T00:00:00Z"),
      deadline: new Date("2026-12-01T00:00:00Z"),
      createdById: admin,
    },
  });
}

describe("metricasPanel", () => {
  it("cuenta retos por estado y usuarios; el total incluye CLOSED aunque no esté en el desglose", async () => {
    await crearReto("pub00001", "PUBLISHED");
    await crearReto("pub00002", "PUBLISHED");
    await crearReto("dra00001", "DRAFT");
    await crearReto("clo00001", "CLOSED");
    // un segundo usuario además del admin creado en beforeEach
    await crearUsuario(prisma, { username: "otrouser" });

    const m = await metricasPanel(prisma);
    expect(m.retosPublicados).toBe(2);
    expect(m.retosBorradores).toBe(1);
    expect(m.retosTotal).toBe(4); // 2 PUBLISHED + 1 DRAFT + 1 CLOSED
    expect(m.usuarios).toBe(2);
  });

  it("sin retos: todo a cero (nunca inventado)", async () => {
    const m = await metricasPanel(prisma);
    expect(m).toMatchObject({ retosTotal: 0, retosPublicados: 0, retosBorradores: 0 });
    expect(m.usuarios).toBe(1); // solo el admin del beforeEach
  });
});
