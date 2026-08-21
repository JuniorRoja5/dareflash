/**
 * Retirar participación (2e). Con dientes: retirar marca Submission Y Video REMOVED -> desaparece del
 * reto (listarParticipacionesVisibles), y PRESERVA el objeto en Bunny (NO encola BUNNY_DELETE_VIDEO).
 * Idempotente. Un id inexistente -> retirada:false.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";
import { retirarParticipacion } from "../src/server/services/participacion";
import { listarParticipacionesVisibles } from "../src/server/services/participaciones-lista";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

let prisma: PrismaClient;
let challengeId: string;

beforeAll(() => {
  prisma = createTestPrisma();
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
  const admin = await crearUsuario(prisma, { username: "adminr" });
  const reto = await prisma.challenge.create({
    data: {
      title: "Reto",
      slug: "reto",
      publicCode: "retor001",
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

async function participacionPublicada(username: string) {
  const userId = await crearUsuario(prisma, { username });
  const video = await prisma.video.create({
    data: { userId, bunnyVideoId: `bunny-${username}`, status: "PUBLISHED", title: "V" },
    select: { id: true, bunnyVideoId: true },
  });
  const sub = await prisma.submission.create({
    data: { challengeId, userId, videoId: video.id, status: "PUBLISHED" },
    select: { id: true },
  });
  return { submissionId: sub.id, videoId: video.id, bunnyVideoId: video.bunnyVideoId };
}

describe("retirarParticipacion", () => {
  it("marca Submission y Video REMOVED, desaparece del reto y PRESERVA Bunny (sin encolar delete)", async () => {
    const p = await participacionPublicada("victima");

    // Antes: visible.
    expect((await listarParticipacionesVisibles(prisma, challengeId)).length).toBe(1);

    const r = await retirarParticipacion(prisma, p.submissionId);
    expect(r.retirada).toBe(true);

    // Después: fuera del reto.
    expect((await listarParticipacionesVisibles(prisma, challengeId)).length).toBe(0);

    const sub = await prisma.submission.findUnique({
      where: { id: p.submissionId },
      select: { status: true },
    });
    const vid = await prisma.video.findUnique({
      where: { id: p.videoId },
      select: { status: true },
    });
    expect(sub?.status).toBe("REMOVED");
    expect(vid?.status).toBe("REMOVED");

    // PRESERVACIÓN: NO se encoló borrado en Bunny (a diferencia del borrado del dueño).
    expect(await prisma.job.count({ where: { type: "BUNNY_DELETE_VIDEO" } })).toBe(0);
  });

  it("idempotente: retirar dos veces no rompe ni encola nada", async () => {
    const p = await participacionPublicada("victima2");
    await retirarParticipacion(prisma, p.submissionId);
    const r2 = await retirarParticipacion(prisma, p.submissionId);
    expect(r2.retirada).toBe(true);
    expect(await prisma.job.count({ where: { type: "BUNNY_DELETE_VIDEO" } })).toBe(0);
  });

  it("id inexistente -> retirada:false", async () => {
    expect(await retirarParticipacion(prisma, "no-existe")).toEqual({ retirada: false });
  });
});
