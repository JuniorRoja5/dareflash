/**
 * Limpieza de HUERFANOS en Bunny (Parte B, DESTRUCTIVA) — con DIENTES. `decidirHuerfano` es PURA
 * (sin BD ni Bunny): las REGLAS DE SEGURIDAD que impiden borrar un video VIVO. El barrido se prueba
 * con un doble de cliente (deleteVideo espiado) + BD: en dry-run NO borra NADA; en borrar solo borra
 * los candidatos, jamas los conservados.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";
import type { ClienteBunny } from "../src/server/services/bunny";
import {
  decidirHuerfano,
  limpiarHuerfanosBunny,
} from "../src/server/services/reconciliacion-huerfanos";

import { createTestPrisma, crearUsuario, resetDb } from "./helpers/db";

const GRACIA = 24 * 60 * 60 * 1000; // 24 h
const UMBRAL = 2 * 60 * 60 * 1000; // 2 h
const DEC_OPTS = { graciaMs: GRACIA, umbralAbandonoMs: UMBRAL };

describe("decidirHuerfano (puro)", () => {
  const now = new Date("2026-08-12T00:00:00.000Z");
  const obj = (dateUploaded: string) => ({ guid: "g", dateUploaded });

  it("SEGURIDAD: PENDING y PUBLISHED SIEMPRE se conservan (borrar un vivo = perder un video)", () => {
    // updatedAt muy viejo a proposito: aun asi NO se borra. DIENTES: si se quita la guarda de PENDING
    // o de PUBLISHED, caeria a la rama FAILED (edad > gracia) -> "borrar" -> este assert en ROJO.
    expect(
      decidirHuerfano(
        obj(now.toISOString()),
        { status: "PENDING", updatedAt: new Date(0) },
        now,
        DEC_OPTS,
      ).accion,
    ).toBe("conservar");
    expect(
      decidirHuerfano(
        obj(now.toISOString()),
        { status: "PUBLISHED", updatedAt: new Date(0) },
        now,
        DEC_OPTS,
      ).accion,
    ).toBe("conservar");
  });

  it("REJECTED/REMOVED -> conservar (moderacion, fuera de alcance)", () => {
    for (const s of ["REJECTED", "REMOVED"] as const) {
      expect(
        decidirHuerfano(
          obj(now.toISOString()),
          { status: s, updatedAt: new Date(0) },
          now,
          DEC_OPTS,
        ).accion,
      ).toBe("conservar");
    }
  });

  it("FAILED: pasada la gracia -> borrar; reciente -> conservar", () => {
    const viejo = new Date(now.getTime() - 25 * 60 * 60 * 1000); // 25 h > 24 h
    const reciente = new Date(now.getTime() - 1 * 60 * 60 * 1000); // 1 h < 24 h
    expect(
      decidirHuerfano(obj(now.toISOString()), { status: "FAILED", updatedAt: viejo }, now, DEC_OPTS)
        .accion,
    ).toBe("borrar");
    expect(
      decidirHuerfano(
        obj(now.toISOString()),
        { status: "FAILED", updatedAt: reciente },
        now,
        DEC_OPTS,
      ).accion,
    ).toBe("conservar");
  });

  it("SIN fila: objeto viejo -> borrar (huerfano); reciente -> conservar (ventana ruta->fila)", () => {
    const viejo = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString(); // 3 h > 2 h
    const reciente = new Date(now.getTime() - 30 * 60 * 1000).toISOString(); // 30 min < 2 h
    expect(decidirHuerfano(obj(viejo), null, now, DEC_OPTS).accion).toBe("borrar");
    expect(decidirHuerfano(obj(reciente), null, now, DEC_OPTS).accion).toBe("conservar");
  });
});

/** Doble de cliente: `listVideos` configurable; `deleteVideo` ESPIADO (registra los guids borrados). */
function dobleCliente(listVideos: ClienteBunny["listVideos"]): {
  cliente: ClienteBunny;
  borrados: string[];
} {
  const borrados: string[] = [];
  const cliente: ClienteBunny = {
    crearVideo: async () => ({ guid: "no-usado" }),
    getVideo: async () => ({ status: 0, length: 0 }),
    listVideos,
    deleteVideo: async ({ videoId }) => {
      borrados.push(videoId);
    },
    setThumbnail: async () => {},
    purgeUrl: async () => {},
  };
  return { cliente, borrados };
}

/** Una sola pagina con estos items (totalItems = numero de items). */
function unaPagina(
  items: { guid: string; status: number; dateUploaded: string }[],
): ClienteBunny["listVideos"] {
  return async ({ page }) =>
    page === 1 ? { items, totalItems: items.length } : { items: [], totalItems: items.length };
}

describe("limpiarHuerfanosBunny (BD + doble)", () => {
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

  const CONFIG = { libraryId: "12345", apiKey: "APIKEY_FALSA_no_real" };
  const now = new Date();
  const opts = (modo: "dry-run" | "borrar") => ({
    now,
    modo,
    perPage: 100,
    graciaMs: GRACIA,
    umbralAbandonoMs: UMBRAL,
  });
  const viejo = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString(); // 3 h > umbral 2 h

  it("DRY-RUN: hay candidatos pero deleteVideo NO se llama NI UNA vez", async () => {
    const { cliente, borrados } = dobleCliente(
      unaPagina([{ guid: "huerfano", status: 4, dateUploaded: viejo }]),
    );
    const r = await limpiarHuerfanosBunny(prisma, cliente, CONFIG, opts("dry-run"));
    expect(r).toMatchObject({ modo: "dry-run", revisados: 1, candidatos: 1, borrados: 0 });
    expect(borrados).toEqual([]); // NUNCA se borro nada
  });

  it("BORRAR: deleteVideo se llama SOLO para los candidatos (no para los conservados)", async () => {
    const reciente = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
    // "vivo" tiene fila PUBLISHED -> conservar; "huerfano" sin fila y viejo -> borrar; "nuevo" sin
    // fila pero reciente -> conservar (ventana ruta->fila).
    const userId = await crearUsuario(prisma);
    await prisma.video.create({ data: { userId, bunnyVideoId: "vivo", status: "PUBLISHED" } });
    const { cliente, borrados } = dobleCliente(
      unaPagina([
        { guid: "vivo", status: 4, dateUploaded: viejo },
        { guid: "huerfano", status: 4, dateUploaded: viejo },
        { guid: "nuevo", status: 0, dateUploaded: reciente },
      ]),
    );

    const r = await limpiarHuerfanosBunny(prisma, cliente, CONFIG, opts("borrar"));

    expect(borrados).toEqual(["huerfano"]); // solo el candidato
    expect(r).toMatchObject({
      modo: "borrar",
      revisados: 3,
      candidatos: 1,
      borrados: 1,
      conservados: 2,
    });
  });
});
