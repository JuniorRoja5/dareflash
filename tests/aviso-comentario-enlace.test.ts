/**
 * EL AVISO DE COMENTARIO LLEVA AL COMENTARIO. Antes llevaba al reto (o al perfil): abría la pantalla,
 * pero no el comentario del que hablaba.
 *
 * El vídeo NO viaja en la fila del aviso: se une por `refId` al leer la bandeja, como el texto de los
 * anuncios, así que los avisos ya emitidos también enlazan bien. Y esa unión es UNA consulta por
 * página, no una por aviso.
 *
 * Degradar es parte del trato: si el comentario se retiró o el vídeo ya no se ve, el aviso vuelve a su
 * enlace de siempre en vez de llevar a un feed que no puede enseñar nada.
 *
 * Para romperlo a propósito: quitar el filtro de retirados o el de vídeo visible en `videosDeComentarios`
 * (rojo en los casos de degradación); pasarle los avisos de uno en uno (rojo en el de una sola consulta);
 * devolver el enlace del reto aunque haya vídeo (rojo en el primero).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { enlaceComentario } from "../src/lib/enlace-comentario";
import type { PrismaClient } from "../src/generated/prisma/client";
import { avisoComentario, textoAviso } from "../src/lib/notificaciones";
import { publicarComentario, retirarComentario } from "../src/server/services/comentarios";
import { listarNotificaciones } from "../src/server/services/notificaciones";
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
async function videoLibre(): Promise<string> {
  n += 1;
  const v = await prisma.video.create({
    data: { userId: dueno, bunnyVideoId: `enl-${n}`, status: "PUBLISHED", category: "fitness" },
    select: { id: true },
  });
  return v.id;
}

/** Un vídeo que es la participación PUBLICADA de un reto publicado. */
async function videoDeReto() {
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
    select: { id: true, publicCode: true, slug: true },
  });
  const v = await prisma.video.create({
    data: { userId: dueno, bunnyVideoId: `enl-${n}`, status: "PUBLISHED" },
    select: { id: true },
  });
  await prisma.submission.create({
    data: { challengeId: reto.id, userId: dueno, videoId: v.id, status: "PUBLISHED" },
  });
  return { videoId: v.id, reto };
}

async function comentar(videoId: string, texto = "¡Qué nivel!"): Promise<string> {
  const r = await publicarComentario(prisma, { userId: autor, videoId, texto });
  if (r.estado !== "publicado") throw new Error("no se publicó");
  return r.comentario.id;
}
const bandeja = () => listarNotificaciones(prisma, dueno);

describe("el enlace del aviso", () => {
  it("lleva AL COMENTARIO: al feed, por su vídeo y con el comentario", async () => {
    const videoId = await videoLibre();
    const commentId = await comentar(videoId);

    const { items } = await bandeja();

    expect(items).toHaveLength(1);
    expect(items[0]!.href).toBe(enlaceComentario(videoId, commentId));
    // Y el enlace lleva los dos datos que el feed necesita, escapados.
    expect(items[0]!.href).toContain(`video=${videoId}`);
    expect(items[0]!.href).toContain(`comentario=${commentId}`);
  });

  it("en una participación también lleva al comentario, no al reto", async () => {
    const { videoId, reto } = await videoDeReto();
    const commentId = await comentar(videoId);

    const { items } = await bandeja();

    expect(items[0]!.href).toBe(enlaceComentario(videoId, commentId));
    expect(items[0]!.href).not.toContain(reto.publicCode);
  });

  it("comentario RETIRADO: el aviso se queda, y su enlace vuelve al reto", async () => {
    const { videoId, reto } = await videoDeReto();
    const commentId = await comentar(videoId);
    await retirarComentario(prisma, { userId: autor, commentId });

    const { items } = await bandeja();

    expect(items).toHaveLength(1); // el aviso NO se retracta
    expect(items[0]!.href).toBe(`/retos/${reto.publicCode}-${reto.slug}`);
  });

  it("vídeo que ya no se ve: el enlace cae al perfil en una subida libre", async () => {
    const videoId = await videoLibre();
    await comentar(videoId);
    await prisma.video.update({ where: { id: videoId }, data: { status: "REMOVED" } });

    const { items } = await bandeja();

    expect(items[0]!.href).toBe("/perfil");
  });

  it("una página de avisos de comentario resuelve sus vídeos en UNA consulta, no una por aviso", async () => {
    const videoId = await videoLibre();
    for (let i = 0; i < 6; i += 1) await comentar(videoId, `C${i}`);

    const llamadas: string[] = [];
    const db = new Proxy(prisma, {
      get(obj, prop) {
        const valor = Reflect.get(obj, prop) as unknown;
        if (prop !== "comment") return valor;
        return new Proxy(valor as object, {
          get(delegado, metodo) {
            const fn = Reflect.get(delegado, metodo) as unknown;
            if (typeof fn !== "function" || typeof metodo !== "string") return fn;
            return (...args: unknown[]) => {
              llamadas.push(metodo);
              return (fn as (...a: unknown[]) => unknown).apply(delegado, args);
            };
          },
        });
      },
    });

    const { items } = await listarNotificaciones(db, dueno);

    expect(items).toHaveLength(6);
    expect(items.every((i) => i.href.startsWith("/feed?"))).toBe(true);
    expect(llamadas).toEqual(["findMany"]);
  });
});

/**
 * El enlace tiene DOS extremos: quien lo escribe (el aviso) y quien lo lee (el feed). Los tests de
 * arriba fijan el primero; este fija que el segundo sigue enchufado —y por la MISMA fuente de los
 * nombres de los parámetros, que es lo que impide que uno cambie y el otro se entere en producción.
 */
describe("el feed consume el enlace (estructural)", () => {
  const leer = (rel: string) => readFileSync(path.resolve(__dirname, "..", "src", rel), "utf8");

  it("la página del feed lee los parámetros de la fuente única y abre por ese vídeo", () => {
    const src = leer("app/(app)/feed/page.tsx");
    expect(src).toContain('from "@/lib/enlace-comentario"');
    expect(src).toContain("PARAM_VIDEO");
    expect(src).toContain("PARAM_COMENTARIO");
    // El vídeo pedido se carga aparte y se pone DELANTE: el feed abre por él aunque no estuviera.
    expect(src).toContain("videoParaFeed");
    expect(src).toMatch(/comentarioDestacado=\{/);
  });

  it("el feed pasa el ancla a las DOS superficies: panel de escritorio y hoja de móvil", () => {
    const src = leer("components/feed/feed-vertical.tsx");
    expect(src.match(/anclaId=\{anclaComentario\}/g)?.length).toBe(2);
    expect(src.match(/anclaComentario=\{/g)?.length).toBe(2);
  });
});

describe("textoAviso (puro)", () => {
  const aviso = avisoComentario({ commentId: "c1", autor: "ana", reto: null });

  it("con el vídeo en el contexto, enlaza al comentario", () => {
    const t = textoAviso(aviso, { comentarios: new Map([["c1", "vid-9"]]) });
    expect(t?.href).toBe("/feed?video=vid-9&comentario=c1");
    // El texto no cambia: el enlace es lo único que se movió.
    expect(t?.es).toBe("@ana ha comentado tu vídeo.");
  });

  it("sin el vídeo, el de siempre; y un mapa de OTRO comentario no lo confunde", () => {
    expect(textoAviso(aviso)?.href).toBe("/perfil");
    expect(textoAviso(aviso, { comentarios: new Map([["otro", "vid-9"]]) })?.href).toBe("/perfil");
  });
});
