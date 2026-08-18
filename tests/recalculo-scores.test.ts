/**
 * RECÁLCULO del scoreAutoridad en el worker — CON DIENTES: escribe el score correcto (más vídeos
 * publicados -> más score de usuario) y el cursor keyset rotatorio avanza y reinicia (round-robin).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";
import { recalcularScoresAutoridad } from "../src/server/services/recalculo-scores";

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

async function usuario(): Promise<string> {
  const u = await prisma.user.create({ data: { passwordHash: "x" }, select: { id: true } });
  return u.id;
}

describe("recalcularScoresAutoridad", () => {
  it("usuarios: más vídeos PUBLISHED -> más scoreAutoridad", async () => {
    const conVideos = await usuario();
    const sinVideos = await usuario();
    await prisma.video.create({
      data: { userId: conVideos, bunnyVideoId: "v1", status: "PUBLISHED" },
    });
    await prisma.video.create({
      data: { userId: conVideos, bunnyVideoId: "v2", status: "PUBLISHED" },
    });

    const r = await recalcularScoresAutoridad(prisma, { lote: 500, now: new Date() });
    expect(r.usuarios).toBe(2);

    const a = await prisma.user.findUniqueOrThrow({ where: { id: conVideos } });
    const b = await prisma.user.findUniqueOrThrow({ where: { id: sinVideos } });
    expect(a.scoreAutoridad).toBeGreaterThan(b.scoreAutoridad);
    expect(b.scoreAutoridad).toBe(0);
  });

  it("cursor rotatorio: con lote=1, dos barridos cubren los 2 usuarios y el 3o reinicia", async () => {
    await usuario();
    await usuario();

    expect((await recalcularScoresAutoridad(prisma, { lote: 1, now: new Date() })).usuarios).toBe(
      1,
    );
    expect((await recalcularScoresAutoridad(prisma, { lote: 1, now: new Date() })).usuarios).toBe(
      1,
    );
    const r3 = await recalcularScoresAutoridad(prisma, { lote: 1, now: new Date() });
    expect(r3.usuarios).toBe(0);
    expect(r3.reinicioUser).toBe(true);
  });
});
