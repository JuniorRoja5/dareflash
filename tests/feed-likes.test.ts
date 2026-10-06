/**
 * LOS LIKES LLEGAN AL FEED, y el "¿le he dado yo?" es de QUIEN MIRA.
 *
 * El servicio de likes puede estar perfecto y el feed no traerlos: entonces el corazón sale
 * apagado y con un cero para todo el mundo, y nadie se entera porque nada falla. Esto fija el
 * puente.
 *
 *  - `likes` es el contador del VÍDEO, así que también en una subida libre (al revés que los votos,
 *    que necesitan un reto detrás).
 *  - `miLike` depende del espectador: el mismo vídeo sale marcado para quien lo quiso y apagado
 *    para el resto. Un `miLike` global sería el bug clásico de servir el estado de otra persona.
 *  - Para un INVITADO siempre es `false`, y sin consultar nada.
 *  - Y se resuelve en UNA consulta para toda la página, no una por vídeo.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";
import { feedPublicado, videoParaFeed, type Firmante } from "../src/server/services/feed";
import { darLike } from "../src/server/services/likes";

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
  autor = await crearUsuario(prisma, { username: "autora_feed_likes" });
});

const firmarFake: Firmante = (bunnyVideoId) => ({
  src: `https://fake/${bunnyVideoId}/playlist.m3u8`,
  poster: `https://fake/${bunnyVideoId}/thumbnail.jpg`,
});

async function crearVideo(): Promise<string> {
  n += 1;
  const v = await prisma.video.create({
    data: {
      userId: autor,
      bunnyVideoId: `bunny-fl-${n}-${Date.now()}`,
      status: "PUBLISHED",
      category: "RETOS",
      title: `video ${n}`,
    },
    select: { id: true },
  });
  return v.id;
}

describe("el recuento", () => {
  it("un vídeo sin likes sale con cero, no con undefined", async () => {
    const videoId = await crearVideo();
    const { items } = await feedPublicado(prisma, { firmar: firmarFake });
    const post = items.find((i) => i.id === videoId)!;
    expect(post.likes).toBe(0);
    expect(post.miLike).toBe(false);
  });

  it("los likes de una SUBIDA LIBRE también cuentan (no hacen falta reto ni participación)", async () => {
    const videoId = await crearVideo();
    const a = await crearUsuario(prisma);
    const b = await crearUsuario(prisma);
    await darLike(prisma, { userId: a, videoId });
    await darLike(prisma, { userId: b, videoId });

    const { items } = await feedPublicado(prisma, { firmar: firmarFake });
    const post = items.find((i) => i.id === videoId)!;
    expect(post.likes).toBe(2);
    expect(post.participacionId, "es una subida libre").toBeNull();
  });
});

describe("`miLike` es de quien mira", () => {
  it("marcado para quien lo quiso, apagado para el resto", async () => {
    const videoId = await crearVideo();
    const quien = await crearUsuario(prisma);
    const otro = await crearUsuario(prisma);
    await darLike(prisma, { userId: quien, videoId });

    const suyo = await feedPublicado(prisma, { firmar: firmarFake, userId: quien });
    expect(suyo.items.find((i) => i.id === videoId)?.miLike).toBe(true);

    const ajeno = await feedPublicado(prisma, { firmar: firmarFake, userId: otro });
    expect(ajeno.items.find((i) => i.id === videoId)?.miLike).toBe(false);
    // Pero el RECUENTO es el mismo para los dos: lo que cambia es de quién es el like.
    expect(ajeno.items.find((i) => i.id === videoId)?.likes).toBe(1);
  });

  it("para un INVITADO siempre es false", async () => {
    const videoId = await crearVideo();
    const quien = await crearUsuario(prisma);
    await darLike(prisma, { userId: quien, videoId });

    const { items } = await feedPublicado(prisma, { firmar: firmarFake });
    expect(items.find((i) => i.id === videoId)?.miLike).toBe(false);
    expect(items.find((i) => i.id === videoId)?.likes).toBe(1);
  });

  it("y con varios vídeos, cada uno lleva el suyo", async () => {
    const a = await crearVideo();
    const b = await crearVideo();
    const c = await crearVideo();
    const quien = await crearUsuario(prisma);
    await darLike(prisma, { userId: quien, videoId: a });
    await darLike(prisma, { userId: quien, videoId: c });

    const { items } = await feedPublicado(prisma, { firmar: firmarFake, userId: quien });
    const por = new Map(items.map((i) => [i.id, i.miLike]));
    expect(por.get(a)).toBe(true);
    expect(por.get(b)).toBe(false);
    expect(por.get(c)).toBe(true);
  });
});

describe("el deep-link del aviso trae lo mismo", () => {
  it("`videoParaFeed` también resuelve likes y miLike", async () => {
    // Es el otro camino que construye un post. Si solo lo trajera la lista, abrir el feed por un
    // enlace daría un corazón apagado sobre un vídeo que sí habías querido.
    const videoId = await crearVideo();
    const quien = await crearUsuario(prisma);
    await darLike(prisma, { userId: quien, videoId });

    const post = await videoParaFeed(prisma, videoId, { firmar: firmarFake, userId: quien });
    expect(post?.likes).toBe(1);
    expect(post?.miLike).toBe(true);
  });
});
