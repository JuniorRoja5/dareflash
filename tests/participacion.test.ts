/**
 * Participación (2b) — el núcleo, con dientes (BD):
 *  - @@unique respetado: un REEMPLAZO NO crea una 2ª Submission; crea un Video con reemplazaSubmissionId.
 *  - el viejo se borra SOLO tras PUBLISHED del nuevo (completarReemplazo no actúa si el nuevo no está
 *    PUBLISHED; cuando lo está: repunta, marca el viejo REMOVED y encola BUNNY_DELETE_VIDEO). Idempotente.
 *  - reemplazo abandonado -> la "reconciliación" (publicarParticipacionSiProcede, que llama el worker)
 *    lo completa igual.
 *  - Video FAILED = hueco inválido -> permite reintentar (limpia el fallido, crea fresco).
 *  - Video REMOVED (retirado) -> bloqueada (no re-participa).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { ModerationStatus, PrismaClient } from "../src/generated/prisma/client";
import {
  completarReemplazo,
  iniciarParticipacion,
  publicarParticipacionSiProcede,
} from "../src/server/services/participacion";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

let prisma: PrismaClient;
let userId: string;
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
  userId = await crearUsuario(prisma, { username: "participante" });
  const admin = await crearUsuario(prisma, { username: "adminreto" });
  const reto = await prisma.challenge.create({
    data: {
      title: "Reto",
      slug: "reto",
      publicCode: "reto0001",
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

const guid = () => `guid-${++contador}`;
const iniciar = () =>
  iniciarParticipacion(prisma, { challengeId, userId, bunnyGuid: guid(), title: null });
const contarSubmissions = () => prisma.submission.count({ where: { challengeId, userId } });
const setVideo = (id: string, status: ModerationStatus) =>
  prisma.video.update({ where: { id }, data: { status } });

describe("iniciarParticipacion", () => {
  it("primera participación: crea Video + Submission (PENDING) y reserva el hueco", async () => {
    const r = await iniciar();
    expect(r.modo).toBe("primera");
    if (r.modo === "bloqueada") throw new Error("inesperado");
    expect(await contarSubmissions()).toBe(1);
    const sub = await prisma.submission.findUnique({
      where: { id: r.submissionId },
      select: { status: true, videoId: true },
    });
    expect(sub?.status).toBe("PENDING");
    expect(sub?.videoId).toBe(r.videoId);
  });

  it("DIENTES @@unique: con participación viva (PUBLISHED) -> REEMPLAZO, sin 2ª Submission", async () => {
    const primera = await iniciar();
    if (primera.modo === "bloqueada") throw new Error("inesperado");
    await setVideo(primera.videoId, "PUBLISHED");

    const rep = await iniciar();
    expect(rep.modo).toBe("reemplazo");
    if (rep.modo === "bloqueada") throw new Error("inesperado");
    // NO hay 2ª Submission (el unique se respeta); sigue habiendo UNA.
    expect(await contarSubmissions()).toBe(1);
    expect(rep.submissionId).toBe(primera.submissionId); // apunta a la misma
    const nuevo = await prisma.video.findUnique({
      where: { id: rep.videoId },
      select: { reemplazaSubmissionId: true },
    });
    expect(nuevo?.reemplazaSubmissionId).toBe(primera.submissionId);
  });

  it("Video FAILED = hueco inválido -> permite reintentar (limpia el fallido, crea fresco)", async () => {
    const primera = await iniciar();
    if (primera.modo === "bloqueada") throw new Error("inesperado");
    await setVideo(primera.videoId, "FAILED");

    const retry = await iniciar();
    expect(retry.modo).toBe("primera");
    if (retry.modo === "bloqueada") throw new Error("inesperado");
    // La submission vieja se borró; solo queda la nueva (unique: 1).
    expect(await contarSubmissions()).toBe(1);
    expect(retry.submissionId).not.toBe(primera.submissionId);
  });

  it("Video REMOVED por MODERACION -> bloqueada", async () => {
    const primera = await iniciar();
    if (primera.modo === "bloqueada") throw new Error("inesperado");
    await setVideo(primera.videoId, "REMOVED");
    await prisma.submission.update({
      where: { id: primera.submissionId },
      data: { status: "REMOVED", retiradaMotivo: "MODERACION", retiradaEn: new Date() },
    });
    const r = await iniciar();
    expect(r.modo).toBe("bloqueada");
  });

  it("Video REMOVED SIN motivo (borrado del dueño, o fila antigua) -> NO bloquea", async () => {
    // Este test decia antes que un REMOVED a secas bloqueaba, y esa era justo la regla equivocada:
    // vetaba de por vida a quien borraba su propio video. Desde que la moderacion es un campo
    // EXPLICITO, un estado de video por si solo no puede ser un veto — si nadie modero, no hay nada
    // que vetar. Se re-expresa el invariante, no se afloja: la moderacion sigue bloqueando (arriba).
    const primera = await iniciar();
    if (primera.modo === "bloqueada") throw new Error("inesperado");
    await setVideo(primera.videoId, "REMOVED");
    const r = await iniciar();
    expect(r.modo).toBe("primera");
  });
});

describe("completarReemplazo", () => {
  async function prepararReemplazo() {
    const primera = await iniciar();
    if (primera.modo === "bloqueada") throw new Error("inesperado");
    await setVideo(primera.videoId, "PUBLISHED");
    await prisma.submission.update({
      where: { id: primera.submissionId },
      data: { status: "PUBLISHED" },
    });
    const rep = await iniciar();
    if (rep.modo === "bloqueada") throw new Error("inesperado");
    return {
      viejoVideoId: primera.videoId,
      submissionId: primera.submissionId,
      nuevoVideoId: rep.videoId,
    };
  }

  it("NO actúa si el vídeo nuevo aún no está PUBLISHED (la vieja sigue intacta, sin borrar)", async () => {
    const { viejoVideoId, submissionId, nuevoVideoId } = await prepararReemplazo();
    const r = await completarReemplazo(prisma, nuevoVideoId); // nuevo sigue PENDING
    expect(r.hecho).toBe(false);
    const sub = await prisma.submission.findUnique({
      where: { id: submissionId },
      select: { videoId: true },
    });
    expect(sub?.videoId).toBe(viejoVideoId); // NO se ha repuntado
    expect(await prisma.job.count({ where: { type: "BUNNY_DELETE_VIDEO" } })).toBe(0); // NADA de borrado
    const viejo = await prisma.video.findUnique({
      where: { id: viejoVideoId },
      select: { status: true },
    });
    expect(viejo?.status).toBe("PUBLISHED"); // el viejo intacto
  });

  it("con el nuevo PUBLISHED: repunta, marca el viejo REMOVED y encola el borrado; idempotente", async () => {
    const { viejoVideoId, submissionId, nuevoVideoId } = await prepararReemplazo();
    await setVideo(nuevoVideoId, "PUBLISHED");

    const r = await completarReemplazo(prisma, nuevoVideoId);
    expect(r.hecho).toBe(true);

    const sub = await prisma.submission.findUnique({
      where: { id: submissionId },
      select: { videoId: true, status: true },
    });
    expect(sub?.videoId).toBe(nuevoVideoId); // repuntada al nuevo
    expect(sub?.status).toBe("PUBLISHED");

    const viejo = await prisma.video.findUnique({
      where: { id: viejoVideoId },
      select: { status: true, bunnyVideoId: true },
    });
    expect(viejo?.status).toBe("REMOVED"); // el viejo oculto

    const nuevo = await prisma.video.findUnique({
      where: { id: nuevoVideoId },
      select: { reemplazaSubmissionId: true },
    });
    expect(nuevo?.reemplazaSubmissionId).toBeNull(); // puntero limpio

    const jobs = await prisma.job.findMany({ where: { type: "BUNNY_DELETE_VIDEO" } });
    expect(jobs).toHaveLength(1);
    expect((jobs[0]!.payload as { bunnyVideoId: string }).bunnyVideoId).toBe(viejo!.bunnyVideoId);

    // Idempotente: repetir no crea un 2º job ni rompe (idempotencyKey + puntero ya limpio).
    const r2 = await completarReemplazo(prisma, nuevoVideoId);
    expect(r2.hecho).toBe(false); // ya no hay puntero
    expect(await prisma.job.count({ where: { type: "BUNNY_DELETE_VIDEO" } })).toBe(1);
  });

  it("reemplazo abandonado: la reconciliación del worker lo completa igual", async () => {
    const { viejoVideoId, submissionId, nuevoVideoId } = await prepararReemplazo();
    await setVideo(nuevoVideoId, "PUBLISHED");
    // El cliente se fue; el worker publica el vídeo y llama a publicarParticipacionSiProcede.
    await publicarParticipacionSiProcede(prisma, nuevoVideoId);
    const sub = await prisma.submission.findUnique({
      where: { id: submissionId },
      select: { videoId: true },
    });
    expect(sub?.videoId).toBe(nuevoVideoId); // swap completado por el worker
    const viejo = await prisma.video.findUnique({
      where: { id: viejoVideoId },
      select: { status: true },
    });
    expect(viejo?.status).toBe("REMOVED");
  });
});

describe("publicarParticipacionSiProcede (primera participación)", () => {
  it("publica la Submission cuando su Video se publica (PENDING -> PUBLISHED)", async () => {
    const primera = await iniciar();
    if (primera.modo === "bloqueada") throw new Error("inesperado");
    await setVideo(primera.videoId, "PUBLISHED"); // el worker publicó el vídeo
    await publicarParticipacionSiProcede(prisma, primera.videoId);
    const sub = await prisma.submission.findUnique({
      where: { id: primera.submissionId },
      select: { status: true },
    });
    expect(sub?.status).toBe("PUBLISHED"); // ahora visible (Video PUBLISHED + Submission PUBLISHED)
  });
});
