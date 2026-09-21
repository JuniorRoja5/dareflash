/**
 * LAS DOS DECISIONES DE MODERACIÓN — contra la BD.
 *
 * Lo que se fija, y por qué importa cada cosa:
 *  - RETIRAR UN VÍDEO CON PARTICIPACIÓN arrastra la Submission a REMOVED con
 *    `retiradaMotivo = "MODERACION"`. Ese campo es la FUENTE ÚNICA de la re-participación: si la
 *    Submission se quedara viva, el usuario podría volver a participar como si no hubiera pasado nada.
 *  - RETIRAR conserva el objeto en Bunny: NUNCA encola `BUNNY_DELETE_VIDEO`. Retirar es ocultar.
 *  - RETIRAR UN COMENTARIO lo marca con motivo MODERACION (sin `userId` en el WHERE, que es lo que
 *    distingue este camino del que usa el autor) y baja `commentCount` en la MISMA transacción.
 *  - Y las denuncias del objeto se cierran CON el mismo acto: si no, el contenido retirado volvería a
 *    la cola, o las denuncias se cerrarían sobre algo que sigue a la vista.
 *  - DESCARTAR no toca el contenido y solo marca SUS denuncias.
 *
 * Para romperlo: quitar el arrastre de la Submission (rojo), no decrementar el contador (rojo), no
 * cerrar las denuncias (rojo), o cerrar también las de otros objetos (rojo).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";
import { listarComentarios } from "../src/server/services/comentarios";
import { denunciar } from "../src/server/services/denuncias";
import { feedPublicado, type Firmante } from "../src/server/services/feed";
import { descartarDenuncias, retirarPorModeracion } from "../src/server/services/moderar";
import { generarPublicCode } from "../src/server/services/reto-codigo";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

let prisma: PrismaClient;
let autor: string;
let n = 0;

const firmarFake: Firmante = (b) => ({ src: `https://f/${b}`, poster: `https://f/${b}.jpg` });

beforeAll(() => {
  prisma = createTestPrisma();
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
  n = 0;
  autor = await crearUsuario(prisma, { username: "autora" });
});

async function crearVideo(): Promise<string> {
  n += 1;
  const v = await prisma.video.create({
    data: { userId: autor, bunnyVideoId: `mod-${n}`, status: "PUBLISHED", category: "fitness" },
    select: { id: true },
  });
  return v.id;
}

async function participacion(): Promise<{ videoId: string; submissionId: string }> {
  n += 1;
  const reto = await prisma.challenge.create({
    data: {
      title: `Reto ${n}`,
      slug: `reto-${n}`,
      publicCode: generarPublicCode(),
      category: "fitness",
      status: "PUBLISHED",
      prizeCurrency: "USD",
      startsAt: new Date(Date.now() - 86_400_000),
      deadline: new Date(Date.now() + 86_400_000),
      createdById: autor,
    },
    select: { id: true },
  });
  const videoId = await crearVideo();
  const sub = await prisma.submission.create({
    data: { challengeId: reto.id, userId: autor, videoId, status: "PUBLISHED" },
    select: { id: true },
  });
  return { videoId, submissionId: sub.id };
}

async function crearComentario(videoId: string): Promise<string> {
  const quien = await crearUsuario(prisma);
  const c = await prisma.comment.create({
    data: { videoId, userId: quien, texto: "Comentario feo" },
    select: { id: true },
  });
  await prisma.video.update({
    where: { id: videoId },
    data: { commentCount: { increment: 1 } },
  });
  return c.id;
}

async function denunciasDe(targetId: string) {
  return prisma.report.findMany({ where: { targetId }, select: { status: true } });
}
const estados = async (targetId: string) => (await denunciasDe(targetId)).map((r) => r.status);

async function denunciadoPor(
  targetType: "VIDEO" | "COMMENT",
  targetId: string,
  cuantos: number,
): Promise<void> {
  for (let i = 0; i < cuantos; i += 1) {
    const quien = await crearUsuario(prisma);
    await denunciar(prisma, { reporterId: quien, targetType, targetId, reason: "SPAM" });
  }
}

describe("retirar un VÍDEO", () => {
  it("con participación: arrastra la Submission con su MOTIVO, y cierra las denuncias", async () => {
    const { videoId, submissionId } = await participacion();
    await denunciadoPor("VIDEO", videoId, 2);

    expect(await retirarPorModeracion(prisma, { targetType: "VIDEO", targetId: videoId })).toEqual({
      estado: "hecho",
      denunciasCerradas: 2,
    });

    const video = await prisma.video.findUniqueOrThrow({ where: { id: videoId } });
    const sub = await prisma.submission.findUniqueOrThrow({ where: { id: submissionId } });
    expect(video.status).toBe("REMOVED");
    // Sin esto, la re-participación creería que no hubo moderación: es la fuente única de esa regla.
    expect(sub.status).toBe("REMOVED");
    expect(sub.retiradaMotivo).toBe("MODERACION");
    expect(sub.retiradaEn).not.toBeNull();
    expect(await estados(videoId)).toEqual(["RESOLVED", "RESOLVED"]);
  });

  it("suelto (sin participación): se oculta igual", async () => {
    const videoId = await crearVideo();
    await denunciadoPor("VIDEO", videoId, 1);

    expect(
      (await retirarPorModeracion(prisma, { targetType: "VIDEO", targetId: videoId })).estado,
    ).toBe("hecho");

    expect((await prisma.video.findUniqueOrThrow({ where: { id: videoId } })).status).toBe(
      "REMOVED",
    );
    expect(await estados(videoId)).toEqual(["RESOLVED"]);
  });

  it("NUNCA encola el borrado en Bunny: retirar es ocultar, no destruir", async () => {
    const { videoId } = await participacion();
    const suelto = await crearVideo();
    await denunciadoPor("VIDEO", videoId, 1);
    await denunciadoPor("VIDEO", suelto, 1);

    await retirarPorModeracion(prisma, { targetType: "VIDEO", targetId: videoId });
    await retirarPorModeracion(prisma, { targetType: "VIDEO", targetId: suelto });

    expect(await prisma.job.count({ where: { type: "BUNNY_DELETE_VIDEO" } })).toBe(0);
  });

  it("deja de verse en el feed", async () => {
    const videoId = await crearVideo();
    await denunciadoPor("VIDEO", videoId, 1);
    await retirarPorModeracion(prisma, { targetType: "VIDEO", targetId: videoId });

    const { items } = await feedPublicado(prisma, { firmar: firmarFake });
    expect(items.map((i) => i.id)).not.toContain(videoId);
  });

  it("uno que no existe: rechazado, sin tocar nada", async () => {
    expect(
      await retirarPorModeracion(prisma, { targetType: "VIDEO", targetId: "no-existe" }),
    ).toEqual({ estado: "rechazado", motivo: "NO_ENCONTRADO" });
  });
});

describe("retirar un COMENTARIO", () => {
  it("lo marca con motivo MODERACION, baja el contador y cierra sus denuncias", async () => {
    const videoId = await crearVideo();
    const commentId = await crearComentario(videoId);
    await denunciadoPor("COMMENT", commentId, 3);

    expect(
      await retirarPorModeracion(prisma, { targetType: "COMMENT", targetId: commentId }),
    ).toEqual({ estado: "hecho", denunciasCerradas: 3 });

    const c = await prisma.comment.findUniqueOrThrow({ where: { id: commentId } });
    expect(c.retiradoEn).not.toBeNull();
    // MODERACION, no AUTOR: es lo que distingue "lo retiró un moderador" de "lo borró quien lo escribió".
    expect(c.retiradoMotivo).toBe("MODERACION");
    expect((await prisma.video.findUniqueOrThrow({ where: { id: videoId } })).commentCount).toBe(0);
    expect((await listarComentarios(prisma, videoId))?.items).toEqual([]);
    expect(await estados(commentId)).toEqual(["RESOLVED", "RESOLVED", "RESOLVED"]);
  });

  it("aunque el comentario NO sea del moderador (ese es el punto)", async () => {
    // El camino del AUTOR lleva el userId en el WHERE; este no, porque se retira lo ajeno.
    const videoId = await crearVideo();
    const commentId = await crearComentario(videoId);

    expect(
      (await retirarPorModeracion(prisma, { targetType: "COMMENT", targetId: commentId })).estado,
    ).toBe("hecho");
  });

  it("repetir no descuenta dos veces", async () => {
    const videoId = await crearVideo();
    const commentId = await crearComentario(videoId);
    await denunciadoPor("COMMENT", commentId, 1);

    await retirarPorModeracion(prisma, { targetType: "COMMENT", targetId: commentId });
    const segunda = await retirarPorModeracion(prisma, {
      targetType: "COMMENT",
      targetId: commentId,
    });

    expect(segunda).toEqual({ estado: "sin_cambios" });
    expect((await prisma.video.findUniqueOrThrow({ where: { id: videoId } })).commentCount).toBe(0);
  });
});

describe("descartar", () => {
  it("el contenido se queda; sus denuncias pasan a revisadas", async () => {
    const videoId = await crearVideo();
    await denunciadoPor("VIDEO", videoId, 2);

    expect(await descartarDenuncias(prisma, { targetType: "VIDEO", targetId: videoId })).toEqual({
      estado: "hecho",
      denunciasCerradas: 2,
    });

    expect((await prisma.video.findUniqueOrThrow({ where: { id: videoId } })).status).toBe(
      "PUBLISHED",
    );
    expect(await estados(videoId)).toEqual(["DISMISSED", "DISMISSED"]);
    // Y sigue viéndose: descartar no oculta nada.
    const { items } = await feedPublicado(prisma, { firmar: firmarFake });
    expect(items.map((i) => i.id)).toContain(videoId);
  });

  it("repetir no cambia nada", async () => {
    const videoId = await crearVideo();
    await denunciadoPor("VIDEO", videoId, 1);
    await descartarDenuncias(prisma, { targetType: "VIDEO", targetId: videoId });

    expect(await descartarDenuncias(prisma, { targetType: "VIDEO", targetId: videoId })).toEqual({
      estado: "sin_cambios",
    });
  });
});

describe("cada decisión toca SOLO su objeto", () => {
  it("retirar uno no cierra las denuncias de otro, ni lo oculta", async () => {
    const unoId = await crearVideo();
    const otroId = await crearVideo();
    await denunciadoPor("VIDEO", unoId, 2);
    await denunciadoPor("VIDEO", otroId, 2);

    await retirarPorModeracion(prisma, { targetType: "VIDEO", targetId: unoId });

    expect(await estados(unoId)).toEqual(["RESOLVED", "RESOLVED"]);
    expect(await estados(otroId)).toEqual(["OPEN", "OPEN"]);
    expect((await prisma.video.findUniqueOrThrow({ where: { id: otroId } })).status).toBe(
      "PUBLISHED",
    );
  });

  it("y descartar tampoco", async () => {
    const unoId = await crearVideo();
    const otroId = await crearVideo();
    await denunciadoPor("VIDEO", unoId, 1);
    await denunciadoPor("VIDEO", otroId, 1);

    await descartarDenuncias(prisma, { targetType: "VIDEO", targetId: unoId });

    expect(await estados(unoId)).toEqual(["DISMISSED"]);
    expect(await estados(otroId)).toEqual(["OPEN"]);
  });
});
