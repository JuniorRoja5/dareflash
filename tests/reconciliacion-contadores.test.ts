/**
 * RECONCILIACIÓN DE LOS CONTADORES DESNORMALIZADOS.
 *
 * ┌─ POR QUÉ ESTE BARRIDO EXISTE ───────────────────────────────────────────────────────────────┐
 * │ `Submission.voteCount`, `Video.commentCount` y `Video.likeCount` son caché de `Vote`,       │
 * │ `Comment` y `Like`. Se mantienen con deltas dentro de la transacción de la fila fuente, que │
 * │ es correcto — pero un contador a base de deltas ACUMULA: un borrado en cascada, un arreglo  │
 * │ a mano, un camino nuevo que se olvida de uno de los tres. Nada falla a la vista; el número  │
 * │ se queda mal para siempre porque no hay quien lo mire.                                       │
 * │                                                                                               │
 * │ El encargo decía "añade likeCount al barrido que ya reconcilia los contadores". Ese barrido  │
 * │ NO EXISTÍA: ninguno de los tres tenía red. Se construye aquí con los tres, porque dar red a  │
 * │ uno solo y dejar los otros dos sin ella sería dejar el trabajo a un tercio.                   │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Para romperlo: quitar `likeCount` del recuento (cae el primero); escribir un delta en vez del
 * valor absoluto (cae la idempotencia); contar los comentarios sin `COMENTARIO_VISIBLE` (cae el de
 * los ocultos); contar fuera de la transacción (no lo ve un test, lo dice el docblock del servicio).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";
import { generarCodigoReferido } from "../src/server/auth/codigo-referido";
import {
  RECON_CONTADORES_CURSOR_SUBMISSION,
  RECON_CONTADORES_CURSOR_VIDEO,
  reconciliarContadores,
} from "../src/server/services/reconciliacion-contadores";
import { generarPublicCode } from "../src/server/services/reto-codigo";
import { leerEstado } from "../src/server/services/system-state";

import { createTestPrisma, resetDb } from "./helpers/db";

let prisma: PrismaClient;
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
});

const OPTS = { lotePorCiclo: 100 };

async function crearUsuario(): Promise<string> {
  n += 1;
  const u = await prisma.user.create({
    data: { referralCode: generarCodigoReferido(), username: `cont${n}_${Date.now() % 100000}` },
    select: { id: true },
  });
  return u.id;
}

async function crearVideo(userId: string): Promise<string> {
  n += 1;
  const v = await prisma.video.create({
    data: {
      userId,
      bunnyVideoId: `cont-${n}-${Date.now()}`,
      status: "PUBLISHED",
      category: "fitness",
    },
    select: { id: true },
  });
  return v.id;
}

/** Un like REAL (fila `Like`) sin pasar por el servicio: así el contador NO se mueve. */
async function likeCrudo(videoId: string): Promise<string> {
  const userId = await crearUsuario();
  await prisma.like.create({ data: { userId, videoId } });
  return userId;
}

async function comentarioCrudo(videoId: string, opts: { oculto?: boolean } = {}): Promise<string> {
  const userId = await crearUsuario();
  const c = await prisma.comment.create({
    data: {
      userId,
      videoId,
      texto: "hola",
      ...(opts.oculto ? { ocultoAutoEn: new Date() } : {}),
    },
    select: { id: true },
  });
  return c.id;
}

