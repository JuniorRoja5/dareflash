/**
 * Confirmacion de subida (sondeo) — con DIENTES. Puro: `decidirTransicion` (mapeo de estados de
 * Bunny + duracion) y `cadenciaConfirmMs`. Con BD (como los tests del worker): forward-only,
 * idempotencia, promocion, fallo de red, acotado por edad. Bunny SIEMPRE via doble (ningun test lo
 * toca de verdad). El invariante critico es FORWARD-ONLY: el poller solo promueve desde PENDING.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";
import type { ClienteBunny } from "../src/server/services/bunny";
import {
  aplicarTransicion,
  cadenciaConfirmMs,
  confirmarVideosPendientes,
  decidirTransicion,
} from "../src/server/services/video-confirmacion";

import { createTestPrisma, crearUsuario, resetDb } from "./helpers/db";

const CONFIG = { libraryId: "12345", apiKey: "APIKEY_FALSA_no_real" };
const MAX_SEG = 90;

/** Doble de Bunny: `getVideo` devuelve lo configurado; `crearVideo` no se usa aqui. */
function dobleBunny(getVideo: ClienteBunny["getVideo"]): ClienteBunny {
  return { crearVideo: async () => ({ guid: "no-usado" }), getVideo };
}

describe("decidirTransicion (puro)", () => {
  it("status 4: <=90 -> PUBLISHED (durationSec); >90 -> FAILED TOO_LONG", () => {
    expect(decidirTransicion(4, 90, MAX_SEG)).toEqual({ destino: "PUBLISHED", durationSec: 90 });
    expect(decidirTransicion(4, 42, MAX_SEG)).toEqual({ destino: "PUBLISHED", durationSec: 42 });
    expect(decidirTransicion(4, 91, MAX_SEG)).toEqual({
      destino: "FAILED",
      failureReason: "TOO_LONG",
    });
  });

  it("5/6 (Error/UploadFailed) -> FAILED TRANSCODE_ERROR", () => {
    expect(decidirTransicion(5, 0, MAX_SEG)).toEqual({
      destino: "FAILED",
      failureReason: "TRANSCODE_ERROR",
    });
    expect(decidirTransicion(6, 0, MAX_SEG)).toEqual({
      destino: "FAILED",
      failureReason: "TRANSCODE_ERROR",
    });
  });

  it("0-3 (procesando) -> PENDING", () => {
    for (const s of [0, 1, 2, 3]) {
      expect(decidirTransicion(s, 0, MAX_SEG)).toEqual({
        destino: "PENDING",
        espera: "procesando",
      });
    }
  });

  it("7/8 (JIT/Premium-off) -> PENDING inesperado: NO se publica adivinando el orden", () => {
    expect(decidirTransicion(7, 42, MAX_SEG)).toEqual({ destino: "PENDING", espera: "inesperado" });
    expect(decidirTransicion(8, 42, MAX_SEG)).toEqual({ destino: "PENDING", espera: "inesperado" });
  });
});

describe("cadenciaConfirmMs (puro)", () => {
  it("hubo pendientes -> activo; no -> reposo", () => {
    expect(cadenciaConfirmMs(true, 15, 300)).toBe(15);
    expect(cadenciaConfirmMs(false, 15, 300)).toBe(300);
  });
});

