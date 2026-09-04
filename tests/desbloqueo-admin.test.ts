/**
 * DESBLOQUEAR (ADMIN) — el inverso de retirar, que no existía.
 *
 * Retirar una participación no tenía vuelta atrás: un error de moderación —o un caso que se revisa y
 * se acepta— vetaba al usuario de ese reto para siempre, y solo se arreglaba tocando la BD a mano.
 *
 * Con dientes: levanta el veto de verdad, NO republica el vídeo retirado, no toca lo que no debe
 * (participaciones vivas, o retiradas por su propio autor) y es idempotente.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";
import {
  desbloquearParticipacion,
  iniciarParticipacion,
  puedeParticipar,
  retirarParticipacion,
} from "../src/server/services/participacion";
import { generarPublicCode } from "../src/server/services/reto-codigo";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

let prisma: PrismaClient;
let challengeId: string;
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
  const admin = await crearUsuario(prisma);
  const reto = await prisma.challenge.create({
    data: {
      title: "Reto",
      slug: "reto",
      publicCode: generarPublicCode(),
      category: "fitness",
      status: "PUBLISHED",
      prizeCurrency: "USD",
      startsAt: new Date(Date.now() - 3_600_000),
      deadline: new Date(Date.now() + 86_400_000),
      createdById: admin,
    },
    select: { id: true },
  });
  challengeId = reto.id;
  userId = await crearUsuario(prisma);
});

async function participar() {
  n += 1;
  const r = await prisma.$transaction((tx) =>
    iniciarParticipacion(tx, { challengeId, userId, bunnyGuid: `g${n}`, title: `V${n}` }),
  );
  if (r.modo === "bloqueada") throw new Error("inesperado");
  await prisma.video.update({ where: { id: r.videoId }, data: { status: "PUBLISHED" } });
  await prisma.submission.update({ where: { id: r.submissionId }, data: { status: "PUBLISHED" } });
  return r;
}

describe("levantar el veto", () => {
  it("tras desbloquear, el usuario puede volver a participar", async () => {
    const p = await participar();
    await retirarParticipacion(prisma, p.submissionId);
    expect(await puedeParticipar(prisma, { challengeId, userId })).toEqual({ puede: false });

    expect(await desbloquearParticipacion(prisma, p.submissionId)).toEqual({ desbloqueada: true });

    expect(await puedeParticipar(prisma, { challengeId, userId })).toEqual({ puede: true });
    const segunda = await prisma.$transaction((tx) =>
      iniciarParticipacion(tx, { challengeId, userId, bunnyGuid: "g99", title: "V99" }),
    );
    expect(segunda.modo).toBe("primera");
  });

  it("NO republica el vídeo retirado: solo levanta el veto", async () => {
    const p = await participar();
    await retirarParticipacion(prisma, p.submissionId);

    await desbloquearParticipacion(prisma, p.submissionId);

    // El vídeo sigue REMOVED: revertir la decisión de moderación sería otra cosa, y más delicada.
    const v = await prisma.video.findUniqueOrThrow({
      where: { id: p.videoId },
      select: { status: true },
    });
    expect(v.status).toBe("REMOVED");
  });

  it("es idempotente: desbloquear dos veces no falla", async () => {
    const p = await participar();
    await retirarParticipacion(prisma, p.submissionId);

    expect(await desbloquearParticipacion(prisma, p.submissionId)).toEqual({ desbloqueada: true });
    expect(await desbloquearParticipacion(prisma, p.submissionId)).toEqual({ desbloqueada: false });
  });

  it("no deja votos apuntando a una participación que ya no existe", async () => {
    const p = await participar();
    const votante = await crearUsuario(prisma);
    await prisma.vote.create({
      data: { userId: votante, challengeId, submissionId: p.submissionId },
    });
    await retirarParticipacion(prisma, p.submissionId);

    await desbloquearParticipacion(prisma, p.submissionId);

    // `Vote` no tiene FK (desacoplado como los ledgers): sin limpiarlos aquí quedarían huérfanos.
    expect(await prisma.vote.count({ where: { submissionId: p.submissionId } })).toBe(0);
  });
});

describe("no toca lo que no debe", () => {
  it("una participación VIVA no se puede 'desbloquear' (sería destruir contenido publicado)", async () => {
    const p = await participar();

    expect(await desbloquearParticipacion(prisma, p.submissionId)).toEqual({ desbloqueada: false });
    expect(await prisma.submission.count({ where: { id: p.submissionId } })).toBe(1);
  });

  it("una retirada por el DUEÑO no tiene veto que levantar", async () => {
    const p = await participar();
    await prisma.submission.update({
      where: { id: p.submissionId },
      data: { status: "REMOVED", retiradaMotivo: "DUENO", retiradaEn: new Date() },
    });

    expect(await desbloquearParticipacion(prisma, p.submissionId)).toEqual({ desbloqueada: false });
    // Y no hacía falta: ese usuario ya podía volver.
    expect(await puedeParticipar(prisma, { challengeId, userId })).toEqual({ puede: true });
  });

  it("una submission inexistente no revienta", async () => {
    expect(await desbloquearParticipacion(prisma, "no-existe")).toEqual({ desbloqueada: false });
  });
});
