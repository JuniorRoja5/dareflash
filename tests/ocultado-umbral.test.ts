/**
 * OCULTADO AUTOMÁTICO POR UMBRAL — contra la base, con dientes.
 *
 * El umbral esconde contenido sin que lo mire ningún humano, así que lo que se fija aquí es todo
 * lo que lo haría peligroso si fallara:
 *
 *  - LA FRONTERA: dos no, tres sí, y las DESCARTADAS no cuentan. El número sale de la constante.
 *  - ES OTRO ESTADO: un auto-oculto se distingue de una retirada humana, y no hay nada que
 *    des-oculte solo — levantarlo es exclusivamente del moderador.
 *  - NO TOCA RESULTADOS: ocultar un vídeo con participación no escribe `Submission` ni
 *    `ChallengeResult`. Es el veto del deadlock, y además la fuente única de la re-participación.
 *  - DESAPARECE DE VERDAD: ni feed, ni lista de comentarios, ni se puede volver a denunciar.
 *  - IDEMPOTENCIA: la cuarta denuncia no vuelve a ocultar, ni re-audita, ni re-encola el aviso.
 *  - ATÓMICO: denuncia y ocultado van juntos; si el ocultado reventara, no quedaría una denuncia
 *    suelta contando para un umbral que no se aplicó.
 *  - EL CONTADOR DE COMENTARIOS no se descuadra en ninguna secuencia (ocultar → confirmar es la
 *    trampa: el contador solo puede bajar una vez).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { DENUNCIAS_PARA_OCULTAR } from "../src/config/constants";
import type { PrismaClient } from "../src/generated/prisma/client";
import { listarComentarios, publicarComentario } from "../src/server/services/comentarios";
import { listarColaModeracion } from "../src/server/services/cola-moderacion";
import { denunciar } from "../src/server/services/denuncias";
import { feedPublicado, type Firmante } from "../src/server/services/feed";
import { descartarDenuncias, retirarPorModeracion } from "../src/server/services/moderar";
import { generarPublicCode } from "../src/server/services/reto-codigo";
import {
  ACCION_AUTO_OCULTO,
  repartirAvisoAutoOculto,
  TIPO_JOB_AVISO_AUTO_OCULTO,
} from "../src/server/services/ocultado-automatico";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

let prisma: PrismaClient;
let autor: string;
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
  autor = await crearUsuario(prisma, { username: "autora" });
});

const firmarFake: Firmante = (bunnyVideoId) => ({
  poster: `https://cdn.test/${bunnyVideoId}/thumbnail.jpg`,
  src: `https://cdn.test/${bunnyVideoId}/playlist.m3u8`,
});

async function crearVideo(userId = autor): Promise<string> {
  n += 1;
  const v = await prisma.video.create({
    data: {
      userId,
      bunnyVideoId: `bunny-${n}-${Date.now()}`,
      status: "PUBLISHED",
      category: "RETOS",
      title: `video ${n}`,
    },
    select: { id: true },
  });
  return v.id;
}

async function crearComentario(videoId: string): Promise<string> {
  const quien = await crearUsuario(prisma);
  const r = await publicarComentario(prisma, { videoId, userId: quien, texto: "hola que tal" });
  if (!r || r.estado !== "publicado") throw new Error("no se pudo crear el comentario");
  return r.comentario.id;
}

/** `cuantos` personas distintas denuncian el objeto. Devuelve el resultado de cada denuncia. */
async function denuncian(
  targetType: "VIDEO" | "COMMENT",
  targetId: string,
  cuantos: number,
): Promise<Array<Awaited<ReturnType<typeof denunciar>>>> {
  const out = [];
  for (let i = 0; i < cuantos; i += 1) {
    const quien = await crearUsuario(prisma);
    out.push(await denunciar(prisma, { reporterId: quien, targetType, targetId, reason: "SPAM" }));
  }
  return out;
}

const ocultoDe = async (videoId: string) =>
  (await prisma.video.findUniqueOrThrow({ where: { id: videoId } })).ocultoAutoEn;

const rastros = () =>
  prisma.auditLog.findMany({ where: { action: ACCION_AUTO_OCULTO }, select: { targetId: true } });

const jobsAviso = () =>
  prisma.job.findMany({ where: { type: TIPO_JOB_AVISO_AUTO_OCULTO }, select: { payload: true } });

