/**
 * DENUNCIAS (Fase 5, pieza 1) — la ingesta, contra la BD.
 *
 * Lo que se fija:
 *  - se denuncia un VÍDEO y un COMENTARIO, y la fila nace OPEN con el motivo tipado;
 *  - UNA por denunciante y objeto: la segunda es un no-op silencioso, y ni cinco a la vez cuelan dos;
 *  - el objeto se comprueba contra la fila real: id inventado, vídeo retirado o comentario borrado se
 *    rechazan con el MISMO motivo que "no existe";
 *  - nadie se denuncia a sí mismo;
 *  - denunciar NO oculta nada: el vídeo sigue en el feed y el comentario en su lista;
 *  - y el no-op cubre SOLO la colisión de la unique: cualquier otro fallo sube.
 *
 * Para romperlo a propósito: quitar el `@@unique` (rojo en idempotencia y concurrencia), quitar la
 * comprobación del dueño (rojo en autodenuncia), aceptar el `targetType` sin resolverlo (rojo en
 * target inválido), o tragarse cualquier error en vez de solo el P2002 (rojo en el último).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";
import { listarComentarios } from "../src/server/services/comentarios";
import { denunciar } from "../src/server/services/denuncias";
import { feedPublicado, type Firmante } from "../src/server/services/feed";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

let prisma: PrismaClient;
let autor: string;
let denunciante: string;
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
  autor = await crearUsuario(prisma, { username: "autora_del_video" });
  denunciante = await crearUsuario(prisma, { username: "quien_denuncia" });
});

const firmarFake: Firmante = (bunnyVideoId) => ({
  src: `https://fake/${bunnyVideoId}.m3u8`,
  poster: `https://fake/${bunnyVideoId}.jpg`,
});

/** Un vídeo LIBRE publicado (con categoría: así sale en el feed). */
async function crearVideo(propietario = autor): Promise<string> {
  n += 1;
  const v = await prisma.video.create({
    data: {
      userId: propietario,
      bunnyVideoId: `den-${n}`,
      status: "PUBLISHED",
      category: "fitness",
    },
    select: { id: true },
  });
  return v.id;
}

async function crearComentario(videoId: string, propietario = autor): Promise<string> {
  const c = await prisma.comment.create({
    data: { videoId, userId: propietario, texto: "Un comentario" },
    select: { id: true },
  });
  return c.id;
}

const denuncias = () => prisma.report.findMany({});
/** El recuento que usará la pieza 3: denunciantes DISTINTOS. */
async function denunciantesDistintos(targetType: string, targetId: string): Promise<number> {
  const filas = await prisma.report.findMany({
    where: { targetType, targetId },
    select: { reporterId: true },
    distinct: ["reporterId"],
  });
  return filas.length;
}

describe("registrar", () => {
  it("un VÍDEO ajeno: fila OPEN, con el motivo tipado y el denunciante de la sesión", async () => {
    const videoId = await crearVideo();

    expect(
      await denunciar(prisma, {
        reporterId: denunciante,
        targetType: "VIDEO",
        targetId: videoId,
        reason: "SPAM",
      }),
    ).toEqual({ estado: "registrada" });

    const filas = await denuncias();
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({
      reporterId: denunciante,
      targetType: "VIDEO",
      targetId: videoId,
      reason: "SPAM",
      // El estado inicial lo pone la BD: no lo elige quien denuncia.
      status: "OPEN",
    });
  });

  it("un COMENTARIO ajeno", async () => {
    const videoId = await crearVideo();
    const commentId = await crearComentario(videoId);

    expect(
      await denunciar(prisma, {
        reporterId: denunciante,
        targetType: "COMMENT",
        targetId: commentId,
        reason: "ACOSO",
      }),
    ).toEqual({ estado: "registrada" });

    expect(await denuncias()).toHaveLength(1);
  });

  it("dos personas distintas sobre el mismo objeto son dos denuncias", async () => {
    const videoId = await crearVideo();
    const otra = await crearUsuario(prisma);

    await denunciar(prisma, {
      reporterId: denunciante,
      targetType: "VIDEO",
      targetId: videoId,
      reason: "SPAM",
    });
    await denunciar(prisma, {
      reporterId: otra,
      targetType: "VIDEO",
      targetId: videoId,
      reason: "SEXUAL",
    });

    expect(await denuncias()).toHaveLength(2);
    expect(await denunciantesDistintos("VIDEO", videoId)).toBe(2);
  });

  it("la misma persona sobre objetos distintos son dos denuncias", async () => {
    const uno = await crearVideo();
    const otro = await crearVideo();

    await denunciar(prisma, {
      reporterId: denunciante,
      targetType: "VIDEO",
      targetId: uno,
      reason: "SPAM",
    });
    await denunciar(prisma, {
      reporterId: denunciante,
      targetType: "VIDEO",
      targetId: otro,
      reason: "SPAM",
    });

    expect(await denuncias()).toHaveLength(2);
  });
});

