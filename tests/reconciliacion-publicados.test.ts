/**
 * Reconciliacion Parte C (PUBLICADOS desaparecidos) — CON DIENTES.
 *  - decidirPublicado (pura): 404 tipado -> degradar; error transitorio -> reintentar; existe ->
 *    conservar. Si se rompe cada rama, el test cae.
 *  - Barrido INCREMENTAL: degrada SOLO los 404 (no los que existen ni los transitorios); FAILED/
 *    OBJETO_INEXISTENTE + AuditLog. dry-run NO muta. Idempotente. El TOPE de seguridad RELATIVO al lote
 *    aborta "actuar" si los candidatos lo superan. CURSOR ROTATORIO: avanza y persiste entre barridos,
 *    ACOTA el sondeo por ciclo y hace WRAP (cobertura completa del catalogo a lo largo de barridos).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";
import { generarHandle } from "../src/server/auth/handle";
import { BunnyNotFoundError, type ClienteBunny } from "../src/server/services/bunny";
import {
  decidirPublicado,
  reconciliarPublicadosDesaparecidos,
  RECON_PUBLICADOS_CURSOR_KEY,
} from "../src/server/services/reconciliacion-publicados";
import { leerEstado } from "../src/server/services/system-state";

import { createTestPrisma, resetDb } from "./helpers/db";

const CONFIG = { libraryId: "lib", apiKey: "key" };

/** Cliente Bunny falso: getVideo se comporta por bunnyVideoId segun el mapa; registra las llamadas. */
function clienteFake(
  mapa: Record<string, "existe" | "404" | "error">,
  calls?: string[],
): ClienteBunny {
  return {
    crearVideo: async () => ({ guid: "x" }),
    getVideo: async ({ videoId }) => {
      calls?.push(videoId);
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
  await prisma.user.create({ data: { id: "dueno", username: generarHandle(), passwordHash: "x" } });
});

async function crearPublicado(bunnyVideoId: string): Promise<string> {
  const v = await prisma.video.create({
    data: { userId: "dueno", bunnyVideoId, status: "PUBLISHED" },
    select: { id: true },
  });
  return v.id;
}

/** Los bunnyVideoId de los PUBLISHED, en el ORDEN por id (el mismo que recorre el barrido). */
async function ordenPorId(): Promise<string[]> {
  const filas = await prisma.video.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { id: "asc" },
    select: { bunnyVideoId: true },
  });
  return filas.map((f) => f.bunnyVideoId);
}

// lotePorCiclo grande: en estos tests el barrido cubre todo el catalogo en una sola pasada.
const OPTS = { lotePorCiclo: 500, topeFilas: 50, topePct: 0.2 as const };

describe("decidirPublicado (pura)", () => {
  it("404 -> degradar; transitorio -> reintentar; existe -> conservar", () => {
    expect(decidirPublicado("no-existe").accion).toBe("degradar");
    expect(decidirPublicado("error-transitorio").accion).toBe("reintentar");
    expect(decidirPublicado("existe").accion).toBe("conservar");
  });
});

describe("reconciliarPublicadosDesaparecidos: degradacion", () => {
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

  it("idempotente: un segundo barrido no re-degrada la fila ya FAILED", async () => {
    await crearPublicado("v-404");
    const cliente = clienteFake({ "v-404": "404" });
    await reconciliarPublicadosDesaparecidos(prisma, cliente, CONFIG, { ...OPTS, modo: "actuar" });
    const segundo = await reconciliarPublicadosDesaparecidos(prisma, cliente, CONFIG, {
      ...OPTS,
      modo: "actuar",
    });
    expect(segundo.revisados).toBe(0); // ya no hay PUBLISHED que revisar (es FAILED)
    expect(segundo.degradados).toBe(0);
    expect(await prisma.auditLog.count()).toBe(1); // solo la del primer barrido
  });
});

