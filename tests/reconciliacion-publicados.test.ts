/**
 * Reconciliacion Parte C (PUBLICADOS desaparecidos) — CON DIENTES.
 *  - decidirPublicado (pura): 404 tipado -> degradar; error transitorio -> reintentar; existe ->
 *    conservar. Si se rompe cada rama, el test cae.
 *  - Barrido: degrada SOLO los 404 (no los que existen ni los transitorios); FAILED/OBJETO_INEXISTENTE
 *    + AuditLog. dry-run NO muta. Idempotente (segundo barrido no re-selecciona los ya FAILED). El
 *    TOPE de seguridad aborta el modo actuar si los candidatos lo superan.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";
import { BunnyNotFoundError, type ClienteBunny } from "../src/server/services/bunny";
import {
  decidirPublicado,
  reconciliarPublicadosDesaparecidos,
} from "../src/server/services/reconciliacion-publicados";

import { createTestPrisma, resetDb } from "./helpers/db";

const CONFIG = { libraryId: "lib", apiKey: "key" };

/** Cliente Bunny falso: getVideo se comporta por bunnyVideoId segun el mapa (existe/404/error). */
function clienteFake(mapa: Record<string, "existe" | "404" | "error">): ClienteBunny {
  return {
    crearVideo: async () => ({ guid: "x" }),
    getVideo: async ({ videoId }) => {
      const c = mapa[videoId] ?? "existe";
      if (c === "404") throw new BunnyNotFoundError(videoId);
      if (c === "error") throw new Error("red caida");
      return { status: 4, length: 10 };
    },
    listVideos: async () => ({ items: [], totalItems: 0 }),
    deleteVideo: async () => {},
  };
}

let prisma: PrismaClient;

beforeAll(() => {
  prisma = createTestPrisma();
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
  await prisma.user.create({ data: { id: "dueno", passwordHash: "x" } });
});

async function crearPublicado(bunnyVideoId: string): Promise<string> {
  const v = await prisma.video.create({
    data: { userId: "dueno", bunnyVideoId, status: "PUBLISHED" },
    select: { id: true },
  });
  return v.id;
}

const OPTS = { lote: 200, topeFilas: 50, topePct: 0.2 as const };

describe("decidirPublicado (pura)", () => {
  it("404 -> degradar; transitorio -> reintentar; existe -> conservar", () => {
    expect(decidirPublicado("no-existe").accion).toBe("degradar");
    expect(decidirPublicado("error-transitorio").accion).toBe("reintentar");
    expect(decidirPublicado("existe").accion).toBe("conservar");
  });
});

describe("reconciliarPublicadosDesaparecidos", () => {
  it("actuar: degrada SOLO el 404; el que existe y el transitorio siguen PUBLISHED", async () => {
    const id404 = await crearPublicado("v-404");
    const idOk = await crearPublicado("v-ok");
    const idErr = await crearPublicado("v-err");
    const cliente = clienteFake({ "v-404": "404", "v-ok": "existe", "v-err": "error" });

    const r = await reconciliarPublicadosDesaparecidos(prisma, cliente, CONFIG, {
      ...OPTS,
      modo: "actuar",
    });
    expect(r).toMatchObject({ modo: "actuar", candidatos: 1, degradados: 1, reintentos: 1 });

    const v404 = await prisma.video.findUnique({ where: { id: id404 } });
    expect(v404?.status).toBe("FAILED");
    expect(v404?.failureReason).toBe("OBJETO_INEXISTENTE");
    expect((await prisma.video.findUnique({ where: { id: idOk } }))?.status).toBe("PUBLISHED");
    expect((await prisma.video.findUnique({ where: { id: idErr } }))?.status).toBe("PUBLISHED");

    const audit = await prisma.auditLog.findMany({ where: { action: "VIDEO_OBJETO_INEXISTENTE" } });
    expect(audit).toHaveLength(1);
    expect(audit[0]?.targetId).toBe(id404);
  });

  it("dry-run: NO muta nada aunque haya candidatos", async () => {
    const id404 = await crearPublicado("v-404");
    const r = await reconciliarPublicadosDesaparecidos(
      prisma,
      clienteFake({ "v-404": "404" }),
      CONFIG,
      {
        ...OPTS,
        modo: "dry-run",
      },
    );
    expect(r).toMatchObject({ modo: "dry-run", candidatos: 1, degradados: 0 });
    expect((await prisma.video.findUnique({ where: { id: id404 } }))?.status).toBe("PUBLISHED");
    expect(await prisma.auditLog.count()).toBe(0);
  });

  it("idempotente: un segundo barrido no re-selecciona la fila ya FAILED", async () => {
    await crearPublicado("v-404");
    const cliente = clienteFake({ "v-404": "404" });
    await reconciliarPublicadosDesaparecidos(prisma, cliente, CONFIG, { ...OPTS, modo: "actuar" });
    const segundo = await reconciliarPublicadosDesaparecidos(prisma, cliente, CONFIG, {
      ...OPTS,
      modo: "actuar",
    });
    expect(segundo.revisados).toBe(0); // ya no hay PUBLISHED que revisar
    expect(segundo.degradados).toBe(0);
    expect(await prisma.auditLog.count()).toBe(1); // solo la del primer barrido
  });

  it("TOPE de seguridad: candidatos > tope -> aborta actuar, no degrada nada", async () => {
    // 5 PUBLISHED, todas 404. tope = min(50, ceil(5*0.2)) = 1. 5 > 1 -> aborta.
    const ids: string[] = [];
    const mapa: Record<string, "404"> = {};
    for (let i = 0; i < 5; i++) {
      ids.push(await crearPublicado(`v-${i}`));
      mapa[`v-${i}`] = "404";
    }
    const r = await reconciliarPublicadosDesaparecidos(prisma, clienteFake(mapa), CONFIG, {
      ...OPTS,
      modo: "actuar",
    });
    expect(r.abortadoPorTope).toBe(true);
    expect(r.modo).toBe("dry-run"); // el resumen refleja que quedo en dry-run
    expect(r.degradados).toBe(0);
    for (const id of ids) {
      expect((await prisma.video.findUnique({ where: { id } }))?.status).toBe("PUBLISHED");
    }
    expect(await prisma.auditLog.count()).toBe(0);
  });
});
