/**
 * LA COLA DE MODERACIÓN — contra la BD.
 *
 * Lo que se fija:
 *  - AGRUPA POR OBJETO y ordena por DENUNCIANTES DISTINTOS (desc). Gracias al UNIQUE de `Report`, el
 *    recuento no se puede inflar: una persona cuenta una vez por objeto, denuncie lo que denuncie.
 *  - SOLO las denuncias ABIERTAS: lo resuelto o descartado no vuelve a la cola.
 *  - KEYSET de verdad: paginar no repite ni se salta objetos, ni siquiera cuando entran denuncias
 *    nuevas entre página y página.
 *  - Cada fila trae con QUÉ decidir: autor, motivos sin repetir y el contenido.
 *  - Filtrada por reto, es la misma consulta: la ficha del reto y la cola no pueden contradecirse.
 *
 * Para romperlo: quitar el filtro `status = 'OPEN'` (rojo), cambiar el orden a `createdAt` (rojo en
 * el orden por gravedad), o paginar con OFFSET (rojo en la paginación con denuncias nuevas).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";
import {
  contarDenunciasAbiertas,
  listarColaModeracion,
} from "../src/server/services/cola-moderacion";
import { denunciar } from "../src/server/services/denuncias";
import type { Firmante } from "../src/server/services/feed";
import { generarPublicCode } from "../src/server/services/reto-codigo";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

let prisma: PrismaClient;
let autor: string;
let n = 0;

const firmarFake: Firmante = (bunnyVideoId) => ({
  src: `https://fake/${bunnyVideoId}.m3u8`,
  poster: `https://fake/${bunnyVideoId}.jpg`,
});
const cola = (opts: { cursor?: string | null; limite?: number; challengeId?: string } = {}) =>
  listarColaModeracion(prisma, { ...opts, firmar: firmarFake });

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

async function crearVideo(propietario = autor): Promise<string> {
  n += 1;
  const v = await prisma.video.create({
    data: {
      userId: propietario,
      bunnyVideoId: `cola-${n}`,
      status: "PUBLISHED",
      category: "fitness",
      title: `Vídeo ${n}`,
    },
    select: { id: true },
  });
  return v.id;
}

async function crearComentario(videoId: string, propietario = autor): Promise<string> {
  const c = await prisma.comment.create({
    data: { videoId, userId: propietario, texto: "Un comentario denunciado" },
    select: { id: true },
  });
  return c.id;
}

/** `cuantos` personas distintas denuncian el objeto. Devuelve sus ids. */
async function denunciadoPor(
  targetType: "VIDEO" | "COMMENT",
  targetId: string,
  cuantos: number,
  reason: "SPAM" | "ACOSO" = "SPAM",
): Promise<string[]> {
  const gente: string[] = [];
  for (let i = 0; i < cuantos; i += 1) {
    const quien = await crearUsuario(prisma);
    await denunciar(prisma, { reporterId: quien, targetType, targetId, reason });
    gente.push(quien);
  }
  return gente;
}