describe("reconciliarPublicadosDesaparecidos: tope de seguridad RELATIVO al lote", () => {
  it("lote mayoritariamente 404 -> aborta actuar, no degrada nada", async () => {
    // 5 sondeadas, todas 404. tope = min(50, ceil(5*0.2)) = 1. 5 > 1 -> aborta.
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

  it("1 huerfano entre muchos sanos -> NO aborta, degrada solo ese", async () => {
    // 10 sondeadas, 1 sola 404. tope = min(50, ceil(10*0.2)) = 2. 1 > 2 es falso -> procede.
    const mapa: Record<string, "existe" | "404"> = {};
    let idHuerfano = "";
    for (let i = 0; i < 10; i++) {
      const id = await crearPublicado(`v-${i}`);
      if (i === 4) {
        mapa[`v-${i}`] = "404";
        idHuerfano = id;
      } else mapa[`v-${i}`] = "existe";
    }
    const r = await reconciliarPublicadosDesaparecidos(prisma, clienteFake(mapa), CONFIG, {
      ...OPTS,
      modo: "actuar",
    });
    expect(r.abortadoPorTope).toBe(false);
    expect(r).toMatchObject({ modo: "actuar", revisados: 10, candidatos: 1, degradados: 1 });
    expect((await prisma.video.findUnique({ where: { id: idHuerfano } }))?.status).toBe("FAILED");
  });
});

describe("reconciliarPublicadosDesaparecidos: cursor rotatorio (escala)", () => {
  it("ACOTADO: nunca sonda mas de lotePorCiclo por barrido", async () => {
    for (let i = 0; i < 10; i++) await crearPublicado(`v-${i}`);
    const calls: string[] = [];
    const cli = clienteFake({}, calls); // todos "existe" por defecto
    const r = await reconciliarPublicadosDesaparecidos(prisma, cli, CONFIG, {
      ...OPTS,
      lotePorCiclo: 3,
      modo: "dry-run",
    });
    expect(r.revisados).toBe(3);
    expect(calls).toHaveLength(3); // no las 10
  });

  it("AVANZA y PERSISTE: el 2o barrido continua donde quedo el 1o", async () => {
    for (let i = 0; i < 4; i++) await crearPublicado(`v-${i}`);
    const orden = await ordenPorId(); // bunnyVideoId en orden de id
    const calls: string[] = [];
    const cli = clienteFake({}, calls);

    await reconciliarPublicadosDesaparecidos(prisma, cli, CONFIG, {
      ...OPTS,
      lotePorCiclo: 2,
      modo: "dry-run",
    });
    expect(calls).toEqual([orden[0], orden[1]]); // primeras 2 por id
    // El cursor persistido apunta al ultimo id sondeado (no vacio: aun queda tabla).
    expect(await leerEstado(prisma, RECON_PUBLICADOS_CURSOR_KEY)).toBeTruthy();

    calls.length = 0;
    await reconciliarPublicadosDesaparecidos(prisma, cli, CONFIG, {
      ...OPTS,
      lotePorCiclo: 2,
      modo: "dry-run",
    });
    expect(calls).toEqual([orden[2], orden[3]]); // continua, no reinicia
  });

  it("WRAP: con lotePorCiclo=2 y 5 PUBLISHED, 3 barridos cubren las 5 y el 4o vuelve al principio", async () => {
    for (let i = 0; i < 5; i++) await crearPublicado(`v-${i}`);
    const orden = await ordenPorId();
    const calls: string[] = [];
    const cli = clienteFake({}, calls);
    const barrido = () =>
      reconciliarPublicadosDesaparecidos(prisma, cli, CONFIG, {
        ...OPTS,
        lotePorCiclo: 2,
        modo: "dry-run",
      });

    await barrido(); // orden[0..1]
    await barrido(); // orden[2..3]
    const r3 = await barrido(); // orden[4] -> fin de tabla
    expect(new Set(calls)).toEqual(new Set(orden)); // las 5 distintas, cobertura completa
    expect(calls).toHaveLength(5); // sin repetir en la vuelta
    expect(r3.reinicioCursor).toBe(true);

    calls.length = 0;
    await barrido(); // wrap: vuelve al principio
    expect(calls[0]).toBe(orden[0]);
  });
});
