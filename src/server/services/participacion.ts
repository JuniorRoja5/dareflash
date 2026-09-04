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
 *  - ninguna                        -> PRIMERA: crea Video(PENDING) + Submission(PENDING).
 *  - retirada por MODERACIÓN        -> BLOQUEADA: un admin la retiró; no se re-participa.
 *  - retirada por el DUEÑO          -> hueco liberable: borra la Submission vieja y crea fresca.
 *  - existe, Video FAILED           -> hueco INVÁLIDO: igual que arriba (la subida nunca se procesó).
 *  - existe, Video PUBLISHED/PENDING -> REEMPLAZO: crea SÓLO el Video con `reemplazaSubmissionId` = esa
 *    Submission (sin 2ª Submission; respeta el unique). El swap se completa cuando el Video esté PUBLISHED.
 *
 * ┌─ EL BLOQUEO SE DECIDE POR `retiradaMotivo`, NUNCA POR EL ESTADO DEL VÍDEO ──────────────────────┐
 * │ Antes se miraba `video.status === "REMOVED"`, y a REMOVED se llega por DOS caminos con            │
 * │ consecuencias opuestas: lo retiró un admin (debe bloquear) o el propio dueño borró su vídeo (no   │
 * │ debe). Como el status no los distingue, borrar TU vídeo te vetaba del reto para siempre, con un   │
 * │ mensaje que además mentía. Bloqueó una verificación en producción.                                │
 * │ Ahora la única fuente es `retiradaMotivo`: o hay un motivo explícito, o no está retirada.         │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export async function iniciarParticipacion(
  tx: Db,
  entrada: { challengeId: string; userId: string; bunnyGuid: string; title: string | null },
): Promise<ResultadoIniciar> {
  const { challengeId, userId, bunnyGuid, title } = entrada;

  const existente = await tx.submission.findUnique({
    where: { challengeId_userId: { challengeId, userId } },
    select: { id: true, retiradaMotivo: true, video: { select: { status: true } } },
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

  // MODERACIÓN: lo único que bloquea. Se comprueba PRIMERO y con el campo explícito.
  if (existente.retiradaMotivo === "MODERACION") return { modo: "bloqueada", motivo: "MODERACION" };

  const estado = existente.video.status;

  // Hueco LIBERABLE: o el dueño borró su vídeo, o la subida anterior nunca llegó a procesarse
  // (FAILED). En los dos casos no queda nada que reemplazar: se libera el `unique` borrando la
  // Submission vieja y se empieza de cero. (El Video queda; su objeto en Bunny lo barre la limpieza.)
  if (existente.retiradaMotivo === "DUENO" || estado === "FAILED") {
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

  // REJECTED (y cualquier estado futuro que no sea publicable): se trata como retirada de moderación.
  return { modo: "bloqueada", motivo: estado };
}

/**
 * ¿PUEDE este usuario participar en este reto? Consulta de SOLO LECTURA, sin efectos.
 *
 * Existe para poder rechazar ANTES de crear el objeto en Bunny. El orden era el inverso —se creaba el
 * objeto y luego se comprobaba la regla—, así que CADA petición rechazada dejaba un huérfano en Bunny
 * que el usuario veía como una subida colgada en "uploading".
 *
 * NO sustituye a la comprobación de `iniciarParticipacion`: esta es una guarda barata y de fuera de la
 * transacción, y entre las dos puede cambiar el estado. La decisión con autoridad sigue siendo la de
 * dentro de la transacción; esta solo evita el objeto huérfano en el caso normal.
 */
export async function puedeParticipar(
  db: Db,
  entrada: { challengeId: string; userId: string },
): Promise<{ puede: boolean }> {
  const existente = await db.submission.findUnique({
    where: { challengeId_userId: entrada },
    select: { retiradaMotivo: true, video: { select: { status: true } } },
  });
  if (!existente) return { puede: true };
  if (existente.retiradaMotivo === "MODERACION") return { puede: false };
  if (existente.retiradaMotivo === "DUENO") return { puede: true };
  return { puede: existente.video.status !== "REJECTED" };
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
    // El MOTIVO se graba junto al estado: es lo que hace que el bloqueo posterior sea cierto y no una
    // deducción. Sin esto, esta retirada sería indistinguible de que el dueño borrara su vídeo.
    await tx.submission.updateMany({
      where: { id: submissionId, status: { not: "REMOVED" } },
      data: { status: "REMOVED", retiradaMotivo: "MODERACION", retiradaEn: new Date() },
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
 * LEVANTAR el bloqueo de moderación de una participación (ADMIN). Es el INVERSO de
 * `retirarParticipacion`, y hasta ahora no existía: una retirada no tenía vuelta atrás, así que un
 * error de moderación —o un caso que se revisa y se acepta— vetaba al usuario de ese reto para
 * siempre, sin más arreglo que tocar la base de datos a mano.
 *
 * NO republica nada. La participación retirada SIGUE retirada y su vídeo no vuelve al feed: lo único
 * que se levanta es el VETO a volver a participar. Republicar contenido que un moderador retiró es
 * otra decisión, y mucho más delicada; esto solo devuelve al usuario el derecho a intentarlo con un
 * vídeo nuevo.
 *
 * Se hace BORRANDO la Submission retirada, no poniendo su motivo a `null`: mientras exista ocupa el
 * `@@unique([challengeId, userId])` y el usuario no podría crear una nueva. Es la misma vía que ya
 * usa `iniciarParticipacion` para liberar el hueco de una subida fallida.
 *
 * IDEMPOTENTE: desbloquear dos veces no falla. Devuelve si había algo que desbloquear.
 */
export async function desbloquearParticipacion(
  db: PrismaClient,
  submissionId: string,
): Promise<{ desbloqueada: boolean }> {
  return db.$transaction(async (tx) => {
    const sub = await tx.submission.findUnique({
      where: { id: submissionId },
      select: { id: true, retiradaMotivo: true },
    });
    // Solo se levanta un bloqueo de MODERACIÓN. Una participación VIVA no se toca (borrarla sería
    // destruir contenido publicado), y una retirada por el DUEÑO no bloquea nada que levantar.
    if (!sub || sub.retiradaMotivo !== "MODERACION") return { desbloqueada: false };

    // Los votos de una participación retirada no valen para nada, y `Vote` no tiene FK (no hay
    // cascada): se limpian aquí para no dejar filas apuntando a una submission que ya no existe.
    const { resetearVotosDeParticipacion } = await import("./votes");
    await resetearVotosDeParticipacion(tx, sub.id);
    await tx.submission.delete({ where: { id: sub.id } });
    return { desbloqueada: true };
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
