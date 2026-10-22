/**
 * RECONCILIACIÓN DE LOS CONTADORES DESNORMALIZADOS (integridad de datos, no moderación).
 *
 * ┌─ LOS TRES CACHÉS, Y POR QUÉ SE DESVÍAN ─────────────────────────────────────────────────────┐
 * │ `Submission.voteCount`, `Video.commentCount` y `Video.likeCount` NO son la verdad: son caché │
 * │ de `Vote`, `Comment` y `Like`. Existen porque un `COUNT` por fila no se puede pintar en un   │
 * │ feed, y se mantienen con `increment`/`decrement` dentro de la misma transacción que la fila  │
 * │ fuente, con la fila bloqueada antes. Eso es correcto y no se toca.                            │
 * │                                                                                               │
 * │ Pero un contador que se mantiene A BASE DE DELTAS acumula: un borrado en cascada, un arreglo │
 * │ a mano en la base, un camino nuevo que se olvida de uno de los tres, una transacción que     │
 * │ muere entre el INSERT y el UPDATE. Nada de eso falla a la vista: el número queda mal y se    │
 * │ queda así para siempre, porque no hay quien lo mire. Esto es quien lo mira.                   │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ SE ESCRIBE EL VALOR ABSOLUTO RECONTADO, NUNCA UN DELTA ────────────────────────────────────┐
 * │ Es la misma regla que `RankingMensual.victorias` y `User.victoriasTotales`: el recuento se   │
 * │ escribe entero, así que re-ejecutar el barrido CONVERGE en vez de acumular. Un "corrige la   │
 * │ diferencia" con `increment` tendría que ser exacto a la primera, y si no lo fuera la segunda │
 * │ pasada empeoraría lo que la primera dejó a medias.                                            │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * INCREMENTAL, con cobertura completa: igual que `reconciliacion-publicados`, cada barrido lee un
 * CURSOR ROTATORIO de `SystemState`, revisa como mucho `lotePorCiclo` filas con `id > cursor` y
 * guarda el último id; al llegar al final reinicia -> round-robin de coste FIJO por ciclo que, a lo
 * largo de muchos barridos, cubre la tabla entera. Son DOS cursores porque son dos tablas.
 *
 * EL ORDEN DE BLOQUEO ES EL MISMO QUE EL DE LOS CAMINOS VIVOS: se bloquea la fila (Video o
 * Submission) con `SELECT … FOR UPDATE` y DENTRO de esa transacción se cuenta y se escribe. Contar
 * fuera y escribir después sería una carrera con un like simultáneo: el barrido machacaría con un
 * número ya viejo, que es peor que el desvío que viene a arreglar. Y NO se toca ni una fila de
 * `User` aquí dentro: ese es el veto de deadlock del repositorio.
 */
import "server-only";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type { Db } from "@/server/db/types";
import { sanearError } from "@/server/observability/sanitize-error";
import { escribirEstado, leerEstado } from "@/server/services/system-state";

import { COMENTARIO_VISIBLE } from "./comentario-visible";
import { LEDGER_TX_OPTIONS } from "./ledger";

/** Claves en SystemState de los dos cursores rotatorios. Fuente única aquí. */
export const RECON_CONTADORES_CURSOR_VIDEO = "recon_contadores_cursor_video";
export const RECON_CONTADORES_CURSOR_SUBMISSION = "recon_contadores_cursor_submission";

/** Qué contador se corrigió. Se cuenta por tipo: un desvío en uno solo no dice lo mismo que en los tres. */
export interface CorreccionesContadores {
  likeCount: number;
  commentCount: number;
  voteCount: number;
}

export interface ResultadoContadores {
  videosRevisados: number;
  submissionsRevisadas: number;
  corregidos: CorreccionesContadores;
  /** true si ESA tabla llegó al final y reinició su cursor (wrap round-robin). */
  reinicioVideos: boolean;
  reinicioSubmissions: boolean;
}

export interface OpcionesContadores {
  /** Filas revisadas por barrido y por tabla (coste FIJO por ciclo). */
  lotePorCiclo: number;
  log?: (m: string) => void;
}

/**
 * QUÉ CUENTA COMO COMENTARIO PARA EL CONTADOR, en un solo sitio.
 *
 * Es la MISMA regla con la que el contador se mueve en vivo (`COMENTARIO_VISIBLE`: ni retirado ni
 * auto-oculto) y la misma con la que se listan. Si el barrido contara con otra regla, "corregiría"
 * todos los vídeos del producto en cada pasada hacia un número que la aplicación no usa — un
 * reparador que estropea es peor que no tener reparador.
 */
export const CONTADOR_COMENTARIOS_VISIBLE = COMENTARIO_VISIBLE;

/** Bloquea la fila ANTES de contar. Mismo orden que `darLike`, `publicarComentario` y `votar`. */
async function bloquear(tx: Db, tabla: "Video" | "Submission", id: string): Promise<void> {
  const sql =
    tabla === "Video"
      ? Prisma.sql`SELECT \`id\` FROM \`Video\` WHERE \`id\` = ${id} FOR UPDATE`
      : Prisma.sql`SELECT \`id\` FROM \`Submission\` WHERE \`id\` = ${id} FOR UPDATE`;
  await tx.$executeRaw(sql);
}

