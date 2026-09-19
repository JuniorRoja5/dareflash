/**
 * COMENTARIOS (Fase 2): publicar, leer y retirar, contra la BD.
 *
 * Lo que se fija, con lupa en el aviso y el contador:
 *  - publicar inserta la fila, sube `Video.commentCount` y avisa COMENTARIO al dueño, todo junto;
 *  - comentar tu propio vídeo no te avisa a ti; cada comentario avisa UNA vez;
 *  - diez a la vez sobre el mismo vídeo: diez filas y el contador en 10, sin error;
 *  - solo sobre un vídeo VISIBLE (la regla del feed);
 *  - la lista pagina por keyset, solo visibles, sin N+1;
 *  - retirar oculta y baja el contador, sin retirar el aviso ya emitido.
 *
 * Para romperlo a propósito: quitar el `if` del autoaviso (rojo), incrementar fuera de la transacción o
 * no incrementar (rojo), quitar el bloqueo de la fila del vídeo (rojo en la concurrencia), dejar de
 * filtrar los retirados (rojo), decrementar en la segunda retirada (rojo).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { COMENTARIO_TEXTO_MAX } from "../src/config/constants";
import type { PrismaClient } from "../src/generated/prisma/client";
import { avisoComentario, textoAviso } from "../src/lib/notificaciones";
import {
  comentarioSuelto,
  listarComentarios,
  publicarComentario,
  retirarComentario,
} from "../src/server/services/comentarios";
import { emitirAviso } from "../src/server/services/notificaciones";
import { generarPublicCode } from "../src/server/services/reto-codigo";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

let prisma: PrismaClient;
let dueno: string;
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
  dueno = await crearUsuario(prisma, { username: "duena_del_video" });
  autor = await crearUsuario(prisma, { username: "comentarista" });
});

/** Un vídeo LIBRE publicado (con categoría: así el feed lo enseña). */
async function videoLibre(propietario = dueno): Promise<string> {
  n += 1;
  const v = await prisma.video.create({
    data: {
      userId: propietario,
      bunnyVideoId: `com-${n}`,
      status: "PUBLISHED",
      category: "fitness",
    },
    select: { id: true },
  });
  return v.id;
}

/** Un vídeo que es la participación PUBLICADA de un reto publicado. */
async function videoDeReto(propietario = dueno) {
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
      createdById: dueno,
    },
    select: { id: true, title: true, publicCode: true, slug: true },
  });
  const v = await prisma.video.create({
    data: { userId: propietario, bunnyVideoId: `com-${n}`, status: "PUBLISHED" },
    select: { id: true },
  });
  await prisma.submission.create({
    data: { challengeId: reto.id, userId: propietario, videoId: v.id, status: "PUBLISHED" },
  });
  return { videoId: v.id, reto };
}

const publicar = (videoId: string, texto = "¡Qué nivel!", quien = autor) =>
  publicarComentario(prisma, { userId: quien, videoId, texto });

const contador = async (videoId: string) =>
  (await prisma.video.findUniqueOrThrow({ where: { id: videoId }, select: { commentCount: true } }))
    .commentCount;
const avisosDe = (userId: string) =>
  prisma.notification.findMany({ where: { userId, tipo: "COMENTARIO" } });

