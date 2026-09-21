/**
 * CONSULTA del FEED PUBLICO (Rama 3 — datos reales). Lista videos PUBLISHED, mas nuevos primero, con
 * PAGINACION POR CURSOR (keyset), y devuelve ya lo que la vista necesita: autor, caption, votos reales
 * y las URLs de reproduccion FIRMADAS.
 *
 * PAGINACION (esquema, documentado): cursor = `id` del ultimo video devuelto. Orden estable por
 * `[createdAt desc, id desc]` (el `id` desempata: cuid monotono, evita saltarse/duplicar filas cuando
 * dos videos comparten `createdAt`). Se piden `limit+1` filas: si vienen mas del limite, hay pagina
 * siguiente y `nextCursor` es el id de la ultima fila visible; si no, `nextCursor = null`. La primera
 * pagina la sirve el Server Component; las siguientes, el endpoint publico `/api/feed?cursor=...`.
 *
 * CONTENIDO PUBLICO: solo `status = PUBLISHED` y de usuarios ni borrados ni baneados. El voto/reto
 * salen de la Submission del video SOLO si ella misma esta PUBLISHED (regla del modelo: entre
 * Video.status y Submission.status manda el mas restrictivo).
 *
 * La FIRMA se inyecta (`firmar`) en vez de leer `env` aqui: asi la consulta es testeable sin entorno
 * (los tests pasan un firmante falso) y la lectura de `env` vive en el borde (page / route handler).
 */
import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { nombreCategoria } from "@/lib/categorias";
import { retoEstaAbierto } from "@/lib/reto-ventana";
import type { Db } from "@/server/db/types";

import { categoriaKeyDeVideo } from "./categoria-video";
import { VIDEO_VISIBLE } from "./video-visible";

/** Un post del feed, listo para pintar. `categoria` es el nombre ya resuelto (o null si no participa). */
export interface PostFeed {
  id: string;
  /** Nombre visible (opcional). Si falta, el `username` hace de nombre en la UI. */
  displayName: string | null;
  username: string;
  retoTitulo: string;
  categoria: string | null;
  votos: number;
  /** Comentarios VISIBLES del vídeo (Video.commentCount). Es del VÍDEO, así que también en una subida
   *  libre. */
  comentarios: number;
  src: string;
  poster: string;
  /**
   * Participacion a la que pertenece el video, si lo es. `null` en una subida LIBRE (sin reto): no se
   * vota, asi que tampoco se marca como vista.
   *
   * Hace falta APARTE del `id` de arriba, que es el del VIDEO: las rutas de participacion
   * (`/api/participaciones/[id]/…`) hablan de Submission, y pasarles un id de Video daria 404.
   */
  participacionId: string | null;
  /** Reto al que pertenece. `null` en una subida LIBRE. Es la CLAVE del estado de voto en cliente:
   *  la regla del producto es "un voto por reto", asi que el boton necesita saber de que reto habla. */
  retoId: string | null;
  /** ¿Admite votos AHORA? Misma regla que aplica el servidor al votar (`lib/reto-ventana`), para que
   *  el boton no prometa lo que la API va a rechazar. `false` sin participacion. */
  retoAbierto: boolean;
  /**
   * Participacion de ESTE reto donde el usuario ya tiene su voto (`null` = no ha votado, o es un
   * invitado). Va en el payload para que el boton pinte el estado correcto EN LA CARGA y no tras el
   * primer tap: sin esto haria falta una ida y vuelta por cada video del feed.
   */
  miVoto: string | null;
  /**
   * ¿El vídeo es de quien mira? Lo decide el SERVIDOR comparando ids (nunca el cliente comparando
   * nombres). Lo usa lo que no tiene sentido ofrecer sobre lo propio, empezando por denunciar.
   */
  esMio: boolean;
}

export interface PaginaFeed {
  items: PostFeed[];
  /** Cursor para la SIGUIENTE pagina (id del ultimo video). `null` = no hay mas. */
  nextCursor: string | null;
}

/** Firma la reproduccion de un video ya conocido como PUBLISHED. Inyectable (testeable sin `env`). */
export type Firmante = (
  bunnyVideoId: string,
  thumbnailFileName: string | null,
) => { src: string; poster: string };

export const FEED_LIMITE_DEFECTO = 8;
export const FEED_LIMITE_MAX = 20;

/**
 * Lo que el feed lee de un vídeo. UNO SOLO para la lista y para el vídeo suelto del deep-link: si se
 * copiara, las dos formas de entrar al feed podrían divergir en lo que pintan.
 */
const SELECT_FEED = {
  id: true,
  // El dueño, para resolver `esMio` sin una segunda consulta.
  userId: true,
  bunnyVideoId: true,
  thumbnailFileName: true,
  title: true,
  category: true,
  commentCount: true,
  user: { select: { username: true, displayName: true } },
  submission: {
    select: {
      id: true,
      status: true,
      voteCount: true,
      challengeId: true,
      challenge: {
        select: { title: true, category: true, status: true, startsAt: true, deadline: true },
      },
    },
  },
} as const;

type FilaFeed = Prisma.VideoGetPayload<{ select: typeof SELECT_FEED }>;