describe("qué entra en la cola y en qué orden", () => {
  it("agrupa por objeto y ordena por denunciantes distintos, de más a menos", async () => {
    const pocos = await crearVideo();
    const muchos = await crearVideo();
    const medio = await crearVideo();
    await denunciadoPor("VIDEO", pocos, 1);
    await denunciadoPor("VIDEO", muchos, 3);
    await denunciadoPor("VIDEO", medio, 2);

    const { items } = await cola();

    expect(items.map((i) => i.targetId)).toEqual([muchos, medio, pocos]);
    expect(items.map((i) => i.denunciantes)).toEqual([3, 2, 1]);
  });

  it("una persona cuenta UNA vez por objeto (lo impide el UNIQUE, no un DISTINCT)", async () => {
    const videoId = await crearVideo();
    const [quien] = await denunciadoPor("VIDEO", videoId, 1);

    // La misma persona insiste, incluso con otro motivo: no infla el recuento.
    await denunciar(prisma, {
      reporterId: quien!,
      targetType: "VIDEO",
      targetId: videoId,
      reason: "ACOSO",
    });

    const { items } = await cola();
    expect(items[0]?.denunciantes).toBe(1);
  });

  it("solo cuentan las ABIERTAS: lo resuelto o descartado no vuelve", async () => {
    const videoId = await crearVideo();
    await denunciadoPor("VIDEO", videoId, 3);
    // Dos de las tres ya se revisaron.
    await prisma.report.updateMany({
      where: { targetId: videoId },
      data: { status: "DISMISSED" },
    });
    expect((await cola()).items).toEqual([]);
    expect(await contarDenunciasAbiertas(prisma)).toBe(0);

    // Alguien NUEVO la denuncia: vuelve a la cola, contando solo la nueva.
    await denunciadoPor("VIDEO", videoId, 1);
    const { items } = await cola();
    expect(items[0]?.denunciantes).toBe(1);
  });

  it("vídeos y comentarios conviven, cada uno con su contenido y su autor", async () => {
    const videoId = await crearVideo();
    const commentId = await crearComentario(videoId);
    await denunciadoPor("VIDEO", videoId, 2, "SPAM");
    await denunciadoPor("COMMENT", commentId, 1, "ACOSO");

    const { items } = await cola();

    const video = items.find((i) => i.targetType === "VIDEO")!;
    expect(video.autor.username).toBe("autora");
    expect(video.video).toMatchObject({ titulo: "Vídeo 1", retirado: false });
    expect(video.video?.poster).toContain("https://fake/");
    expect(video.comentario).toBeNull();

    const comentario = items.find((i) => i.targetType === "COMMENT")!;
    expect(comentario.comentario).toMatchObject({
      texto: "Un comentario denunciado",
      retirado: false,
      videoId,
    });
    expect(comentario.video).toBeNull();
  });

  it("los motivos llegan sin repetir", async () => {
    const videoId = await crearVideo();
    await denunciadoPor("VIDEO", videoId, 2, "SPAM");
    await denunciadoPor("VIDEO", videoId, 1, "ACOSO");

    const { items } = await cola();
    expect([...(items[0]?.motivos ?? [])].sort()).toEqual(["ACOSO", "SPAM"]);
  });

  it("un objeto que ya no existe no se modera: ni en la lista NI en el recuento", async () => {
    const videoId = await crearVideo();
    await denunciadoPor("VIDEO", videoId, 2);
    // Las denuncias quedan apuntando a algo que no está (el objeto desapareció).
    await prisma.report.updateMany({
      where: { targetId: videoId },
      data: { targetId: "fantasma" },
    });

    expect((await cola()).items).toEqual([]);
    // Y el RECUENTO también tiene que ignorarlas. Este es el que de verdad prueba el filtro del SQL:
    // la lista sola podía pasar por otra razón —la hidratación descarta lo que no encuentra—, así que
    // sin esto el invariante se cumplía por accidente. Lo cazó una rotura a propósito.
    expect(await contarDenunciasAbiertas(prisma)).toBe(0);
  });
});

describe("paginación keyset", () => {
  it("recorre la cola entera sin repetir ni saltarse nada", async () => {
    const esperado: string[] = [];
    // Cinco objetos con recuentos distintos: 5, 4, 3, 2, 1.
    for (let i = 5; i >= 1; i -= 1) {
      const videoId = await crearVideo();
      await denunciadoPor("VIDEO", videoId, i);
      esperado.push(videoId);
    }

    const vistos: string[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 10; i += 1) {
      const p: Awaited<ReturnType<typeof cola>> = await cola({ cursor, limite: 2 });
      vistos.push(...p.items.map((x) => x.targetId));
      cursor = p.nextCursor;
      if (!cursor) break;
    }

    expect(vistos).toEqual(esperado);
  });

  it("dos objetos con el MISMO recuento no se pisan (el id desempata)", async () => {
    const a = await crearVideo();
    const b = await crearVideo();
    await denunciadoPor("VIDEO", a, 2);
    await denunciadoPor("VIDEO", b, 2);

    const p1 = await cola({ limite: 1 });
    const p2 = await cola({ cursor: p1.nextCursor, limite: 1 });

    expect(p1.items).toHaveLength(1);
    expect(p2.items).toHaveLength(1);
    expect(p1.items[0]!.targetId).not.toBe(p2.items[0]!.targetId);
    expect([p1.items[0]!.targetId, p2.items[0]!.targetId].sort()).toEqual([a, b].sort());
  });
});

describe("acotada a un reto (la ficha del panel)", () => {
  async function retoConParticipacion() {
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
    await prisma.submission.create({
      data: { challengeId: reto.id, userId: autor, videoId, status: "PUBLISHED" },
    });
    return { retoId: reto.id, videoId };
  }

  it("solo lo de ese reto, y el recuento de su ficha cuadra con su lista", async () => {
    const { retoId, videoId } = await retoConParticipacion();
    const suelto = await crearVideo(); // de nadie: no es de este reto
    await denunciadoPor("VIDEO", videoId, 2);
    await denunciadoPor("VIDEO", suelto, 5);

    const { items } = await cola({ challengeId: retoId });

    expect(items.map((i) => i.targetId)).toEqual([videoId]);
    // La cifra de la ficha cuenta DENUNCIAS (filas), no objetos, y sale del mismo sitio.
    expect(await contarDenunciasAbiertas(prisma, { challengeId: retoId })).toBe(2);
    // Y la cola general sí ve las dos cosas.
    expect((await cola()).items).toHaveLength(2);
  });

  it("los comentarios de una participación también son de ese reto", async () => {
    const { retoId, videoId } = await retoConParticipacion();
    const commentId = await crearComentario(videoId);
    await denunciadoPor("COMMENT", commentId, 1);

    const { items } = await cola({ challengeId: retoId });
    expect(items.map((i) => i.targetId)).toEqual([commentId]);
  });
});
