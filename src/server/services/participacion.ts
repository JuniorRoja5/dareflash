/**
 * PARTICIPACIÓN en un reto (Fase 2 · 2b). Reglas del dominio, todas server-only. La pieza delicada es
 * el REEMPLAZO robusto: como el `@@unique([challengeId,userId])` sólo admite UNA Submission por
 * usuario y reto, un reemplazo NO crea una segunda Submission; crea un Video con `reemplazaSubmissionId`
 * apuntando a la participación viva, y sólo cuando ese Video está PUBLISHED se hace el SWAP (repunta la
 * Submission al nuevo Video, marca el viejo REMOVED + encola su borrado en Bunny, limpia el puntero).
 * Si el nuevo falla, la vieja sigue intacta. El swap lo dispara el CLIENTE (rápido) o el WORKER (red de
 * seguridad: reemplazo abandonado); ambos usan `completarReemplazo`, idempotente.
 */
import "server-only";

import type { Db } from "@/server/db/types";
import type { PrismaClient } from "@/generated/prisma/client";

export type ModoParticipacion = "primera" | "reemplazo" | "bloqueada";

export type ResultadoIniciar =
  | { modo: "primera" | "reemplazo"; videoId: string; submissionId: string }
  | { modo: "bloqueada"; motivo: string };

/**
 * Decide y crea la fila para una participación, DENTRO de la transacción de `upload-credential` (que ya
 * creó el objeto en Bunny y pasa aquí su `bunnyGuid`). Casos, según la participación existente del
 * usuario en el reto:
 *  - ninguna              -> PRIMERA: crea Video(PENDING) + Submission(PENDING).
 *  - existe, Video FAILED -> hueco INVÁLIDO: borra la Submission vieja (libera el unique) y crea fresca.
 *  - existe, Video PUBLISHED/PENDING -> REEMPLAZO: crea SÓLO el Video con `reemplazaSubmissionId` = esa
 *    Submission (sin 2ª Submission; respeta el unique). El swap se completa cuando el Video esté PUBLISHED.
 *  - existe, Video REMOVED/REJECTED -> BLOQUEADA: participación retirada por moderación; no re-participa.
 */
export async function iniciarParticipacion(
  tx: Db,
  entrada: { challengeId: string; userId: string; bunnyGuid: string; title: string | null },
): Promise<ResultadoIniciar> {
  const { challengeId, userId, bunnyGuid, title } = entrada;

  const existente = await tx.submission.findUnique({
    where: { challengeId_userId: { challengeId, userId } },
    select: { id: true, video: { select: { status: true } } },
  });

  const crearPrimera = async (): Promise<ResultadoIniciar> => {
    const v = await tx.video.create({
      data: { userId, bunnyVideoId: bunnyGuid, title },
      select: { id: true },
    });
    const s = await tx.submission.create({
      data: { challengeId, userId, videoId: v.id },
      select: { id: true },
    });
    return { modo: "primera", videoId: v.id, submissionId: s.id };
  };

  if (!existente) return crearPrimera();

  const estado = existente.video.status;

  if (estado === "FAILED") {
    // Hueco inválido: la subida anterior no llegó a procesarse. Se libera el unique borrando la
    // Submission vieja (el Video FAILED queda; su objeto en Bunny lo barre la limpieza de huérfanos).
    await tx.submission.delete({ where: { id: existente.id } });
    return crearPrimera();
  }

  if (estado === "PUBLISHED" || estado === "PENDING") {
    const v = await tx.video.create({
      data: { userId, bunnyVideoId: bunnyGuid, title, reemplazaSubmissionId: existente.id },
      select: { id: true },
    });
    return { modo: "reemplazo", videoId: v.id, submissionId: existente.id };
  }

  // REMOVED / REJECTED: retirada por moderación -> no se permite re-participar.
  return { modo: "bloqueada", motivo: estado };
}

/**
 * Completa el SWAP de un reemplazo cuyo Video nuevo YA está PUBLISHED. IDEMPOTENTE y seguro: sólo actúa
 * si el Video existe, está PUBLISHED y aún tiene `reemplazaSubmissionId`. En una transacción: repunta la
 * Submission objetivo al Video nuevo (status PUBLISHED), limpia el puntero, y marca el Video VIEJO
 * REMOVED + encola `BUNNY_DELETE_VIDEO` (destruir el reemplazado es correcto: lo pide el propio dueño).
 * Lo llaman el endpoint del cliente (rápido) y el worker (red de seguridad). Devuelve si hizo el swap.
 */
