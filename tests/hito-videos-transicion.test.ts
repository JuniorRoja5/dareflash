/**
 * El HITO de vídeos cuelga de la TRANSICIÓN, no de uno de los barridos que la aplican.
 *
 * Un vídeo sale de PENDING en `aplicarTransicion`, y la llaman dos barridos: el sondeo de confirmación
 * y la reconciliación de subidas abandonadas (que RESCATA a PUBLISHED las que sí terminaron). El hito
 * vivía solo en el sondeo, así que un vídeo rescatado no sumaba su hito hasta la siguiente publicación
 * del usuario — y si no volvía a publicar, nunca. Estos tests lo cierran por los DOS caminos.
 *
 * Para romperlo: devolver la llamada a `otorgarHitosDeVideos` al sondeo -> el rescate no da puntos.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { POINTS, VIDEOS_POR_HITO } from "@/config/constants";
import type { PrismaClient } from "../src/generated/prisma/client";
import type { ClienteBunny } from "../src/server/services/bunny";
import { confirmarVideosPendientes } from "../src/server/services/video-confirmacion";
import { reconciliarVideosAbandonados } from "../src/server/services/video-reconciliacion";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

let prisma: PrismaClient;
let userId: string;
let n = 0;

beforeAll(() => {
  prisma = createTestPrisma();
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
  n = 0;
  userId = await crearUsuario(prisma);
});

const CONFIG = { libraryId: "12345", apiKey: "APIKEY_FALSA_no_real" };
/** Bunny dice "terminado, 30 s" para todo: la transición será PUBLISHED. */
const BUNNY_LISTO: ClienteBunny = {
  crearVideo: async () => ({ guid: "no-usado" }),
  getVideo: async () => ({ status: 4, length: 30, thumbnailFileName: null }),
  listVideos: async () => ({ items: [], totalItems: 0 }),
  deleteVideo: async () => {},
  setThumbnail: async () => {},
};

/** Deja al usuario a UN vídeo de su primer hito: VIDEOS_POR_HITO - 1 publicados. */
async function aUnoDelHito(): Promise<void> {
  for (let i = 0; i < VIDEOS_POR_HITO - 1; i += 1) {
    n += 1;
    await prisma.video.create({
      data: { userId, bunnyVideoId: `pub-${n}`, status: "PUBLISHED" },
    });
  }
}

async function videoPendiente(creado: Date): Promise<void> {
  n += 1;
  await prisma.video.create({
    data: { userId, bunnyVideoId: `pend-${n}`, status: "PENDING", createdAt: creado },
  });
}

const puntos = async (): Promise<number> =>
  (await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { pointsBalance: true } }))
    .pointsBalance;

describe("el hito de vídeos sale por CUALQUIER camino que publique", () => {
  it("por el sondeo de confirmación (el camino de siempre)", async () => {
    await aUnoDelHito();
    await videoPendiente(new Date());
    const r = await confirmarVideosPendientes(prisma, BUNNY_LISTO, CONFIG, {
      maxEdadMs: 3_600_000,
      lote: 10,
      maxSeg: 90,
    });
    expect(r.publicados).toBe(1);
    expect(await puntos()).toBe(POINTS.VIDEOS_PUBLICADOS_HITO);
  });

  it("por el RESCATE de la reconciliación (antes no sumaba)", async () => {
    await aUnoDelHito();
    await videoPendiente(new Date(Date.now() - 2 * 86_400_000));
    const r = await reconciliarVideosAbandonados(prisma, BUNNY_LISTO, CONFIG, {
      maxEdadMs: 3_600_000,
      lote: 10,
      maxSeg: 90,
    });
    expect(r.rescatados).toBe(1);
    expect(await puntos()).toBe(POINTS.VIDEOS_PUBLICADOS_HITO);
  });

  it("repasar el mismo vídeo no vuelve a pagar (la transición ya no ocurre)", async () => {
    await aUnoDelHito();
    await videoPendiente(new Date());
    const opts = { maxEdadMs: 3_600_000, lote: 10, maxSeg: 90 };
    await confirmarVideosPendientes(prisma, BUNNY_LISTO, CONFIG, opts);
    await confirmarVideosPendientes(prisma, BUNNY_LISTO, CONFIG, opts);
    expect(await puntos()).toBe(POINTS.VIDEOS_PUBLICADOS_HITO);
  });
});