describe("publicar", () => {
  it("inserta el comentario, sube el contador y avisa al dueño, todo a la vez", async () => {
    const { videoId, reto } = await videoDeReto();

    const r = await publicar(videoId, "  ¡Qué nivel!  ");

    expect(r.estado).toBe("publicado");
    if (r.estado !== "publicado") return;
    expect(r.comentario).toMatchObject({
      texto: "¡Qué nivel!",
      esMio: true,
      autor: { username: "comentarista" },
    });
    expect(r.comentarios).toBe(1);
    expect(await prisma.comment.count({ where: { videoId } })).toBe(1);
    expect(await contador(videoId)).toBe(1);

    const avisos = await avisosDe(dueno);
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatchObject({
      refType: "COMMENT",
      refId: r.comentario.id,
      datos: {
        autor: "comentarista",
        reto: { titulo: reto.title, codigo: reto.publicCode, slug: reto.slug },
      },
    });
    // El aviso NO lleva el texto del comentario.
    expect(JSON.stringify(avisos[0]!.datos)).not.toContain("nivel");
  });

  it("comentar TU PROPIO vídeo se publica y cuenta, pero no te avisa a ti", async () => {
    const videoId = await videoLibre();
    const r = await publicar(videoId, "Os leo", dueno);

    expect(r.estado).toBe("publicado");
    expect(await contador(videoId)).toBe(1);
    expect(await avisosDe(dueno)).toHaveLength(0);
  });

  it("dos comentarios son dos avisos; el aviso de UN comentario no se duplica", async () => {
    const videoId = await videoLibre();
    const a = await publicar(videoId, "Primero");
    await publicar(videoId, "Segundo");
    expect(await avisosDe(dueno)).toHaveLength(2);

    if (a.estado !== "publicado") throw new Error("no se publicó");
    // Re-emitir el aviso del mismo comentario (un reintento): la UNIQUE lo deja en uno.
    const otraVez = await emitirAviso(
      prisma,
      dueno,
      avisoComentario({ commentId: a.comentario.id, autor: "comentarista", reto: null }),
    );
    expect(otraVez).toBe(false);
    expect(await avisosDe(dueno)).toHaveLength(2);
  });

  it("en una subida libre, el aviso no tiene reto y lleva al perfil", async () => {
    const videoId = await videoLibre();
    await publicar(videoId);
    const [aviso] = await avisosDe(dueno);
    expect(aviso?.datos).toEqual({ autor: "comentarista", reto: null });
    expect(textoAviso(aviso!)).toMatchObject({
      es: "@comentarista ha comentado tu vídeo.",
      href: "/perfil",
    });
  });

  it("DIEZ comentarios A LA VEZ sobre el mismo vídeo: diez filas, contador 10, sin error", async () => {
    const videoId = await videoLibre();
    const gente: string[] = [];
    for (let i = 0; i < 10; i += 1) gente.push(await crearUsuario(prisma));

    const r = await Promise.all(gente.map((g) => publicar(videoId, "¡Vamos!", g)));

    expect(r.every((x) => x.estado === "publicado")).toBe(true);
    expect(await prisma.comment.count({ where: { videoId } })).toBe(10);
    expect(await contador(videoId)).toBe(10);
    expect(await avisosDe(dueno)).toHaveLength(10);
  });

  it("texto vacío, solo espacios o pasado del tope: rechazado y nada escrito", async () => {
    const videoId = await videoLibre();
    for (const texto of ["", "    ", "x".repeat(COMENTARIO_TEXTO_MAX + 1)]) {
      expect(await publicar(videoId, texto)).toEqual({
        estado: "rechazado",
        motivo: "TEXTO_INVALIDO",
      });
    }
    expect(await prisma.comment.count()).toBe(0);
    expect(await contador(videoId)).toBe(0);
  });

  it("un vídeo que NO se ve no admite comentarios (la regla del feed)", async () => {
    const retirado = await videoLibre();
    await prisma.video.update({ where: { id: retirado }, data: { status: "REMOVED" } });
    const reemplazo = await videoLibre();
    await prisma.video.update({
      where: { id: reemplazo },
      data: { reemplazaSubmissionId: "sub-x" },
    });
    const baneada = await crearUsuario(prisma);
    const deBaneada = await videoLibre(baneada);
    await prisma.user.update({ where: { id: baneada }, data: { bannedAt: new Date() } });
    const { videoId: deRetoBorrado, reto } = await videoDeReto();
    await prisma.challenge.update({ where: { id: reto.id }, data: { deletedAt: new Date() } });

    for (const videoId of [retirado, reemplazo, deBaneada, deRetoBorrado, "no-existe"]) {
      expect(await publicar(videoId), videoId).toEqual({
        estado: "rechazado",
        motivo: "NO_DISPONIBLE",
      });
    }
    expect(await prisma.comment.count()).toBe(0);
    expect(await prisma.notification.count()).toBe(0);
  });
});