export async function completarReemplazo(
  db: PrismaClient,
  nuevoVideoId: string,
): Promise<{ hecho: boolean }> {
  return db.$transaction(async (tx) => {
    const nuevo = await tx.video.findUnique({
      where: { id: nuevoVideoId },
      select: { id: true, status: true, reemplazaSubmissionId: true },
    });
    if (!nuevo || nuevo.status !== "PUBLISHED" || !nuevo.reemplazaSubmissionId) {
      return { hecho: false };
    }

    const sub = await tx.submission.findUnique({
      where: { id: nuevo.reemplazaSubmissionId },
      select: { id: true, videoId: true },
    });
    if (!sub) {
      // La Submission objetivo desapareció: limpia el puntero para no reintentar en bucle.
      await tx.video.update({ where: { id: nuevo.id }, data: { reemplazaSubmissionId: null } });
      return { hecho: false };
    }

    const viejoVideoId = sub.videoId;
    // Idempotencia: si ya está repuntada a este Video, sólo limpia el puntero.
    if (viejoVideoId === nuevo.id) {
      await tx.video.update({ where: { id: nuevo.id }, data: { reemplazaSubmissionId: null } });
      return { hecho: true };
    }

    // Repunta la Submission al Video nuevo (PUBLISHED) y limpia el puntero del reemplazo.
    await tx.submission.update({
      where: { id: sub.id },
      data: { videoId: nuevo.id, status: "PUBLISHED" },
    });
    await tx.video.update({ where: { id: nuevo.id }, data: { reemplazaSubmissionId: null } });

    // RESET DE VOTOS, en ESTA MISMA transacción. Los votos son del VÍDEO que la comunidad vio, no de
    // la participación como etiqueta: si cambias el vídeo, empiezas de cero. Heredarlos permitiría
    // acumular votos con un vídeo y luego cambiarlo por otro. Va dentro de la transacción del swap a
    // propósito: fuera, un fallo entre medias dejaría el vídeo nuevo con los votos del viejo.
    const { resetearVotosDeParticipacion } = await import("./votes");
    await resetearVotosDeParticipacion(tx, sub.id);

    // Marca el Video VIEJO REMOVED (si no lo estaba) y encola su borrado en Bunny (idempotente por key).
    const viejo = await tx.video.findUnique({
      where: { id: viejoVideoId },
      select: { status: true, bunnyVideoId: true },
    });
    if (viejo && viejo.status !== "REMOVED") {
      await tx.video.update({ where: { id: viejoVideoId }, data: { status: "REMOVED" } });
      await tx.job.create({
        data: {
          type: "BUNNY_DELETE_VIDEO",
          payload: { bunnyVideoId: viejo.bunnyVideoId },
          runAt: new Date(),
          idempotencyKey: `bunny:delete:${viejo.bunnyVideoId}`,
        },
      });
    }

    return { hecho: true };
  });
}

/**
 * RETIRAR una participación (moderación reactiva del ADMIN, Fase 2 · 2e). Marca la Submission Y su Video
 * como REMOVED -> desaparece del reto, del feed y del perfil (todos filtran REMOVED). Diferencia CLAVE
 * con el borrado del dueño: NO encola `BUNNY_DELETE_VIDEO`. El objeto en Bunny se CONSERVA (evidencia /
 * preservación de contenido): el barrido de huérfanos ya conserva los REMOVED. Retirar = OCULTAR, no
 * destruir. IDEMPOTENTE (guardas `status != REMOVED`). Devuelve si existía la participación.
 */
export async function retirarParticipacion(
  db: PrismaClient,
  submissionId: string,
): Promise<{ retirada: boolean }> {
  return db.$transaction(async (tx) => {
    const sub = await tx.submission.findUnique({
      where: { id: submissionId },
      select: { videoId: true },
    });
    if (!sub) return { retirada: false };
    await tx.submission.updateMany({
      where: { id: submissionId, status: { not: "REMOVED" } },
      data: { status: "REMOVED" },
    });
    // El Video tambien REMOVED (quita del feed/perfil). NO se encola borrado en Bunny: se preserva.
    await tx.video.updateMany({
      where: { id: sub.videoId, status: { not: "REMOVED" } },
      data: { status: "REMOVED" },
    });
    return { retirada: true };
  });
}

/**
 * Se llama JUSTO tras publicar un Video (confirmación del worker). Si el Video es un REEMPLAZO
 * (`reemplazaSubmissionId` seteado) -> completa el swap (red de seguridad ante un cliente que se fue).
 * Si es una PRIMERA participación (tiene Submission propia en PENDING) -> publica esa Submission
 * (Video PUBLISHED + Submission PUBLISHED = visible). Un Video libre no hace nada. Idempotente.
 */
export async function publicarParticipacionSiProcede(
  db: PrismaClient,
  videoId: string,
): Promise<void> {
  const v = await db.video.findUnique({
    where: { id: videoId },
    select: { reemplazaSubmissionId: true },
  });
  if (v?.reemplazaSubmissionId) {
    await completarReemplazo(db, videoId);
    return;
  }
  // Primera participación: publica su Submission si sigue PENDING (no pisa una REMOVED por moderación).
  await db.submission.updateMany({
    where: { videoId, status: "PENDING" },
    data: { status: "PUBLISHED" },
  });
}