/**
 * Recuenta los DOS contadores de un vídeo y escribe los que no cuadren. Devuelve cuáles se
 * corrigieron. Una sola transacción y un solo bloqueo para los dos: son la misma fila.
 */
async function reconciliarVideo(
  db: PrismaClient,
  videoId: string,
): Promise<{ likeCount: boolean; commentCount: boolean }> {
  return db.$transaction(async (tx) => {
    await bloquear(tx, "Video", videoId);
    const fila = await tx.video.findUnique({
      where: { id: videoId },
      select: { likeCount: true, commentCount: true },
    });
    // Desapareció entre el lote y ahora: no hay nada que reconciliar, y no es un error.
    if (!fila) return { likeCount: false, commentCount: false };

    const [likes, comentarios] = await Promise.all([
      tx.like.count({ where: { videoId } }),
      tx.comment.count({ where: { videoId, ...CONTADOR_COMENTARIOS_VISIBLE } }),
    ]);

    const corregirLikes = fila.likeCount !== likes;
    const corregirComentarios = fila.commentCount !== comentarios;
    // SOLO SI CAMBIA: un `update` por fila en cada barrido movería el `updatedAt` de toda la
    // tabla cada vuelta del round-robin, y ese campo lo mira quien depura.
    if (corregirLikes || corregirComentarios) {
      await tx.video.update({
        where: { id: videoId },
        data: {
          ...(corregirLikes ? { likeCount: likes } : {}),
          ...(corregirComentarios ? { commentCount: comentarios } : {}),
        },
      });
    }
    return { likeCount: corregirLikes, commentCount: corregirComentarios };
  }, LEDGER_TX_OPTIONS);
}

/** Recuenta `voteCount` de una participación y lo escribe si no cuadra. */
async function reconciliarSubmission(db: PrismaClient, submissionId: string): Promise<boolean> {
  return db.$transaction(async (tx) => {
    await bloquear(tx, "Submission", submissionId);
    const fila = await tx.submission.findUnique({
      where: { id: submissionId },
      select: { voteCount: true },
    });
    if (!fila) return false;

    const votos = await tx.vote.count({ where: { submissionId } });
    if (fila.voteCount === votos) return false;

    await tx.submission.update({ where: { id: submissionId }, data: { voteCount: votos } });
    return true;
  }, LEDGER_TX_OPTIONS);
}

/**
 * Un barrido. Recorre un lote de vídeos y un lote de participaciones desde sus cursores, recuenta
 * cada contador desde su tabla fuente y escribe los que no cuadren.
 *
 * IDEMPOTENTE POR CONSTRUCCIÓN: lo que escribe es el recuento, no una diferencia, así que dos
 * pasadas seguidas dejan exactamente lo mismo y la segunda no corrige nada.
 *
 * UN FALLO POR FILA NO ROMPE EL BARRIDO: se anota y se sigue. El cursor avanza igual —la fila que
 * falló vuelve a tocar en la siguiente vuelta del round-robin—, porque pararse en una fila
 * problemática dejaría el resto de la tabla sin revisar para siempre.
 */
export async function reconciliarContadores(
  db: PrismaClient,
  opts: OpcionesContadores,
): Promise<ResultadoContadores> {
  const corregidos: CorreccionesContadores = { likeCount: 0, commentCount: 0, voteCount: 0 };

  // ── VÍDEOS: likeCount + commentCount ──────────────────────────────────────────────────────
  const cursorVideo = (await leerEstado(db, RECON_CONTADORES_CURSOR_VIDEO)) ?? "";
  const videos = await db.video.findMany({
    where: { id: { gt: cursorVideo } },
    select: { id: true },
    orderBy: { id: "asc" },
    take: opts.lotePorCiclo,
  });

  for (const v of videos) {
    try {
      const r = await reconciliarVideo(db, v.id);
      if (r.likeCount) corregidos.likeCount += 1;
      if (r.commentCount) corregidos.commentCount += 1;
    } catch (e) {
      opts.log?.(`[contadores] vídeo ${v.id}: ${sanearError(e)}`);
    }
  }

  const reinicioVideos = videos.length < opts.lotePorCiclo;
  await escribirEstado(
    db,
    RECON_CONTADORES_CURSOR_VIDEO,
    reinicioVideos ? "" : (videos.at(-1)?.id ?? ""),
  );

  // ── PARTICIPACIONES: voteCount ────────────────────────────────────────────────────────────
  const cursorSub = (await leerEstado(db, RECON_CONTADORES_CURSOR_SUBMISSION)) ?? "";
  const subs = await db.submission.findMany({
    where: { id: { gt: cursorSub } },
    select: { id: true },
    orderBy: { id: "asc" },
    take: opts.lotePorCiclo,
  });

  for (const s of subs) {
    try {
      if (await reconciliarSubmission(db, s.id)) corregidos.voteCount += 1;
    } catch (e) {
      opts.log?.(`[contadores] participación ${s.id}: ${sanearError(e)}`);
    }
  }

  const reinicioSubmissions = subs.length < opts.lotePorCiclo;
  await escribirEstado(
    db,
    RECON_CONTADORES_CURSOR_SUBMISSION,
    reinicioSubmissions ? "" : (subs.at(-1)?.id ?? ""),
  );

  return {
    videosRevisados: videos.length,
    submissionsRevisadas: subs.length,
    corregidos,
    reinicioVideos,
    reinicioSubmissions,
  };
}