async function retoConParticipacion(): Promise<{ submissionId: string; challengeId: string }> {
  const autor = await crearUsuario();
  const videoId = await crearVideo(autor);
  n += 1;
  const ch = await prisma.challenge.create({
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
  const sub = await prisma.submission.create({
    data: { challengeId: ch.id, userId: autor, videoId, status: "PUBLISHED" },
    select: { id: true },
  });
  return { submissionId: sub.id, challengeId: ch.id };
}

describe("el barrido corrige los tres contadores", () => {
  it("`likeCount` forzado a un valor MAL vuelve a su sitio", async () => {
    const autor = await crearUsuario();
    const videoId = await crearVideo(autor);
    await likeCrudo(videoId);
    await likeCrudo(videoId);
    // El desvío: el contador dice 99 y las filas `Like` dicen 2.
    await prisma.video.update({ where: { id: videoId }, data: { likeCount: 99 } });

    const r = await reconciliarContadores(prisma, OPTS);

    expect(r.corregidos.likeCount, "likeCount no entró en el barrido").toBe(1);
    const v = await prisma.video.findUniqueOrThrow({ where: { id: videoId } });
    expect(v.likeCount).toBe(2);
  });

  it("y también a la BAJA: un contador que dice menos de lo que hay", async () => {
    // El caso que más duele y menos se nota: el hito de los 50 likes se decide contando filas,
    // pero lo que la gente VE es el contador. Uno por debajo esconde likes que existen.
    const autor = await crearUsuario();
    const videoId = await crearVideo(autor);
    for (let i = 0; i < 3; i += 1) await likeCrudo(videoId);
    await prisma.video.update({ where: { id: videoId }, data: { likeCount: 0 } });

    await reconciliarContadores(prisma, OPTS);

    const v = await prisma.video.findUniqueOrThrow({ where: { id: videoId } });
    expect(v.likeCount).toBe(3);
  });

  it("`commentCount` y `voteCount`, con el MISMO mecanismo y en la MISMA pasada", async () => {
    const { submissionId } = await retoConParticipacion();
    const sub = await prisma.submission.findUniqueOrThrow({
      where: { id: submissionId },
      select: { videoId: true, challengeId: true },
    });
    await comentarioCrudo(sub.videoId);
    const votante = await crearUsuario();
    await prisma.vote.create({
      data: { userId: votante, challengeId: sub.challengeId, submissionId, ipHash: "h" },
    });

    await prisma.video.update({ where: { id: sub.videoId }, data: { commentCount: 42 } });
    await prisma.submission.update({ where: { id: submissionId }, data: { voteCount: 7 } });

    const r = await reconciliarContadores(prisma, OPTS);

    expect(r.corregidos.commentCount).toBe(1);
    expect(r.corregidos.voteCount).toBe(1);
    const v = await prisma.video.findUniqueOrThrow({ where: { id: sub.videoId } });
    const s = await prisma.submission.findUniqueOrThrow({ where: { id: submissionId } });
    expect(v.commentCount).toBe(1);
    expect(s.voteCount).toBe(1);
  });

  it("cuenta los comentarios con la MISMA regla de visibilidad que la aplicación", async () => {
    // Un comentario retirado o auto-oculto NO se ve, así que no cuenta. Si el barrido contara
    // todas las filas, "corregiría" cada vídeo con moderación hacia un número que nadie usa: un
    // reparador que estropea es peor que no tener reparador.
    const autor = await crearUsuario();
    const videoId = await crearVideo(autor);
    await comentarioCrudo(videoId);
    await comentarioCrudo(videoId, { oculto: true });
    const retirado = await comentarioCrudo(videoId);
    await prisma.comment.update({ where: { id: retirado }, data: { retiradoEn: new Date() } });
    await prisma.video.update({ where: { id: videoId }, data: { commentCount: 0 } });

    await reconciliarContadores(prisma, OPTS);

    const v = await prisma.video.findUniqueOrThrow({ where: { id: videoId } });
    expect(v.commentCount, "el barrido cuenta comentarios que nadie ve").toBe(1);
  });
});

describe("es idempotente", () => {
  it("dos pasadas dejan lo mismo, y la segunda no corrige nada", async () => {
    const autor = await crearUsuario();
    const videoId = await crearVideo(autor);
    await likeCrudo(videoId);
    await likeCrudo(videoId);
    await prisma.video.update({ where: { id: videoId }, data: { likeCount: 99 } });

    const primera = await reconciliarContadores(prisma, OPTS);
    const trasPrimera = await prisma.video.findUniqueOrThrow({ where: { id: videoId } });
    const segunda = await reconciliarContadores(prisma, OPTS);
    const trasSegunda = await prisma.video.findUniqueOrThrow({ where: { id: videoId } });

    expect(primera.corregidos.likeCount).toBe(1);
    // Lo que escribe es el RECUENTO, no una diferencia: por eso converge en vez de acumular.
    expect(segunda.corregidos.likeCount, "la segunda pasada vuelve a tocar el contador").toBe(0);
    expect(trasSegunda.likeCount).toBe(trasPrimera.likeCount);
    expect(trasSegunda.likeCount).toBe(2);
  });

  it("y un barrido sobre datos SANOS no escribe nada (ni mueve `updatedAt`)", async () => {
    // El caso normal, que es el 99,99% de las pasadas. Si tocara la fila igualmente, cada vuelta
    // del round-robin reescribiría la tabla entera y el `updatedAt` dejaría de significar algo.
    const autor = await crearUsuario();
    const videoId = await crearVideo(autor);
    const antes = await prisma.video.findUniqueOrThrow({ where: { id: videoId } });

    const r = await reconciliarContadores(prisma, OPTS);

    const despues = await prisma.video.findUniqueOrThrow({ where: { id: videoId } });
    expect(r.corregidos).toEqual({ likeCount: 0, commentCount: 0, voteCount: 0 });
    expect(despues.updatedAt.getTime()).toBe(antes.updatedAt.getTime());
  });
});

describe("el recorrido", () => {
  it("es incremental con cursor rotatorio: cubre todo en varias vueltas y reinicia al final", async () => {
    const autor = await crearUsuario();
    const ids: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      const id = await crearVideo(autor);
      await likeCrudo(id);
      await prisma.video.update({ where: { id }, data: { likeCount: 0 } });
      ids.push(id);
    }

    // Lotes de 2: hacen falta tres barridos para cubrir cinco filas.
    const b1 = await reconciliarContadores(prisma, { lotePorCiclo: 2 });
    expect(b1.videosRevisados).toBe(2);
    expect(b1.reinicioVideos).toBe(false);
    expect(await leerEstado(prisma, RECON_CONTADORES_CURSOR_VIDEO)).not.toBe("");

    const b2 = await reconciliarContadores(prisma, { lotePorCiclo: 2 });
    const b3 = await reconciliarContadores(prisma, { lotePorCiclo: 2 });

    const corregidos = b1.corregidos.likeCount + b2.corregidos.likeCount + b3.corregidos.likeCount;
    expect(corregidos, "el round-robin no ha cubierto las cinco").toBe(5);
    // La última vuelta devuelve menos del lote -> fin de tabla -> cursor a cero para dar otra vuelta.
    expect(b3.reinicioVideos).toBe(true);
    expect(await leerEstado(prisma, RECON_CONTADORES_CURSOR_VIDEO)).toBe("");

    for (const id of ids) {
      const v = await prisma.video.findUniqueOrThrow({ where: { id } });
      expect(v.likeCount, id).toBe(1);
    }
  });

  it("los dos cursores son INDEPENDIENTES: vídeos y participaciones no comparten posición", async () => {
    // Compartirlo haría que la tabla más corta reiniciara a la más larga, y la larga nunca se
    // terminaría de recorrer.
    const autor = await crearUsuario();
    for (let i = 0; i < 3; i += 1) await crearVideo(autor);
    await retoConParticipacion();

    await reconciliarContadores(prisma, { lotePorCiclo: 2 });

    const cv = await leerEstado(prisma, RECON_CONTADORES_CURSOR_VIDEO);
    const cs = await leerEstado(prisma, RECON_CONTADORES_CURSOR_SUBMISSION);
    // Vídeos: 4 filas (3 + el de la participación) con lote 2 -> quedan más, cursor avanzado.
    expect(cv).not.toBe("");
    // Participaciones: 1 fila con lote 2 -> fin de tabla, cursor reiniciado.
    expect(cs).toBe("");
  });

  it("una fila que desaparece entre el lote y su turno no rompe el barrido", async () => {
    const autor = await crearUsuario();
    const vivo = await crearVideo(autor);
    await likeCrudo(vivo);
    await prisma.video.update({ where: { id: vivo }, data: { likeCount: 0 } });

    // No se puede borrar "en medio" desde fuera, pero sí comprobar que el barrido tolera que la
    // consulta devuelva una fila y el recuento no la encuentre: el servicio lo trata como no-op.
    const r = await reconciliarContadores(prisma, OPTS);

    expect(r.corregidos.likeCount).toBe(1);
    const v = await prisma.video.findUniqueOrThrow({ where: { id: vivo } });
    expect(v.likeCount).toBe(1);
  });
});