describe("una por denunciante y objeto", () => {
  it("denunciar dos veces lo mismo no escribe otra fila, y no es un error", async () => {
    const videoId = await crearVideo();
    const entrada = {
      reporterId: denunciante,
      targetType: "VIDEO" as const,
      targetId: videoId,
      reason: "SPAM" as const,
    };

    expect(await denunciar(prisma, entrada)).toEqual({ estado: "registrada" });
    expect(await denunciar(prisma, entrada)).toEqual({ estado: "repetida" });
    // Ni cambiando el motivo: el hecho es "esta persona ya avisó de esto".
    expect(await denunciar(prisma, { ...entrada, reason: "OTRO" })).toEqual({ estado: "repetida" });

    expect(await denuncias()).toHaveLength(1);
    expect(await denunciantesDistintos("VIDEO", videoId)).toBe(1);
  });

  it("CINCO a la vez del mismo denunciante dejan UNA (lo impide la BD, no un `if`)", async () => {
    const videoId = await crearVideo();
    const entrada = {
      reporterId: denunciante,
      targetType: "VIDEO" as const,
      targetId: videoId,
      reason: "SPAM" as const,
    };

    const r = await Promise.all([1, 2, 3, 4, 5].map(() => denunciar(prisma, entrada)));

    expect(r.filter((x) => x.estado === "registrada")).toHaveLength(1);
    expect(r.filter((x) => x.estado === "repetida")).toHaveLength(4);
    expect(await denuncias()).toHaveLength(1);
  });

  it("el no-op cubre SOLO esa colisión: cualquier otro fallo sube", async () => {
    const videoId = await crearVideo();
    // Un cliente que revienta al escribir por otra razón (no un P2002 de la unique).
    const db = new Proxy(prisma, {
      get(obj, prop) {
        if (prop !== "report") return Reflect.get(obj, prop) as unknown;
        return {
          create: () => Promise.reject(new Error("la BD se cayó")),
        };
      },
    }) as PrismaClient;

    await expect(
      denunciar(db, {
        reporterId: denunciante,
        targetType: "VIDEO",
        targetId: videoId,
        reason: "SPAM",
      }),
    ).rejects.toThrow("la BD se cayó");
  });
});

