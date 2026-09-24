/**
 * COMENTARIOS (Fase 2, el tramo que quedaba) — publicar, leer y retirar los comentarios de un VÍDEO.
 *
 * DE QUÉ CUELGAN: del VÍDEO, no de la participación. El panel vive en el feed, que es una lista de
 * vídeos (de reto y subidas libres); y cuando una participación cambia de vídeo (reemplazo), los
 * comentarios se quedan con el vídeo que la gente comentó, igual que los votos no se heredan.
 *
 * EL CONTADOR: `Video.commentCount`, desnormalizado como `Submission.voteCount`. Se toca SIEMPRE en la
 * MISMA transacción que la fila (publicar suma, retirar resta), con `increment`, y la fila del vídeo se
 * BLOQUEA antes con `SELECT ... FOR UPDATE`: sin ese bloqueo, dos comentarios a la vez sobre el mismo
 * vídeo dan el error 1020 de MariaDB (medido con los votos: ver `votes.ts`). Cuenta solo los VISIBLES.
 *
 * EL AVISO: COMENTARIO al dueño del vídeo, en la MISMA transacción que el comentario (existen los dos o
 * ninguno), con la clave del COMENTARIO: cada uno avisa una vez. Comentar tu propio vídeo está
 * permitido, pero nadie se avisa a sí mismo. Un comentario es un REGISTRO, como el voto: retirarlo lo
 * oculta y baja el contador, pero no retira el aviso que ya se emitió.
 *
 * VISIBILIDAD: solo se lee o se escribe sobre un vídeo VISIBLE (`VIDEO_VISIBLE`, la regla del feed). Un
 * vídeo retirado, borrado por su dueño o sustituido se lleva sus comentarios: no se destruyen (son
 * material de moderación, como el propio vídeo REMOVED), dejan de verse.
 *
 * Recibe el `PrismaClient` por parámetro, como el resto de servicios. Devuelve resultados TIPADOS; el
 * copy humano es cosa de la ruta.
 */
import { COMENTARIOS_PAGINA, type RetiradaComentario } from "@/config/constants";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { limpiarComentario } from "@/lib/comentarios";
import { avisoComentario } from "@/lib/notificaciones";
import type { Db } from "@/server/db/types";

import { LEDGER_TX_OPTIONS } from "./ledger";
import { emitirAviso } from "./notificaciones";
import { VIDEO_VISIBLE } from "./video-visible";

/** Un comentario tal y como lo pinta el panel. */
export interface ComentarioVista {
  id: string;
  texto: string;
  creadoMs: number;
  /** El autor, con sus PUNTOS: el avatar deriva de ellos su anillo de nivel (`lib/niveles`). Es una
   *  columna mas en una relacion que ya se traia, no una consulta nueva. */
  autor: {
    username: string;
    displayName: string | null;
    image: string | null;
    pointsBalance: number;
  };
  /** ¿Lo escribió quien mira? Para ofrecerle borrarlo. `false` sin sesión. */
  esMio: boolean;
}

export interface PaginaComentarios {
  items: ComentarioVista[];
  /** Cursor OPACO de la página siguiente; `null` = no hay más. */
  nextCursor: string | null;
}

export type MotivoRechazoComentario =
  /** El vídeo no existe o no se ve (o el comentario no existe o no es tuyo): el MISMO 404. */
  | "NO_DISPONIBLE"
  /** Texto vacío o pasado del tope. */
  | "TEXTO_INVALIDO";

export type ResultadoPublicar =
  | { estado: "publicado"; comentario: ComentarioVista; comentarios: number }
  | { estado: "rechazado"; motivo: MotivoRechazoComentario };

export type ResultadoRetirar =
  { estado: "retirado"; comentarios: number } | { estado: "rechazado"; motivo: "NO_DISPONIBLE" };

/** PRIMERO bloquear la fila del vídeo (su contador), luego leer. Ver la cabecera. */
async function bloquearVideo(tx: Db, videoId: string): Promise<void> {
  await tx.$executeRaw(
    Prisma.sql`SELECT \`id\` FROM \`Video\` WHERE \`id\` = ${videoId} FOR UPDATE`,
  );
}

/**
 * PUBLICAR un comentario: la fila, el contador y el aviso al dueño, todo en UNA transacción.
 */
