import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";
import { castVote } from "../src/server/services/votes";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

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

/** Crea reto + video + submission y devuelve sus ids. */
async function crearSubmission(prisma: PrismaClient) {
  const autor = await crearUsuario(prisma);
  const challenge = await prisma.challenge.create({
    data: {
      title: "Reto test",
      category: "TEST",
      prizeCurrency: "USD",
      startsAt: new Date(),
      deadline: new Date(Date.now() + 86_400_000),
      createdById: autor,
    },
    select: { id: true },
  });
  const video = await prisma.video.create({
    data: { userId: autor, bunnyVideoId: `bunny-${challenge.id}` },
    select: { id: true },
  });
  const submission = await prisma.submission.create({
    data: { challengeId: challenge.id, userId: autor, videoId: video.id },
    select: { id: true },
  });
  return { challengeId: challenge.id, submissionId: submission.id };
}

describe("voto", () => {
  it("dos votos simultaneos del mismo usuario a la misma submission: uno gana, voteCount sube 1", async () => {
    const { challengeId, submissionId } = await crearSubmission(prisma);
    const votante = await crearUsuario(prisma);

    const [a, b] = await Promise.all([
      castVote(prisma, { userId: votante, submissionId, challengeId }),
      castVote(prisma, { userId: votante, submissionId, challengeId }),
    ]);

    // Uno vota; el otro recibe ALREADY_VOTED (violacion de unicidad).
    expect([a.voted, b.voted].filter(Boolean)).toHaveLength(1);
    expect([a, b].some((r) => !r.voted && r.reason === "ALREADY_VOTED")).toBe(true);

    const votos = await prisma.vote.count({ where: { userId: votante, submissionId } });
    const submission = await prisma.submission.findUniqueOrThrow({
      where: { id: submissionId },
      select: { voteCount: true },
    });
    expect(votos).toBe(1); // una sola fila de voto
    expect(submission.voteCount).toBe(1); // el contador subio exactamente uno
  });

  it("usuarios distintos votando la misma submission concurrentemente: voteCount = numero de votantes", async () => {
    const { challengeId, submissionId } = await crearSubmission(prisma);
    const votantes = await Promise.all(Array.from({ length: 15 }, () => crearUsuario(prisma)));

    await Promise.all(
      votantes.map((userId) => castVote(prisma, { userId, submissionId, challengeId })),
    );

    const submission = await prisma.submission.findUniqueOrThrow({
      where: { id: submissionId },
      select: { voteCount: true },
    });
    const votos = await prisma.vote.count({ where: { submissionId } });
    expect(votos).toBe(15);
    expect(submission.voteCount).toBe(15);
  });
});
