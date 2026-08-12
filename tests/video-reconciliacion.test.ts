/**
 * Reconciliacion de subidas ABANDONADAS — con DIENTES. Con BD (como confirm): mira las PENDING mas
 * VIEJAS que el umbral y las resuelve por transicion (rescate / incompleto / fallido), respeta
 * forward-only e idempotencia, deja PENDING ante error de RED (no 404) y —lo que importa— NO toca las
 * PENDING recientes (territorio del confirm). Bunny SIEMPRE via doble; ningun test lo toca de verdad.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";
import { BunnyNotFoundError, type ClienteBunny } from "../src/server/services/bunny";
import { reconciliarVideosAbandonados } from "../src/server/services/video-reconciliacion";

import { createTestPrisma, crearUsuario, resetDb } from "./helpers/db";

const CONFIG = { libraryId: "12345", apiKey: "APIKEY_FALSA_no_real" };
const MAX_SEG = 90;
const UMBRAL = 2 * 60 * 60 * 1000; // 2 h en el test (en prod: UMBRAL_ABANDONO_MS = TTL + 15 min)

function dobleBunny(getVideo: ClienteBunny["getVideo"]): ClienteBunny {
  return {
    crearVideo: async () => ({ guid: "no-usado" }),
    getVideo,
    // list/delete no se usan aqui (la reconciliacion Parte A no borra); stubs para satisfacer la
    // interfaz que la Parte B extendio.
    listVideos: async () => ({ items: [], totalItems: 0 }),
    deleteVideo: async () => {},
  };
}

describe("reconciliarVideosAbandonados (BD)", () => {
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

  const opts = (now?: Date) => ({ now, maxEdadMs: UMBRAL, lote: 100, maxSeg: MAX_SEG });
  const viejo = (): Date => new Date(Date.now() - 3 * 60 * 60 * 1000); // 3 h (> umbral 2 h)

  async function crearPending(bunnyVideoId: string, createdAt: Date): Promise<void> {
    const userId = await crearUsuario(prisma);
    await prisma.video.create({ data: { userId, bunnyVideoId, status: "PENDING", createdAt } });
  }

  it("RESCATE: PENDING vieja que Bunny reporta 4 (Finished) -> PUBLISHED con durationSec", async () => {
    await crearPending("g4", viejo());
    const r = await reconciliarVideosAbandonados(
      prisma,
      dobleBunny(async () => ({ status: 4, length: 42 })),
      CONFIG,
      opts(),
    );
    expect(r).toMatchObject({ revisados: 1, rescatados: 1, incompletos: 0, fallidos: 0 });
    expect(
      await prisma.video.findUnique({
        where: { bunnyVideoId: "g4" },
        select: { status: true, durationSec: true },
      }),
    ).toEqual({ status: "PUBLISHED", durationSec: 42 });
  });

  it("Bunny=5/6 (Error) -> FAILED TRANSCODE_ERROR (fallido, NO incompleto)", async () => {
    await crearPending("g5", viejo());
    const r = await reconciliarVideosAbandonados(
      prisma,
      dobleBunny(async () => ({ status: 5, length: 0 })),
      CONFIG,
      opts(),
    );
    expect(r).toMatchObject({ fallidos: 1, incompletos: 0, rescatados: 0 });
    expect(
      await prisma.video.findUnique({
        where: { bunnyVideoId: "g5" },
        select: { status: true, failureReason: true },
      }),
    ).toEqual({ status: "FAILED", failureReason: "TRANSCODE_ERROR" });
  });

  it("procesando (0-3) pasado el umbral -> FAILED UPLOAD_INCOMPLETE (la credencial ya caduco)", async () => {
    await crearPending("g2", viejo());
    const r = await reconciliarVideosAbandonados(
      prisma,
      dobleBunny(async () => ({ status: 2, length: 0 })),
      CONFIG,
      opts(),
    );
    expect(r).toMatchObject({ incompletos: 1, fallidos: 0, rescatados: 0 });
    expect(
      await prisma.video.findUnique({
        where: { bunnyVideoId: "g2" },
        select: { status: true, failureReason: true },
      }),
    ).toEqual({ status: "FAILED", failureReason: "UPLOAD_INCOMPLETE" });
  });

  it("404 (objeto inexistente en Bunny) -> FAILED UPLOAD_INCOMPLETE", async () => {
    await crearPending("g404", viejo());
    const r = await reconciliarVideosAbandonados(
      prisma,
      dobleBunny(async () => {
        throw new BunnyNotFoundError("g404");
      }),
      CONFIG,
      opts(),
    );
    expect(r).toMatchObject({ incompletos: 1, pendientes: 0 });
    expect(
      await prisma.video.findUnique({
        where: { bunnyVideoId: "g404" },
        select: { status: true, failureReason: true },
      }),
    ).toEqual({ status: "FAILED", failureReason: "UPLOAD_INCOMPLETE" });
  });

  it("error de RED (no 404) -> se deja PENDING, sin penalizar (se reintenta)", async () => {
    await crearPending("gnet", viejo());
    const r = await reconciliarVideosAbandonados(
      prisma,
      dobleBunny(async () => {
        throw new Error("timeout de red");
      }),
      CONFIG,
      opts(),
    );
    expect(r).toMatchObject({ pendientes: 1, incompletos: 0, fallidos: 0, rescatados: 0 });
    expect(
      (await prisma.video.findUnique({ where: { bunnyVideoId: "gnet" }, select: { status: true } }))
        ?.status,
    ).toBe("PENDING");
  });

  it("SEGURIDAD: una PENDING mas RECIENTE que el umbral NO entra en el barrido", async () => {
    // Reciente = createdAt hace 1 h (< umbral 2 h): es territorio del confirm; la reconciliacion NO
    // debe tocarla. DIENTES: si se quita el filtro createdAt<hasta del query, la veria y la marcaria
    // UPLOAD_INCOMPLETE (revisados=1) -> este assert se pondria ROJO.
    await crearPending("gnew", new Date(Date.now() - 1 * 60 * 60 * 1000));
    const r = await reconciliarVideosAbandonados(
      prisma,
      dobleBunny(async () => ({ status: 2, length: 0 })),
      CONFIG,
      opts(),
    );
    expect(r.revisados).toBe(0);
    expect(
      (await prisma.video.findUnique({ where: { bunnyVideoId: "gnew" }, select: { status: true } }))
        ?.status,
    ).toBe("PENDING");
  });

  it("IDEMPOTENTE: la segunda vuelta no re-toca (ya no esta en PENDING)", async () => {
    await crearPending("gidem", viejo());
    const cliente = dobleBunny(async () => ({ status: 4, length: 30 }));
    const r1 = await reconciliarVideosAbandonados(prisma, cliente, CONFIG, opts());
    const r2 = await reconciliarVideosAbandonados(prisma, cliente, CONFIG, opts());
    expect(r1.rescatados).toBe(1);
    expect(r2).toMatchObject({ revisados: 0, rescatados: 0 });
  });
});