describe("la frontera", () => {
  it(`con ${DENUNCIAS_PARA_OCULTAR - 1} no se oculta`, async () => {
    const videoId = await crearVideo();
    const r = await denuncian("VIDEO", videoId, DENUNCIAS_PARA_OCULTAR - 1);
    expect(r.every((x) => x.estado === "registrada" && !x.ocultado)).toBe(true);
    expect(await ocultoDe(videoId)).toBeNull();
  });

  it(`la denuncia número ${DENUNCIAS_PARA_OCULTAR} lo oculta, y lo dice`, async () => {
    const videoId = await crearVideo();
    const r = await denuncian("VIDEO", videoId, DENUNCIAS_PARA_OCULTAR);
    expect(r[DENUNCIAS_PARA_OCULTAR - 1]).toEqual({ estado: "registrada", ocultado: true });
    expect(await ocultoDe(videoId)).not.toBeNull();
  });

  it("las DESCARTADAS no cuentan: dos descartadas y una nueva no llegan al umbral", async () => {
    const videoId = await crearVideo();
    await denuncian("VIDEO", videoId, DENUNCIAS_PARA_OCULTAR - 1);
    await descartarDenuncias(prisma, { targetType: "VIDEO", targetId: videoId });

    // Una NUEVA: el recuento abierto vuelve a ser 1, no 3.
    const [r] = await denuncian("VIDEO", videoId, 1);
    expect(r).toEqual({ estado: "registrada", ocultado: false });
    expect(await ocultoDe(videoId)).toBeNull();
  });

  it("también funciona con COMENTARIOS", async () => {
    const videoId = await crearVideo();
    const commentId = await crearComentario(videoId);
    await denuncian("COMMENT", commentId, DENUNCIAS_PARA_OCULTAR);
    const c = await prisma.comment.findUniqueOrThrow({ where: { id: commentId } });
    expect(c.ocultoAutoEn).not.toBeNull();
    // Y NO lo marca como retirado: son dos cosas distintas.
    expect(c.retiradoEn).toBeNull();
  });
});

describe("desaparece de verdad", () => {
  it("un vídeo auto-oculto no sale en el feed", async () => {
    const videoId = await crearVideo();
    const otroId = await crearVideo();
    await denuncian("VIDEO", videoId, DENUNCIAS_PARA_OCULTAR);

    const { items } = await feedPublicado(prisma, { firmar: firmarFake });
    expect(items.map((i) => i.id)).toContain(otroId);
    expect(items.map((i) => i.id)).not.toContain(videoId);
  });

  it("un comentario auto-oculto no sale en su lista", async () => {
    const videoId = await crearVideo();
    const commentId = await crearComentario(videoId);
    await denuncian("COMMENT", commentId, DENUNCIAS_PARA_OCULTAR);

    const pagina = await listarComentarios(prisma, videoId);
    expect(pagina?.items.map((c) => c.id)).toEqual([]);
  });

  it("y ya no se puede denunciar: lo oculto no es denunciable", async () => {
    const videoId = await crearVideo();
    await denuncian("VIDEO", videoId, DENUNCIAS_PARA_OCULTAR);

    const [r] = await denuncian("VIDEO", videoId, 1);
    expect(r).toEqual({ estado: "rechazada", motivo: "NO_DISPONIBLE" });
  });
});

describe("es OTRO estado, no la retirada manual", () => {
  it("un auto-oculto NO queda como retirado", async () => {
    const videoId = await crearVideo();
    await denuncian("VIDEO", videoId, DENUNCIAS_PARA_OCULTAR);
    const v = await prisma.video.findUniqueOrThrow({ where: { id: videoId } });
    expect(v.status).toBe("PUBLISHED"); // sigue publicado; lo que lo esconde es la otra columna
    expect(v.ocultoAutoEn).not.toBeNull();
  });

  it("y la cola lo distingue: `ocultoAuto` sí, `retirado` no", async () => {
    const videoId = await crearVideo();
    await denuncian("VIDEO", videoId, DENUNCIAS_PARA_OCULTAR);

    const { items } = await listarColaModeracion(prisma, { firmar: firmarFake });
    const fila = items.find((i) => i.targetId === videoId)!;
    expect(fila.ocultoAuto).toBe(true);
    expect(fila.video?.retirado).toBe(false);
  });

  it("una retirada MANUAL sí sale como retirada, y sin auto-oculto", async () => {
    const videoId = await crearVideo();
    await denuncian("VIDEO", videoId, 1);
    await retirarPorModeracion(prisma, { targetType: "VIDEO", targetId: videoId });

    const v = await prisma.video.findUniqueOrThrow({ where: { id: videoId } });
    expect(v.status).toBe("REMOVED");
    expect(v.ocultoAutoEn).toBeNull();
  });
});