export async function publicarComentario(
  db: PrismaClient,
  input: { userId: string; videoId: string; texto: string },
): Promise<ResultadoPublicar> {
  const texto = limpiarComentario(input.texto);
  if (texto === null) return { estado: "rechazado", motivo: "TEXTO_INVALIDO" };

  return db.$transaction(async (tx) => {
    await bloquearVideo(tx, input.videoId);
    const video = await tx.video.findFirst({
      where: { id: input.videoId, ...VIDEO_VISIBLE },
      select: {
        userId: true,
        submission: {
          select: {
            status: true,
            challenge: { select: { title: true, publicCode: true, slug: true } },
          },
        },
      },
    });
    if (!video) return { estado: "rechazado", motivo: "NO_DISPONIBLE" };

    const autor = await tx.user.findUniqueOrThrow({
      where: { id: input.userId },
      select: { username: true, displayName: true, image: true, pointsBalance: true },
    });
    const c = await tx.comment.create({
      data: { videoId: input.videoId, userId: input.userId, texto },
      select: { id: true, createdAt: true },
    });
    const { commentCount } = await tx.video.update({
      where: { id: input.videoId },
      data: { commentCount: { increment: 1 } },
      select: { commentCount: true },
    });

    // AVISO al dueño, en la MISMA transacción. Comentar tu propio vídeo no te avisa a ti.
    if (video.userId !== input.userId) {
      const sub = video.submission?.status === "PUBLISHED" ? video.submission : null;
      await emitirAviso(
        tx,
        video.userId,
        avisoComentario({
          commentId: c.id,
          autor: autor.username,
          reto: sub
            ? {
                titulo: sub.challenge.title,
                codigo: sub.challenge.publicCode,
                slug: sub.challenge.slug,
              }
            : null,
        }),
      );
    }

    return {
      estado: "publicado",
      comentario: { id: c.id, texto, creadoMs: c.createdAt.getTime(), autor, esMio: true },
      comentarios: commentCount,
    };
  }, LEDGER_TX_OPTIONS);
}

/**
 * EL NÚCLEO de la retirada suave, DENTRO de la transacción de quien llama. Dos caminos lo usan y no
 * pueden divergir: el del AUTOR (que borra el suyo) y el de MODERACIÓN (que retira el de otro).
 *
 * Lo que cambia entre ellos es UNA cosa: si el `userId` va en el WHERE. En el del autor va, y es su
 * autorización POR CONSTRUCCIÓN —uno ajeno no casa y responde el mismo 404 que uno inexistente—; en el
 * de moderación no va, porque el moderador retira precisamente lo que no es suyo. El resto —marcar,
 * no volver a descontar si ya estaba retirado, y decrementar el contador en la MISMA transacción— es
 * idéntico, así que se escribe una sola vez.
 *
 * `null` = no hay nada que retirar (no existe, o no es de quien dice). Nunca lanza por eso.
 */
export async function retirarComentarioEnTx(
  tx: Db,
  input: {
    commentId: string;
    videoId: string;
    motivo: RetiradaComentario;
    /** Solo el camino del AUTOR lo pasa: es su autorización. */
    userId?: string;
    ahora?: Date;
  },
): Promise<{ estado: "retirado" | "ya_estaba"; comentarios: number } | null> {
  await bloquearVideo(tx, input.videoId);
  const deQuien = input.userId === undefined ? {} : { userId: input.userId };

  const r = await tx.comment.updateMany({
    where: { id: input.commentId, ...deQuien, retiradoEn: null },
    data: { retiradoEn: input.ahora ?? new Date(), retiradoMotivo: input.motivo },
  });
  if (r.count === 0) {
    // O no existe / no es suyo (404), o ya estaba retirado (doble clic: ok, sin volver a descontar).
    const existe = await tx.comment.findFirst({
      where: { id: input.commentId, ...deQuien },
      select: { id: true },
    });
    if (!existe) return null;
    const v = await tx.video.findUniqueOrThrow({
      where: { id: input.videoId },
      select: { commentCount: true },
    });
    return { estado: "ya_estaba", comentarios: v.commentCount };
  }
  const { commentCount } = await tx.video.update({
    where: { id: input.videoId },
    data: { commentCount: { decrement: 1 } },
    select: { commentCount: true },
  });
  return { estado: "retirado", comentarios: commentCount };
}

/**
 * RETIRAR un comentario PROPIO (el autor lo borra). Retirada SUAVE: se marca y deja de verse; baja el
 * contador en la misma transacción. Idempotente: retirarlo dos veces no descuenta dos. El aviso que
 * emitió se queda (es un registro). La retirada por MODERACIÓN usa el mismo núcleo con otro motivo.
 */
