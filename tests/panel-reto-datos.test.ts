/**
 * DATOS de la gestión de un reto en el panel. Con dientes:
 *  - `metricasReto` cuenta de VERDAD contra la BD y distingue visible / en proceso / retirada; los
 *    votos se acotan a las visibles (los de una retirada no cuentan).
 *  - `listarParticipacionesAdmin` ve TODAS (esa es la diferencia con la pública, que solo ve las
 *    visibles): moderar exige ver lo que el público no ve.
 *  - el estado que se le da al admin se deriva bien, y solo un vídeo PUBLISHED es reproducible.
 *  - hereda el keyset de la lista pública (recorrido completo sin duplicados ni saltos).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { ModerationStatus, PrismaClient } from "../src/generated/prisma/client";
import { metricasReto } from "../src/server/services/panel-metricas";
import {
  listarParticipacionesAdmin,
  listarParticipacionesVisibles,
} from "../src/server/services/participaciones-lista";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

let prisma: PrismaClient;
let challengeId: string;
let contador = 0;

beforeAll(() => {
  prisma = createTestPrisma();
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
  contador = 0;
  const admin = await crearUsuario(prisma, { username: "adminpr" });
  const reto = await prisma.challenge.create({
    data: {
      title: "Reto",
      slug: "reto",
      publicCode: "retopr01",
      category: "fitness",
      status: "PUBLISHED",
      prizeCurrency: "USD",
      startsAt: new Date("2026-01-01T00:00:00Z"),
      deadline: new Date("2999-01-01T00:00:00Z"),
      createdById: admin,
    },
    select: { id: true },
  });
  challengeId = reto.id;
});

async function participar(opts: {
  videoStatus: ModerationStatus;
  subStatus: ModerationStatus;
  votos?: number;
}): Promise<{ userId: string; submissionId: string }> {
  contador += 1;
  const userId = await crearUsuario(prisma, { username: `pu${contador}` });
  const video = await prisma.video.create({
    data: {
      userId,
      bunnyVideoId: `bunny-p-${contador}`,
      status: opts.videoStatus,
      title: `V${contador}`,
    },
    select: { id: true },
  });
  const sub = await prisma.submission.create({
    data: {
      challengeId,
      userId,
      videoId: video.id,
      status: opts.subStatus,
      voteCount: opts.votos ?? 0,
    },
    select: { id: true },
  });
  return { userId, submissionId: sub.id };
}

describe("metricasReto", () => {
  it("cuenta cada estado por separado y NO infla ninguno", async () => {
    await participar({ videoStatus: "PUBLISHED", subStatus: "PUBLISHED", votos: 4 });
    await participar({ videoStatus: "PUBLISHED", subStatus: "PUBLISHED", votos: 6 });
    await participar({ videoStatus: "PENDING", subStatus: "PENDING" }); // en proceso
    await participar({ videoStatus: "REMOVED", subStatus: "REMOVED", votos: 99 }); // retirada
    await participar({ videoStatus: "FAILED", subStatus: "PENDING" }); // no publicada

    const m = await metricasReto(prisma, challengeId);

    expect(m.participaciones).toBe(5); // todas, en cualquier estado
    expect(m.participantes).toBe(5); // 5 personas distintas
    expect(m.visibles).toBe(2);
    expect(m.enProceso).toBe(1);
    expect(m.retiradas).toBe(1);
    // 4 + 6. Los 99 de la retirada NO se suman: para el público esa participación no existe.
    expect(m.votos).toBe(10);
  });

  it("un reto sin participaciones da ceros REALES (no hay dato que inventar)", async () => {
    const m = await metricasReto(prisma, challengeId);
    expect(m).toEqual({
      participaciones: 0,
      participantes: 0,
      visibles: 0,
      retiradas: 0,
      enProceso: 0,
      votos: 0,
    });
  });

  it("cuenta solo las de ESTE reto (otro reto no contamina sus métricas)", async () => {
    await participar({ videoStatus: "PUBLISHED", subStatus: "PUBLISHED", votos: 3 });

    const otroAdmin = await crearUsuario(prisma, { username: "otroadmin" });
    const otro = await prisma.challenge.create({
      data: {
        title: "Otro",
        slug: "otro",
        publicCode: "retopr02",
        category: "humor",
        status: "PUBLISHED",
        prizeCurrency: "USD",
        startsAt: new Date("2026-01-01T00:00:00Z"),
        deadline: new Date("2999-01-01T00:00:00Z"),
        createdById: otroAdmin,
      },
      select: { id: true },
    });
    const u = await crearUsuario(prisma, { username: "ajeno" });
    const v = await prisma.video.create({
      data: { userId: u, bunnyVideoId: "bunny-ajeno", status: "PUBLISHED" },
      select: { id: true },
    });
    await prisma.submission.create({
      data: {
        challengeId: otro.id,
        userId: u,
        videoId: v.id,
        status: "PUBLISHED",
        voteCount: 500,
      },
    });

    const m = await metricasReto(prisma, challengeId);
    expect(m.participaciones).toBe(1);
    expect(m.votos).toBe(3);
  });
});

describe("listarParticipacionesAdmin", () => {
  it("ve TODAS las participaciones, también las que el público NO ve", async () => {
    await participar({ videoStatus: "PUBLISHED", subStatus: "PUBLISHED", votos: 5 });
    await participar({ videoStatus: "PENDING", subStatus: "PENDING" });
    await participar({ videoStatus: "PUBLISHED", subStatus: "REMOVED" });

    const publica = await listarParticipacionesVisibles(prisma, challengeId);
    const panel = await listarParticipacionesAdmin(prisma, challengeId);

    expect(publica.items.length).toBe(1); // el público solo ve la publicada
    expect(panel.items.length).toBe(3); // el admin, las tres
  });

  it("traduce el estado a lo que el admin necesita leer", async () => {
    const visible = await participar({
      videoStatus: "PUBLISHED",
      subStatus: "PUBLISHED",
      votos: 9,
    });
    const proceso = await participar({ videoStatus: "PENDING", subStatus: "PENDING", votos: 8 });
    const fallida = await participar({ videoStatus: "FAILED", subStatus: "PENDING", votos: 7 });
    const retirada = await participar({ videoStatus: "REMOVED", subStatus: "REMOVED", votos: 6 });

    const { items } = await listarParticipacionesAdmin(prisma, challengeId);
    const porId = new Map(items.map((p) => [p.submissionId, p]));

    expect(porId.get(visible.submissionId)?.estado).toBe("visible");
    expect(porId.get(proceso.submissionId)?.estado).toBe("procesando");
    expect(porId.get(fallida.submissionId)?.estado).toBe("no-publicada");
    expect(porId.get(retirada.submissionId)?.estado).toBe("retirada");
  });

  it("REMOVED manda sobre el resto: una submission retirada con vídeo publicado sigue retirada", async () => {
    // El caso torcido: la Submission se retiró pero el Video quedó PUBLISHED. Si el estado se
    // derivara solo del vídeo, el panel diría "Visible" de algo que el público YA no ve.
    const p = await participar({ videoStatus: "PUBLISHED", subStatus: "REMOVED" });
    const { items } = await listarParticipacionesAdmin(prisma, challengeId);
    expect(items.find((i) => i.submissionId === p.submissionId)?.estado).toBe("retirada");
  });

  it("solo un vídeo PUBLISHED es reproducible (no se ofrece un play que daría 404)", async () => {
    await participar({ videoStatus: "PUBLISHED", subStatus: "PUBLISHED", votos: 3 });
    await participar({ videoStatus: "PENDING", subStatus: "PENDING", votos: 2 });
    await participar({ videoStatus: "REMOVED", subStatus: "REMOVED", votos: 1 });

    const { items } = await listarParticipacionesAdmin(prisma, challengeId);
    expect(items.map((p) => p.reproducible)).toEqual([true, false, false]);
  });

  it("pagina por cursor igual que la pública: recorrido completo, sin duplicados ni saltos", async () => {
    const esperados = new Set<string>();
    for (let i = 0; i < 5; i += 1) {
      // Mezcla de estados y votos EMPATADOS: el peor caso para el orden.
      const p = await participar({
        videoStatus: i % 2 === 0 ? "PUBLISHED" : "PENDING",
        subStatus: i % 2 === 0 ? "PUBLISHED" : "PENDING",
        votos: 4,
      });
      esperados.add(p.submissionId);
    }

    const vistos: string[] = [];
    let cursor: string | null = null;
    for (let vuelta = 0; vuelta < 20; vuelta += 1) {
      const pagina = await listarParticipacionesAdmin(prisma, challengeId, { cursor, limit: 2 });
      vistos.push(...pagina.items.map((p) => p.submissionId));
      if (pagina.nextCursor === null) break;
      cursor = pagina.nextCursor;
    }

    expect(vistos.length).toBe(5);
    expect(new Set(vistos)).toEqual(esperados);
  });
});