describe("una sola dirección", () => {
  it("DESCARTAR es lo único que devuelve el contenido a la vista", async () => {
    const videoId = await crearVideo();
    await denuncian("VIDEO", videoId, DENUNCIAS_PARA_OCULTAR);
    expect(await ocultoDe(videoId)).not.toBeNull();

    const r = await descartarDenuncias(prisma, { targetType: "VIDEO", targetId: videoId });
    expect(r.estado).toBe("hecho");
    expect(await ocultoDe(videoId)).toBeNull();

    const { items } = await feedPublicado(prisma, { firmar: firmarFake });
    expect(items.map((i) => i.id)).toContain(videoId);
  });

  it("CONFIRMAR retira de verdad y deja de ser un auto-oculto pendiente", async () => {
    const videoId = await crearVideo();
    await denuncian("VIDEO", videoId, DENUNCIAS_PARA_OCULTAR);

    await retirarPorModeracion(prisma, { targetType: "VIDEO", targetId: videoId });
    const v = await prisma.video.findUniqueOrThrow({ where: { id: videoId } });
    expect(v.status).toBe("REMOVED");
    expect(v.ocultoAutoEn, "el pendiente se resuelve al confirmar").toBeNull();
    // Y sale de la cola: sus denuncias quedan RESOLVED.
    const { items } = await listarColaModeracion(prisma, { firmar: firmarFake });
    expect(items.map((i) => i.targetId)).not.toContain(videoId);
  });

  it("descartar algo que NO estaba oculto no lo cambia (y no miente diciendo que sí)", async () => {
    const videoId = await crearVideo();
    const r = await descartarDenuncias(prisma, { targetType: "VIDEO", targetId: videoId });
    expect(r).toEqual({ estado: "sin_cambios" });
  });
});

describe("no toca resultados (veto del deadlock)", () => {
  it("auto-ocultar un vídeo con participación no escribe Submission ni ChallengeResult", async () => {
    const reto = await prisma.challenge.create({
      data: {
        title: "Reto de prueba",
        slug: `reto-${Date.now()}`,
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
      select: { id: true, status: true, retiradaMotivo: true, retiradaEn: true },
    });

    await denuncian("VIDEO", videoId, DENUNCIAS_PARA_OCULTAR);

    const despues = await prisma.submission.findUniqueOrThrow({ where: { id: sub.id } });
    expect(despues.status, "la participación no se toca").toBe(sub.status);
    expect(despues.retiradaMotivo).toBeNull();
    expect(despues.retiradaEn).toBeNull();
    expect(await prisma.challengeResult.count()).toBe(0);
  });
});

describe("idempotencia y rastro", () => {
  it("la cuarta denuncia no vuelve a ocultar, ni re-audita, ni re-encola el aviso", async () => {
    const videoId = await crearVideo();
    await denuncian("VIDEO", videoId, DENUNCIAS_PARA_OCULTAR);
    const cuandoSeOculto = await ocultoDe(videoId);

    expect(await rastros()).toHaveLength(1);
    expect(await jobsAviso()).toHaveLength(1);

    // La cuarta llega por la vía de siempre; está rechazada porque ya no se ve, pero aunque
    // entrara no podría re-ocultar: el `yaOculto` manda.
    await denuncian("VIDEO", videoId, 1);
    expect(await ocultoDe(videoId)).toEqual(cuandoSeOculto);
    expect(await rastros()).toHaveLength(1);
    expect(await jobsAviso()).toHaveLength(1);
  });

  it("el rastro no lleva actor: no lo decidió una persona", async () => {
    const videoId = await crearVideo();
    await denuncian("VIDEO", videoId, DENUNCIAS_PARA_OCULTAR);

    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: ACCION_AUTO_OCULTO } });
    expect(log.actorId).toBeNull();
    expect(log.targetId).toBe(videoId);
    expect(log.metadata).toMatchObject({ denunciasAbiertas: DENUNCIAS_PARA_OCULTAR });
  });

  it("el aviso va por la COLA, no en la transacción del ocultado", async () => {
    const videoId = await crearVideo();
    await denuncian("VIDEO", videoId, DENUNCIAS_PARA_OCULTAR);

    const [job] = await jobsAviso();
    expect(job?.payload).toMatchObject({ targetType: "VIDEO", targetId: videoId });
    // Y todavía NO hay ningún aviso escrito: lo escribe el worker al ejecutar el job.
    expect(await prisma.notification.count({ where: { tipo: "CONTENIDO_AUTO_OCULTO" } })).toBe(0);
  });

  it("y el handler avisa a TODO el equipo, una vez por cabeza", async () => {
    const videoId = await crearVideo();
    const admin = await crearUsuario(prisma, { username: "la_admin" });
    const mod = await crearUsuario(prisma, { username: "el_mod" });
    await prisma.user.update({ where: { id: admin }, data: { role: "ADMIN" } });
    await prisma.user.update({ where: { id: mod }, data: { role: "MODERATOR" } });
    await denuncian("VIDEO", videoId, DENUNCIAS_PARA_OCULTAR);

    const objeto = { targetType: "VIDEO" as const, targetId: videoId };
    expect(await repartirAvisoAutoOculto(prisma, objeto)).toEqual({ avisados: 2 });
    // Reintentar el job (REQUEUE) no duplica: la UNIQUE de Notification lo impide.
    expect(await repartirAvisoAutoOculto(prisma, objeto)).toEqual({ avisados: 0 });
    expect(await prisma.notification.count({ where: { tipo: "CONTENIDO_AUTO_OCULTO" } })).toBe(2);
  });
});

