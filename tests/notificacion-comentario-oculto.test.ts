/**
 * UN AVISO NO ENLAZA A UN COMENTARIO QUE YA NO SE VE.
 *
 * El aviso de "alguien comentó tu vídeo" no guarda el texto: guarda el id del comentario y, al
 * pintarlo, se le une su vídeo para armar el enlace (`videosDeComentarios`). Esa consulta era la
 * ÚLTIMA copia suelta de la condición de visibilidad —`retiradoEn: null` escrito a mano—, así que
 * no sabía nada del ocultado por umbral: el aviso seguía enlazando a un comentario escondido.
 *
 * No es grave —lleva a algo que no se ve, no filtra nada—, pero es exactamente la clase de hueco
 * que deja una condición repetida en vez de compartida. Con `COMENTARIO_VISIBLE`, el comentario
 * oculto no entra en el mapa y el aviso CAE a su destino de reserva, que es lo que ya hacía con
 * los retirados.
 *
 * Para romperlo: devolver `retiradoEn: null` a mano en `videosDeComentarios` (rojo).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { DENUNCIAS_PARA_OCULTAR } from "../src/config/constants";
import type { PrismaClient } from "../src/generated/prisma/client";
import { publicarComentario } from "../src/server/services/comentarios";
import { denunciar } from "../src/server/services/denuncias";
import { videosDeComentarios } from "../src/server/services/notificaciones";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

let prisma: PrismaClient;
let autor: string;

beforeAll(() => {
  prisma = createTestPrisma();
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
  autor = await crearUsuario(prisma, { username: "autora_aviso" });
});

async function videoConComentario(): Promise<{ videoId: string; commentId: string }> {
  const v = await prisma.video.create({
    data: {
      userId: autor,
      bunnyVideoId: `bunny-aviso-${Date.now()}`,
      status: "PUBLISHED",
      category: "RETOS",
    },
    select: { id: true },
  });
  const quien = await crearUsuario(prisma);
  const r = await publicarComentario(prisma, {
    videoId: v.id,
    userId: quien,
    texto: "un comentario cualquiera",
  });
  if (!r || r.estado !== "publicado") throw new Error("no se pudo comentar");
  return { videoId: v.id, commentId: r.comentario.id };
}

/** Lo que `listarNotificaciones` le pasa a `videosDeComentarios`: filas de aviso de comentario. */
const filaAviso = (commentId: string) => [
  { tipo: "COMENTARIO" as const, refType: "COMMENT" as const, refId: commentId },
];

describe("el mapa de enlaces del aviso", () => {
  it("un comentario VISIBLE sí trae su vídeo", async () => {
    const { videoId, commentId } = await videoConComentario();
    const mapa = await videosDeComentarios(prisma, filaAviso(commentId));
    expect(mapa.get(commentId)).toBe(videoId);
  });

  it("uno AUTO-OCULTO por denuncias no entra en el mapa", async () => {
    const { commentId } = await videoConComentario();
    for (let i = 0; i < DENUNCIAS_PARA_OCULTAR; i += 1) {
      const quien = await crearUsuario(prisma);
      await denunciar(prisma, {
        reporterId: quien,
        targetType: "COMMENT",
        targetId: commentId,
        reason: "SPAM",
      });
    }

    const mapa = await videosDeComentarios(prisma, filaAviso(commentId));
    expect(mapa.has(commentId), "el aviso enlazaría a algo que no se ve").toBe(false);
  });

  it("y uno RETIRADO tampoco (lo de siempre, que no se ha roto)", async () => {
    const { commentId } = await videoConComentario();
    await prisma.comment.update({
      where: { id: commentId },
      data: { retiradoEn: new Date(), retiradoMotivo: "MODERACION" },
    });

    const mapa = await videosDeComentarios(prisma, filaAviso(commentId));
    expect(mapa.has(commentId)).toBe(false);
  });
});