describe("leer", () => {
  it("pagina por KEYSET, más nuevos primero, sin repetir ni saltar", async () => {
    const videoId = await videoLibre();
    for (let i = 0; i < 25; i += 1) await publicar(videoId, `Comentario ${i}`);
    const esperado = (
      await prisma.comment.findMany({
        where: { videoId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { id: true },
      })
    ).map((c) => c.id);

    const vistos: string[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 10; i += 1) {
      const p: Awaited<ReturnType<typeof listarComentarios>> = await listarComentarios(
        prisma,
        videoId,
        { cursor, limite: 10 },
      );
      vistos.push(...p!.items.map((c) => c.id));
      cursor = p!.nextCursor;
      if (!cursor) break;
    }
    expect(vistos).toEqual(esperado);
  });

  it("solo los VISIBLES, con su autor, y dice cuáles son de quien mira", async () => {
    const videoId = await videoLibre();
    const a = await publicar(videoId, "Se queda");
    const b = await publicar(videoId, "Se va");
    if (a.estado !== "publicado" || b.estado !== "publicado") throw new Error("no se publicó");
    await retirarComentario(prisma, { userId: autor, commentId: b.comentario.id });

    const deAutor = await listarComentarios(prisma, videoId, { userId: autor });
    expect(deAutor?.items.map((c) => c.texto)).toEqual(["Se queda"]);
    expect(deAutor?.items[0]).toMatchObject({
      esMio: true,
      autor: { username: "comentarista", displayName: null, image: null },
    });
    // Un invitado los ve igual, pero ninguno es "suyo".
    expect((await listarComentarios(prisma, videoId))?.items[0]?.esMio).toBe(false);
  });

  it("un vídeo que ya no se ve se lleva sus comentarios: null", async () => {
    const videoId = await videoLibre();
    await publicar(videoId);
    await prisma.video.update({ where: { id: videoId }, data: { status: "REMOVED" } });
    expect(await listarComentarios(prisma, videoId)).toBeNull();
    // No se destruyen: siguen en la BD (material de moderación, como el vídeo retirado).
    expect(await prisma.comment.count({ where: { videoId } })).toBe(1);
  });

  it("sin N+1: una consulta de comentarios por página, con el autor dentro", async () => {
    const videoId = await videoLibre();
    for (let i = 0; i < 6; i += 1) await publicar(videoId, `C${i}`, await crearUsuario(prisma));

    const llamadas: string[] = [];
    const espia = <T extends object>(delegado: T, nombre: string): T =>
      new Proxy(delegado, {
        get(obj, prop) {
          const valor = Reflect.get(obj, prop) as unknown;
          if (typeof valor === "function" && typeof prop === "string") {
            return (...args: unknown[]) => {
              llamadas.push(`${nombre}.${prop}`);
              return (valor as (...a: unknown[]) => unknown).apply(obj, args);
            };
          }
          return valor;
        },
      });
    const db = new Proxy(prisma, {
      get(obj, prop) {
        if (prop === "comment") return espia(obj.comment, "comment");
        if (prop === "user") return espia(obj.user, "user");
        if (prop === "video") return espia(obj.video, "video");
        return Reflect.get(obj, prop) as unknown;
      },
    });

    const p = await listarComentarios(db, videoId);

    expect(p?.items).toHaveLength(6);
    expect(new Set(p?.items.map((c) => c.autor.username)).size).toBe(6);
    expect(llamadas).toEqual(["video.findFirst", "comment.findMany"]);
  });
});

describe("uno suelto, por su id (el del aviso)", () => {
  it("lo devuelve con su vídeo, y dice si es de quien mira", async () => {
    const videoId = await videoLibre();
    const r = await publicar(videoId, "El del aviso");
    if (r.estado !== "publicado") throw new Error("no se publicó");

    expect(await comentarioSuelto(prisma, r.comentario.id, { userId: autor })).toEqual({
      videoId,
      comentario: {
        id: r.comentario.id,
        texto: "El del aviso",
        creadoMs: expect.any(Number),
        autor: { username: "comentarista", displayName: null, image: null },
        esMio: true,
      },
    });
    // Para otra persona (o un invitado) es el mismo comentario, pero no es suyo.
    expect(
      (await comentarioSuelto(prisma, r.comentario.id, { userId: dueno }))?.comentario.esMio,
    ).toBe(false);
    expect((await comentarioSuelto(prisma, r.comentario.id))?.comentario.esMio).toBe(false);
  });

  it("retirado, de un vídeo que ya no se ve, o inexistente: null", async () => {
    const videoId = await videoLibre();
    const retirado = await publicar(videoId, "Se retira");
    if (retirado.estado !== "publicado") throw new Error("no se publicó");
    await retirarComentario(prisma, { userId: autor, commentId: retirado.comentario.id });

    const otroVideo = await videoLibre();
    const deOculto = await publicar(otroVideo, "Su vídeo se va");
    if (deOculto.estado !== "publicado") throw new Error("no se publicó");
    await prisma.video.update({ where: { id: otroVideo }, data: { status: "REMOVED" } });

    for (const id of [retirado.comentario.id, deOculto.comentario.id, "no-existe"]) {
      expect(await comentarioSuelto(prisma, id), id).toBeNull();
    }
  });
});

describe("retirar", () => {
  it("lo oculta y baja el contador, pero el aviso que emitió se queda", async () => {
    const videoId = await videoLibre();
    const r = await publicar(videoId);
    if (r.estado !== "publicado") throw new Error("no se publicó");

    expect(await retirarComentario(prisma, { userId: autor, commentId: r.comentario.id })).toEqual({
      estado: "retirado",
      comentarios: 0,
    });
    expect(await contador(videoId)).toBe(0);
    expect((await listarComentarios(prisma, videoId))?.items).toEqual([]);
    // Retirada SUAVE: la fila sigue, marcada.
    expect(
      await prisma.comment.findUniqueOrThrow({ where: { id: r.comentario.id } }),
    ).toMatchObject({ retiradoMotivo: "AUTOR" });
    // Un comentario es un REGISTRO: su aviso no se retira.
    expect(await avisosDe(dueno)).toHaveLength(1);
  });

  it("retirarlo DOS veces no descuenta dos (idempotente)", async () => {
    const videoId = await videoLibre();
    const r = await publicar(videoId);
    await publicar(videoId, "Otro");
    if (r.estado !== "publicado") throw new Error("no se publicó");

    await retirarComentario(prisma, { userId: autor, commentId: r.comentario.id });
    expect(await retirarComentario(prisma, { userId: autor, commentId: r.comentario.id })).toEqual({
      estado: "retirado",
      comentarios: 1,
    });
    expect(await contador(videoId)).toBe(1);
  });

  it("uno AJENO o que no existe: NO_DISPONIBLE, y no se toca nada", async () => {
    const videoId = await videoLibre();
    const r = await publicar(videoId);
    if (r.estado !== "publicado") throw new Error("no se publicó");

    expect(await retirarComentario(prisma, { userId: dueno, commentId: r.comentario.id })).toEqual({
      estado: "rechazado",
      motivo: "NO_DISPONIBLE",
    });
    expect(await retirarComentario(prisma, { userId: autor, commentId: "no-existe" })).toEqual({
      estado: "rechazado",
      motivo: "NO_DISPONIBLE",
    });
    expect(await contador(videoId)).toBe(1);
  });

  it("DIEZ retiradas A LA VEZ sobre el mismo vídeo: contador a 0, sin error", async () => {
    const videoId = await videoLibre();
    const hechos: { quien: string; id: string }[] = [];
    for (let i = 0; i < 10; i += 1) {
      const quien = await crearUsuario(prisma);
      const r = await publicar(videoId, `C${i}`, quien);
      if (r.estado === "publicado") hechos.push({ quien, id: r.comentario.id });
    }
    expect(await contador(videoId)).toBe(10);

    const r = await Promise.all(
      hechos.map((h) => retirarComentario(prisma, { userId: h.quien, commentId: h.id })),
    );

    expect(r.every((x) => x.estado === "retirado")).toBe(true);
    expect(await contador(videoId)).toBe(0);
  });

  it("el contador CUADRA con los comentarios visibles tras publicar y retirar", async () => {
    const videoId = await videoLibre();
    const ids: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      const r = await publicar(videoId, `C${i}`);
      if (r.estado === "publicado") ids.push(r.comentario.id);
    }
    await retirarComentario(prisma, { userId: autor, commentId: ids[1]! });
    await retirarComentario(prisma, { userId: autor, commentId: ids[3]! });

    const visibles = await prisma.comment.count({ where: { videoId, retiradoEn: null } });
    expect(visibles).toBe(3);
    expect(await contador(videoId)).toBe(visibles);
  });
});