describe("el contador de comentarios no se descuadra", () => {
  const cuenta = async (videoId: string) =>
    (await prisma.video.findUniqueOrThrow({ where: { id: videoId } })).commentCount;

  it("ocultar un comentario lo descuenta de los visibles", async () => {
    const videoId = await crearVideo();
    const a = await crearComentario(videoId);
    await crearComentario(videoId);
    expect(await cuenta(videoId)).toBe(2);

    await denuncian("COMMENT", a, DENUNCIAS_PARA_OCULTAR);
    expect(await cuenta(videoId)).toBe(1);
  });

  it("OCULTAR y luego CONFIRMAR lo descuenta UNA sola vez", async () => {
    // La trampa de toda la pieza: si confirmar volviera a descontar, el vídeo acabaría diciendo
    // que tiene menos comentarios de los que tiene, y nadie se daría cuenta.
    const videoId = await crearVideo();
    const a = await crearComentario(videoId);
    await crearComentario(videoId);

    await denuncian("COMMENT", a, DENUNCIAS_PARA_OCULTAR);
    await retirarPorModeracion(prisma, { targetType: "COMMENT", targetId: a });

    expect(await cuenta(videoId)).toBe(1);
    const c = await prisma.comment.findUniqueOrThrow({ where: { id: a } });
    expect(c.retiradoEn).not.toBeNull();
    expect(c.ocultoAutoEn).toBeNull();
  });

  it("OCULTAR y luego DESCARTAR lo devuelve a la cuenta", async () => {
    const videoId = await crearVideo();
    const a = await crearComentario(videoId);
    await denuncian("COMMENT", a, DENUNCIAS_PARA_OCULTAR);
    expect(await cuenta(videoId)).toBe(0);

    await descartarDenuncias(prisma, { targetType: "COMMENT", targetId: a });
    expect(await cuenta(videoId)).toBe(1);
    expect((await listarComentarios(prisma, videoId))?.items.map((c) => c.id)).toEqual([a]);
  });
});

describe("atómico", () => {
  it("si el ocultado revienta, la denuncia tampoco se escribe", async () => {
    const videoId = await crearVideo();
    await denuncian("VIDEO", videoId, DENUNCIAS_PARA_OCULTAR - 1);
    const antes = await prisma.report.count();

    // Se rompe el ocultado por dentro: el `auditLog.create` del rastro falla.
    const db = new Proxy(prisma, {
      get(obj, prop) {
        if (prop === "$transaction") {
          return (fn: (tx: unknown) => Promise<unknown>) =>
            (obj as PrismaClient).$transaction((tx) =>
              fn(
                new Proxy(tx as object, {
                  get(t, p) {
                    if (p === "auditLog") {
                      return { create: () => Promise.reject(new Error("rastro caído")) };
                    }
                    const v = Reflect.get(t, p) as unknown;
                    return typeof v === "function"
                      ? (v as (...a: unknown[]) => unknown).bind(t)
                      : v;
                  },
                }),
              ),
            );
        }
        const v = Reflect.get(obj, prop) as unknown;
        return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(obj) : v;
      },
    }) as PrismaClient;

    const quien = await crearUsuario(prisma);
    await expect(
      denunciar(db, { reporterId: quien, targetType: "VIDEO", targetId: videoId, reason: "SPAM" }),
    ).rejects.toThrow("rastro caído");

    // Ni la denuncia que cruzaba el umbral, ni el ocultado: la transacción se deshizo entera.
    expect(await prisma.report.count()).toBe(antes);
    expect(await ocultoDe(videoId)).toBeNull();
  });
});