describe("confirmarVideosPendientes / aplicarTransicion (BD)", () => {
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

  const opts = (now?: Date) => ({ now, maxEdadMs: 6 * 60 * 60 * 1000, lote: 100, maxSeg: MAX_SEG });

  it("PENDING con Bunny=4 -> PUBLISHED con durationSec", async () => {
    const userId = await crearUsuario(prisma);
    await prisma.video.create({ data: { userId, bunnyVideoId: "g1", status: "PENDING" } });

    const r = await confirmarVideosPendientes(
      prisma,
      dobleBunny(async () => ({ status: 4, length: 42 })),
      CONFIG,
      opts(),
    );

    expect(r).toMatchObject({ revisados: 1, publicados: 1, fallidos: 0, pendientes: 0 });
    const v = await prisma.video.findUnique({
      where: { bunnyVideoId: "g1" },
      select: { status: true, durationSec: true },
    });
    expect(v).toEqual({ status: "PUBLISHED", durationSec: 42 });
  });

  it("Bunny=5 -> FAILED TRANSCODE_ERROR; Bunny=4 length>90 -> FAILED TOO_LONG", async () => {
    const userId = await crearUsuario(prisma);
    await prisma.video.create({ data: { userId, bunnyVideoId: "err", status: "PENDING" } });
    await prisma.video.create({ data: { userId, bunnyVideoId: "long", status: "PENDING" } });

    const cliente = dobleBunny(async ({ videoId }) =>
      videoId === "err" ? { status: 5, length: 0 } : { status: 4, length: 120 },
    );
    const r = await confirmarVideosPendientes(prisma, cliente, CONFIG, opts());

    expect(r.fallidos).toBe(2);
    expect(
      await prisma.video.findUnique({
        where: { bunnyVideoId: "err" },
        select: { status: true, failureReason: true },
      }),
    ).toEqual({ status: "FAILED", failureReason: "TRANSCODE_ERROR" });
    expect(
      await prisma.video.findUnique({
        where: { bunnyVideoId: "long" },
        select: { status: true, failureReason: true },
      }),
    ).toEqual({ status: "FAILED", failureReason: "TOO_LONG" });
  });

  it("IDEMPOTENTE: la segunda vuelta no republica (ya no esta en PENDING)", async () => {
    const userId = await crearUsuario(prisma);
    await prisma.video.create({ data: { userId, bunnyVideoId: "g1", status: "PENDING" } });
    const cliente = dobleBunny(async () => ({ status: 4, length: 30 }));

    const r1 = await confirmarVideosPendientes(prisma, cliente, CONFIG, opts());
    const r2 = await confirmarVideosPendientes(prisma, cliente, CONFIG, opts());

    expect(r1.publicados).toBe(1);
    expect(r2).toMatchObject({ revisados: 0, publicados: 0 });
  });

  it("FORWARD-ONLY: el barrido no incluye un video REMOVED (solo sondea PENDING)", async () => {
    const userId = await crearUsuario(prisma);
    await prisma.video.create({ data: { userId, bunnyVideoId: "rem", status: "REMOVED" } });

    const r = await confirmarVideosPendientes(
      prisma,
      dobleBunny(async () => ({ status: 4, length: 30 })),
      CONFIG,
      opts(),
    );

    expect(r.revisados).toBe(0);
    expect(
      (await prisma.video.findUnique({ where: { bunnyVideoId: "rem" }, select: { status: true } }))
        ?.status,
    ).toBe("REMOVED");
  });

  it("FORWARD-ONLY (guard del UPDATE): aplicarTransicion sobre un REMOVED es no-op", async () => {
    const userId = await crearUsuario(prisma);
    const v = await prisma.video.create({
      data: { userId, bunnyVideoId: "rem2", status: "REMOVED" },
      select: { id: true },
    });

    const count = await aplicarTransicion(prisma, v.id, { destino: "PUBLISHED", durationSec: 30 });

    expect(count).toBe(0); // el where exige status=PENDING: el poller JAMAS pisa una moderacion
    expect(
      (await prisma.video.findUnique({ where: { id: v.id }, select: { status: true } }))?.status,
    ).toBe("REMOVED");
  });

  it("getVideo falla (red) -> el video se deja PENDING, sin penalizar", async () => {
    const userId = await crearUsuario(prisma);
    await prisma.video.create({ data: { userId, bunnyVideoId: "net", status: "PENDING" } });
    const cliente = dobleBunny(async () => {
      throw new Error("timeout de red");
    });

    const r = await confirmarVideosPendientes(prisma, cliente, CONFIG, opts());

    expect(r).toMatchObject({ revisados: 1, publicados: 0, fallidos: 0, pendientes: 1 });
    expect(
      (await prisma.video.findUnique({ where: { bunnyVideoId: "net" }, select: { status: true } }))
        ?.status,
    ).toBe("PENDING");
  });

  it("acota por edad: un PENDING mas viejo que maxEdad no se sondea (lo hereda la reconciliacion)", async () => {
    const userId = await crearUsuario(prisma);
    const viejo = new Date(Date.now() - 7 * 60 * 60 * 1000); // 7 h (> 6 h)
    await prisma.video.create({
      data: { userId, bunnyVideoId: "old", status: "PENDING", createdAt: viejo },
    });

    const r = await confirmarVideosPendientes(
      prisma,
      dobleBunny(async () => ({ status: 4, length: 30 })),
      CONFIG,
      opts(),
    );

    expect(r.revisados).toBe(0);
    expect(
      (await prisma.video.findUnique({ where: { bunnyVideoId: "old" }, select: { status: true } }))
        ?.status,
    ).toBe("PENDING");
  });
});