export async function retirarComentario(
  db: PrismaClient,
  input: { userId: string; commentId: string; ahora?: Date },
): Promise<ResultadoRetirar> {
  // FUERA de la transacción, SOLO para saber qué fila de vídeo bloquear (como `moverVoto`): dentro se
  // vuelve a comprobar todo, ya con el bloqueo puesto.
  const previo = await db.comment.findUnique({
    where: { id: input.commentId },
    select: { videoId: true },
  });
  if (!previo) return { estado: "rechazado", motivo: "NO_DISPONIBLE" };

  return db.$transaction(async (tx) => {
    const r = await retirarComentarioEnTx(tx, {
      commentId: input.commentId,
      videoId: previo.videoId,
      motivo: "AUTOR",
      userId: input.userId,
      ahora: input.ahora,
    });
    if (!r) return { estado: "rechazado", motivo: "NO_DISPONIBLE" };
    return { estado: "retirado", comentarios: r.comentarios };
  }, LEDGER_TX_OPTIONS);
}

/**
 * UN comentario suelto por su id, con el vídeo al que pertenece. Lo usa el DEEP-LINK del aviso: si el
 * comentario del aviso es viejo y ya no cae en la primera página de la lista, el panel lo pide por aquí
 * y lo ancla arriba en vez de dejar al usuario buscándolo.
 *
 * `null` si el comentario está retirado o su vídeo no se ve: el aviso degrada, no miente.
 */
export async function comentarioSuelto(
  db: Db,
  commentId: string,
  opciones: { userId?: string | null } = {},
): Promise<{ comentario: ComentarioVista; videoId: string } | null> {
  const f = await db.comment.findFirst({
    where: { id: commentId, retiradoEn: null, video: VIDEO_VISIBLE },
    select: {
      id: true,
      texto: true,
      createdAt: true,
      videoId: true,
      userId: true,
      user: { select: { username: true, displayName: true, image: true, pointsBalance: true } },
    },
  });
  if (!f) return null;
  return {
    videoId: f.videoId,
    comentario: {
      id: f.id,
      texto: f.texto,
      creadoMs: f.createdAt.getTime(),
      autor: f.user,
      esMio: opciones.userId ? f.userId === opciones.userId : false,
    },
  };
}

function codificarCursor(ms: number, id: string): string {
  return `${ms}.${id}`;
}

/** Cursor inválido o manipulado -> primera página. Nunca una excepción por un query param. */
function leerCursor(raw: string | null | undefined): { en: Date; id: string } | null {
  if (!raw) return null;
  const m = /^(\d{1,15})\.([A-Za-z0-9_-]{1,64})$/.exec(raw);
  if (!m?.[1] || !m[2]) return null;
  const ms = Number(m[1]);
  if (!Number.isSafeInteger(ms)) return null;
  return { en: new Date(ms), id: m[2] };
}

/**
 * LEER los comentarios de un vídeo, más nuevos primero, por KEYSET (createdAt, id) sobre el índice
 * [videoId, createdAt, id]. Solo los visibles. El autor viaja en la MISMA consulta (una relación que
 * Prisma resuelve para toda la página), nunca una por comentario.
 *
 * `null` si el vídeo no se ve: sus comentarios se van con él.
 */
export async function listarComentarios(
  db: Db,
  videoId: string,
  opciones: { cursor?: string | null; limite?: number; userId?: string | null } = {},
): Promise<PaginaComentarios | null> {
  const visible = await db.video.findFirst({
    where: { id: videoId, ...VIDEO_VISIBLE },
    select: { id: true },
  });
  if (!visible) return null;

  const limite = Math.min(Math.max(opciones.limite ?? COMENTARIOS_PAGINA, 1), 50);
  const desde = leerCursor(opciones.cursor);
  const filas = await db.comment.findMany({
    where: {
      videoId,
      retiradoEn: null,
      ...(desde
        ? {
            OR: [{ createdAt: { lt: desde.en } }, { createdAt: desde.en, id: { lt: desde.id } }],
          }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limite + 1,
    select: {
      id: true,
      texto: true,
      createdAt: true,
      userId: true,
      user: { select: { username: true, displayName: true, image: true, pointsBalance: true } },
    },
  });

  const pagina = filas.slice(0, limite);
  const ultima = pagina[pagina.length - 1];
  return {
    items: pagina.map((f) => ({
      id: f.id,
      texto: f.texto,
      creadoMs: f.createdAt.getTime(),
      autor: f.user,
      esMio: opciones.userId ? f.userId === opciones.userId : false,
    })),
    nextCursor:
      filas.length > limite && ultima
        ? codificarCursor(ultima.createdAt.getTime(), ultima.id)
        : null,
  };
}