describe("el objeto se comprueba contra la fila real", () => {
  it("un id que no existe: rechazada, sin fila", async () => {
    for (const targetType of ["VIDEO", "COMMENT"] as const) {
      expect(
        await denunciar(prisma, {
          reporterId: denunciante,
          targetType,
          targetId: "no-existe",
          reason: "SPAM",
        }),
        targetType,
      ).toEqual({ estado: "rechazada", motivo: "NO_DISPONIBLE" });
    }
    expect(await denuncias()).toHaveLength(0);
  });

  it("un vídeo que ya no se ve, o un comentario retirado: el MISMO rechazo", async () => {
    const retirado = await crearVideo();
    await prisma.video.update({ where: { id: retirado }, data: { status: "REMOVED" } });

    const vivo = await crearVideo();
    const borrado = await crearComentario(vivo);
    await prisma.comment.update({
      where: { id: borrado },
      data: { retiradoEn: new Date(), retiradoMotivo: "AUTOR" },
    });

    // Y un comentario cuyo VÍDEO deja de verse tampoco se denuncia.
    const deOculto = await crearComentario(retirado);

    expect(
      await denunciar(prisma, {
        reporterId: denunciante,
        targetType: "VIDEO",
        targetId: retirado,
        reason: "SPAM",
      }),
    ).toEqual({ estado: "rechazada", motivo: "NO_DISPONIBLE" });
    expect(
      await denunciar(prisma, {
        reporterId: denunciante,
        targetType: "COMMENT",
        targetId: borrado,
        reason: "SPAM",
      }),
    ).toEqual({ estado: "rechazada", motivo: "NO_DISPONIBLE" });
    expect(
      await denunciar(prisma, {
        reporterId: denunciante,
        targetType: "COMMENT",
        targetId: deOculto,
        reason: "SPAM",
      }),
    ).toEqual({ estado: "rechazada", motivo: "NO_DISPONIBLE" });
    expect(await denuncias()).toHaveLength(0);
  });

  it("un id de COMENTARIO pasado como VÍDEO (y al revés) no cuela", async () => {
    const videoId = await crearVideo();
    const commentId = await crearComentario(videoId);

    expect(
      await denunciar(prisma, {
        reporterId: denunciante,
        targetType: "VIDEO",
        targetId: commentId,
        reason: "SPAM",
      }),
    ).toEqual({ estado: "rechazada", motivo: "NO_DISPONIBLE" });
    expect(
      await denunciar(prisma, {
        reporterId: denunciante,
        targetType: "COMMENT",
        targetId: videoId,
        reason: "SPAM",
      }),
    ).toEqual({ estado: "rechazada", motivo: "NO_DISPONIBLE" });
    expect(await denuncias()).toHaveLength(0);
  });
});

describe("nadie se denuncia a sí mismo", () => {
  it("el dueño del vídeo y el autor del comentario: rechazada, sin fila", async () => {
    const videoId = await crearVideo();
    const commentId = await crearComentario(videoId);

    expect(
      await denunciar(prisma, {
        reporterId: autor,
        targetType: "VIDEO",
        targetId: videoId,
        reason: "SPAM",
      }),
    ).toEqual({ estado: "rechazada", motivo: "PROPIO" });
    expect(
      await denunciar(prisma, {
        reporterId: autor,
        targetType: "COMMENT",
        targetId: commentId,
        reason: "SPAM",
      }),
    ).toEqual({ estado: "rechazada", motivo: "PROPIO" });
    expect(await denuncias()).toHaveLength(0);
  });

  it("un comentario MÍO en un vídeo ajeno tampoco (manda quién escribió el comentario)", async () => {
    const videoId = await crearVideo(autor);
    const mio = await crearComentario(videoId, denunciante);

    expect(
      await denunciar(prisma, {
        reporterId: denunciante,
        targetType: "COMMENT",
        targetId: mio,
        reason: "SPAM",
      }),
    ).toEqual({ estado: "rechazada", motivo: "PROPIO" });
  });
});

describe("denunciar NO oculta nada (eso es la pieza 3)", () => {
  it("el vídeo sigue en el feed y el comentario en su lista", async () => {
    const videoId = await crearVideo();
    const commentId = await crearComentario(videoId);
    // Tres personas distintas: aunque hubiera umbral, esta pieza no lo aplica.
    for (let i = 0; i < 3; i += 1) {
      const quien = await crearUsuario(prisma);
      await denunciar(prisma, {
        reporterId: quien,
        targetType: "VIDEO",
        targetId: videoId,
        reason: "SPAM",
      });
      await denunciar(prisma, {
        reporterId: quien,
        targetType: "COMMENT",
        targetId: commentId,
        reason: "SPAM",
      });
    }

    const { items } = await feedPublicado(prisma, { firmar: firmarFake });
    expect(items.map((i) => i.id)).toContain(videoId);
    const pagina = await listarComentarios(prisma, videoId);
    expect(pagina?.items.map((c) => c.id)).toEqual([commentId]);
  });
});
