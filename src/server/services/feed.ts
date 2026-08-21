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
import type { Db } from "@/server/db/types";

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
}

export interface PaginaFeed {
  items: PostFeed[];
  /** Cursor para la SIGUIENTE pagina (id del ultimo video). `null` = no hay mas. */
  nextCursor: string | null;
}

/** Firma la reproduccion de un video ya conocido como PUBLISHED. Inyectable (testeable sin `env`). */
export type Firmante = (bunnyVideoId: string) => { src: string; poster: string };

export const FEED_LIMITE_DEFECTO = 8;
export const FEED_LIMITE_MAX = 20;

/** Nombre visible de una categoria por su `key`; si la key no esta en el maestro, se muestra tal cual. */
function nombreCategoria(key: string | null | undefined): string | null {
  if (!key) return null;
  return CATEGORIES.find((c) => c.key === key)?.es ?? key;
}

export async function feedPublicado(
  db: Db,
  opts: { cursor?: string | null; limit?: number; firmar: Firmante },
): Promise<PaginaFeed> {
  const limite = Math.min(
    Math.max(1, Math.floor(opts.limit ?? FEED_LIMITE_DEFECTO)),
    FEED_LIMITE_MAX,
  );

  const filas = await db.video.findMany({
    // `reemplazaSubmissionId: null` excluye los REEMPLAZOS en vuelo (un Video de reemplazo, aun tras
    // pasar a PUBLISHED, no debe salir en el feed hasta que el swap lo convierta en la participacion).
    where: {
      status: "PUBLISHED",
      reemplazaSubmissionId: null,
      user: { deletedAt: null, bannedAt: null },
    },
    select: {
      id: true,
      bunnyVideoId: true,
      title: true,
      user: { select: { username: true, displayName: true } },
      submission: {
        select: {
          status: true,
          voteCount: true,
          challenge: { select: { title: true, category: true } },
        },
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limite + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });

  const hayMas = filas.length > limite;
  const visibles = hayMas ? filas.slice(0, limite) : filas;

  const items: PostFeed[] = visibles.map((v) => {
    // Submission visible solo si su propio status es PUBLISHED (el mas restrictivo gana).
    const sub = v.submission && v.submission.status === "PUBLISHED" ? v.submission : null;
    const urls = opts.firmar(v.bunnyVideoId);
    return {
      id: v.id,
      displayName: v.user.displayName,
      username: v.user.username,
      retoTitulo: sub?.challenge.title ?? v.title ?? "Vídeo",
      categoria: nombreCategoria(sub?.challenge.category),
      votos: sub?.voteCount ?? 0,
      src: urls.src,
      poster: urls.poster,
    };
  });

  return {
    items,
    nextCursor: hayMas ? (visibles[visibles.length - 1]?.id ?? null) : null,
  };
}