/** De fila a post. Igual de único que el `select`, y por la misma razón. */
function aPostFeed(
  v: FilaFeed,
  ctx: {
    firmar: Firmante;
    misVotos: ReadonlyMap<string, string>;
    ahora: Date;
    userId?: string | null;
  },
): PostFeed {
  // Submission visible solo si su propio status es PUBLISHED (el mas restrictivo gana).
  const sub = v.submission && v.submission.status === "PUBLISHED" ? v.submission : null;
  // Categoria: con Submission publicada -> la del reto; sin ella -> la del video libre (Video.category).
  const claveCategoria = categoriaKeyDeVideo({ submission: v.submission, category: v.category });
  const urls = ctx.firmar(v.bunnyVideoId, v.thumbnailFileName);
  return {
    id: v.id,
    displayName: v.user.displayName,
    username: v.user.username,
    retoTitulo: sub?.challenge.title ?? v.title ?? "Vídeo",
    categoria: nombreCategoria(claveCategoria),
    votos: sub?.voteCount ?? 0,
    comentarios: v.commentCount,
    src: urls.src,
    poster: urls.poster,
    // Del MISMO `sub` que ya filtra por "publicada": una participacion oculta no sale como votable.
    participacionId: sub?.id ?? null,
    retoId: sub?.challengeId ?? null,
    retoAbierto: sub ? retoEstaAbierto(sub.challenge, ctx.ahora) : false,
    miVoto: sub ? (ctx.misVotos.get(sub.challengeId) ?? null) : null,
    esMio: ctx.userId ? v.userId === ctx.userId : false,
  };
}

/**
 * MI VOTO en los retos de un lote de vídeos, en UNA sola consulta (no una por vídeo). Sin sesión no se
 * consulta nada: el feed es público y no debe pagar una consulta por un dato que no aplica.
 */
async function misVotosDe(
  db: Db,
  filas: FilaFeed[],
  userId: string | null | undefined,
): Promise<Map<string, string>> {
  const misVotos = new Map<string, string>();
  const retosVisibles = [
    ...new Set(
      filas
        .map((v) => (v.submission?.status === "PUBLISHED" ? v.submission.challengeId : null))
        .filter((id): id is string => id !== null),
    ),
  ];
  if (!userId || retosVisibles.length === 0) return misVotos;
  const votos = await db.vote.findMany({
    where: { userId, challengeId: { in: retosVisibles } },
    select: { challengeId: true, submissionId: true },
  });
  for (const f of votos) misVotos.set(f.challengeId, f.submissionId);
  return misVotos;
}

/**
 * UN vídeo concreto en forma de post, o `null` si no se ve. Lo usa el DEEP-LINK del aviso de comentario
 * (`/feed?video=…`): el feed abre POR ese vídeo, esté o no en la primera página. Misma regla de
 * visibilidad (`VIDEO_VISIBLE`) y mismo mapeo que la lista, así que un vídeo retirado da `null` aquí
 * igual que desaparece de allí.
 */
export async function videoParaFeed(
  db: Db,
  id: string,
  opts: { firmar: Firmante; userId?: string | null; ahora?: Date },
): Promise<PostFeed | null> {
  const fila = await db.video.findFirst({ where: { id, ...VIDEO_VISIBLE }, select: SELECT_FEED });
  if (!fila) return null;
  const misVotos = await misVotosDe(db, [fila], opts.userId);
  return aPostFeed(fila, {
    firmar: opts.firmar,
    misVotos,
    ahora: opts.ahora ?? new Date(),
    userId: opts.userId,
  });
}

export async function feedPublicado(
  db: Db,
  opts: {
    cursor?: string | null;
    limit?: number;
    firmar: Firmante;
    /** Usuario en sesion, para resolver `miVoto`. Sin el (invitado), `miVoto` es siempre `null` y NO
     *  se consulta nada: el feed es publico y no debe pagar una consulta por un dato que no aplica. */
    userId?: string | null;
    /** "ahora" inyectable, para poder testear la ventana del reto de forma determinista. */
    ahora?: Date;
  },
): Promise<PaginaFeed> {
  const limite = Math.min(
    Math.max(1, Math.floor(opts.limit ?? FEED_LIMITE_DEFECTO)),
    FEED_LIMITE_MAX,
  );

  const filas = await db.video.findMany({
    // Que se ve lo decide `VIDEO_VISIBLE` (sin reemplazos en vuelo, sin autores borrados o baneados,
    // sin retos borrados, subidas libres solo con categoria): la MISMA regla que los comentarios.
    where: VIDEO_VISIBLE,
    select: SELECT_FEED,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limite + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });

  const hayMas = filas.length > limite;
  const visibles = hayMas ? filas.slice(0, limite) : filas;

  // MI VOTO, en UNA sola consulta para toda la pagina (no una por video).
  const misVotos = await misVotosDe(db, visibles, opts.userId);
  const ahora = opts.ahora ?? new Date();
  const items: PostFeed[] = visibles.map((v) =>
    aPostFeed(v, { firmar: opts.firmar, misVotos, ahora, userId: opts.userId }),
  );

  return {
    items,
    nextCursor: hayMas ? (visibles[visibles.length - 1]?.id ?? null) : null,
  };
}
