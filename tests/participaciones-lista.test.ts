/**
 * Participaciones del detalle (2d). Con dientes:
 *  - REGLA DEL MÁS RESTRICTIVO: solo se ven las Submission PUBLISHED con Video PUBLISHED. Una Submission
 *    PUBLISHED con Video PENDING (o al revés) NO asoma.
 *  - orden por voteCount desc (a igualdad, más nuevas primero).
 *  - miParticipacion refleja el estado del vídeo del usuario (publicada/procesando/fallida).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { ModerationStatus, PrismaClient } from "../src/generated/prisma/client";
import {
  listarParticipacionesVisibles,
  miParticipacion,
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
  const admin = await crearUsuario(prisma, { username: "adminp" });
  const reto = await prisma.challenge.create({
    data: {
      title: "Reto",
      slug: "reto",
      publicCode: "retop001",
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

/** Crea usuario + su participación (Video con `videoStatus`, Submission con `subStatus`, votos). */
async function participar(opts: {
  videoStatus: ModerationStatus;
  subStatus: ModerationStatus;
  votos?: number;
  username?: string;
}): Promise<{ userId: string; submissionId: string }> {
  contador += 1;
  const userId = await crearUsuario(prisma, { username: opts.username ?? `u${contador}` });
  const video = await prisma.video.create({
    data: {
      userId,
      bunnyVideoId: `bunny-${contador}`,
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

describe("listarParticipacionesVisibles", () => {
  it("solo Submission PUBLISHED + Video PUBLISHED; el resto NO asoma", async () => {
    const visible = await participar({
      videoStatus: "PUBLISHED",
      subStatus: "PUBLISHED",
      votos: 5,
    });
    await participar({ videoStatus: "PENDING", subStatus: "PUBLISHED" }); // vídeo no listo -> fuera
    await participar({ videoStatus: "PUBLISHED", subStatus: "PENDING" }); // submission no publicada -> fuera
    await participar({ videoStatus: "PUBLISHED", subStatus: "REMOVED" }); // retirada -> fuera

    const lista = await listarParticipacionesVisibles(prisma, challengeId);
    expect(lista.map((p) => p.submissionId)).toEqual([visible.submissionId]);
  });

  it("ordena por voteCount desc (a igualdad, más nuevas primero)", async () => {
    const a = await participar({ videoStatus: "PUBLISHED", subStatus: "PUBLISHED", votos: 3 });
    const b = await participar({ videoStatus: "PUBLISHED", subStatus: "PUBLISHED", votos: 10 });
    const c = await participar({ videoStatus: "PUBLISHED", subStatus: "PUBLISHED", votos: 7 });

    const lista = await listarParticipacionesVisibles(prisma, challengeId);
    expect(lista.map((p) => p.submissionId)).toEqual([
      b.submissionId,
      c.submissionId,
      a.submissionId,
    ]);
    expect(lista.map((p) => p.votos)).toEqual([10, 7, 3]);
  });
});

describe("miParticipacion", () => {
  it("refleja el estado del vídeo (publicada / procesando / fallida) o null si no participa", async () => {
    const pub = await participar({ videoStatus: "PUBLISHED", subStatus: "PUBLISHED" });
    expect((await miParticipacion(prisma, challengeId, pub.userId))?.estado).toBe("publicada");

    const pend = await participar({ videoStatus: "PENDING", subStatus: "PENDING" });
    expect((await miParticipacion(prisma, challengeId, pend.userId))?.estado).toBe("procesando");

    const fail = await participar({ videoStatus: "FAILED", subStatus: "PENDING" });
    expect((await miParticipacion(prisma, challengeId, fail.userId))?.estado).toBe("fallida");

    const sinParticipar = await crearUsuario(prisma, { username: "nadie" });
    expect(await miParticipacion(prisma, challengeId, sinParticipar)).toBeNull();
  });
});
