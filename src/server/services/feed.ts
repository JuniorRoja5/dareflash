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

import { CATEGORIES } from "@/config/constants";
import { retoEstaAbierto } from "@/lib/reto-ventana";
import type { Db } from "@/server/db/types";

import { categoriaKeyDeVideo } from "./categoria-video";

/** Un post del feed, listo para pintar. `categoria` es el nombre ya resuelto (o null si no participa). */
export interface PostFeed {
  id: string;
  /** Nombre visible (opcional). Si falta, el `username` hace de nombre en la UI. */
  displayName: string | null;
  username: string;
  retoTitulo: string;
  categoria: string | null;
  votos: number;
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

/** Nombre visible de una categoria por su `key`; si la key no esta en el maestro, se muestra tal cual. */
function nombreCategoria(key: string | null | undefined): string | null {
  if (!key) return null;
  return CATEGORIES.find((c) => c.key === key)?.es ?? key;
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
    // `reemplazaSubmissionId: null` excluye los REEMPLAZOS en vuelo (un Video de reemplazo, aun tras
    // pasar a PUBLISHED, no debe salir en el feed hasta que el swap lo convierta en la participacion).
    // Un video SIN Submission aparece SOLO si tiene `category` (subida libre); asi un video suelto sin
    // categoria (o un reemplazo antes de tener submission) no se cuela.
    where: {
      status: "PUBLISHED",
      reemplazaSubmissionId: null,
      user: { deletedAt: null, bannedAt: null },
      OR: [{ submission: { isNot: null } }, { category: { not: null } }],
    },
    select: {
      id: true,
      bunnyVideoId: true,
      thumbnailFileName: true,
      title: true,
      category: true,
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
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limite + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });

  const hayMas = filas.length > limite;
  const visibles = hayMas ? filas.slice(0, limite) : filas;

  // MI VOTO, en UNA sola consulta para toda la pagina (no una por video): los retos de los videos
  // visibles, cruzados con mis votos. Sin sesion no se consulta nada.
  const retosVisibles = [
    ...new Set(
      visibles
        .map((v) => (v.submission?.status === "PUBLISHED" ? v.submission.challengeId : null))
        .filter((id): id is string => id !== null),
    ),
  ];
  const misVotos = new Map<string, string>();
  if (opts.userId && retosVisibles.length > 0) {
    const filas = await db.vote.findMany({
      where: { userId: opts.userId, challengeId: { in: retosVisibles } },
      select: { challengeId: true, submissionId: true },
    });
    for (const f of filas) misVotos.set(f.challengeId, f.submissionId);
  }
  const ahora = opts.ahora ?? new Date();

  const items: PostFeed[] = visibles.map((v) => {
    // Submission visible solo si su propio status es PUBLISHED (el mas restrictivo gana).
    const sub = v.submission && v.submission.status === "PUBLISHED" ? v.submission : null;
    // Categoria: con Submission publicada -> la del reto; sin ella -> la del video libre (Video.category).
    const claveCategoria = categoriaKeyDeVideo({ submission: v.submission, category: v.category });
    const urls = opts.firmar(v.bunnyVideoId, v.thumbnailFileName);
    return {
      id: v.id,
      displayName: v.user.displayName,
      username: v.user.username,
      retoTitulo: sub?.challenge.title ?? v.title ?? "Vídeo",
      categoria: nombreCategoria(claveCategoria),
      votos: sub?.voteCount ?? 0,
      src: urls.src,
      poster: urls.poster,
      // Del MISMO `sub` que ya filtra por "publicada": una participacion oculta no sale como votable.
      participacionId: sub?.id ?? null,
      retoId: sub?.challengeId ?? null,
      retoAbierto: sub ? retoEstaAbierto(sub.challenge, ahora) : false,
      miVoto: sub ? (misVotos.get(sub.challengeId) ?? null) : null,
    };
  });

  return {
    items,
    nextCursor: hayMas ? (visibles[visibles.length - 1]?.id ?? null) : null,
  };
}
