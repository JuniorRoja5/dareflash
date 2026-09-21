/**
 * LAS DOS DECISIONES DE MODERACIÓN (Fase 5, pieza 2): RETIRAR o DESCARTAR.
 *
 * Es el PUNTO ÚNICO de la retirada por moderación, y despacha por tipo SIN duplicar nada:
 *
 *  - VÍDEO CON PARTICIPACIÓN: reutiliza `retirarParticipacionEnTx`, que ya existía. Arrastra la
 *    Submission a REMOVED con `retiradaMotivo = "MODERACION"`, que es la FUENTE ÚNICA de la que
 *    depende la re-participación: dejar la Submission viva con el vídeo retirado rompería esa regla
 *    y el usuario podría volver a participar como si nada.
 *  - VÍDEO SUELTO (sin participación): se marca REMOVED a secas. En ninguno de los dos casos se
 *    encola `BUNNY_DELETE_VIDEO`: retirar es OCULTAR, no destruir — el objeto se conserva como
 *    evidencia, igual que en la retirada de una participación.
 *  - COMENTARIO: el mismo núcleo que usa el autor al borrar el suyo (`retirarComentarioEnTx`), con
 *    dos diferencias: el motivo es MODERACION y el `userId` NO va en el WHERE, porque el moderador
 *    retira lo que no es suyo. El contador del vídeo baja en la misma transacción.
 *
 * Y LAS DENUNCIAS SE CIERRAN CON EL MISMO ACTO: los `Report` OPEN del objeto pasan a RESOLVED dentro
 * de la MISMA transacción que la retirada. Separarlo dejaría contenido retirado con denuncias abiertas
 * —volvería a la cola— o denuncias cerradas sobre contenido que sigue a la vista.
 *
 * DESCARTAR no toca el contenido: marca sus denuncias abiertas como DISMISSED. La fila se queda (es el
 * registro de que alguien avisó y de que se revisó), así que ese denunciante ya no vuelve a contar: el
 * objeto solo re-sube a la cola si lo denuncia alguien NUEVO.
 *
 * Las dos son IDEMPOTENTES: repetirlas no vuelve a cambiar nada ni cuenta dos veces.
 */
import "server-only";

import type { ReportTargetDenunciable } from "@/config/constants";
import type { PrismaClient } from "@/generated/prisma/client";
import type { Db } from "@/server/db/types";

import { retirarComentarioEnTx } from "./comentarios";
import { retirarParticipacionEnTx } from "./participacion";

export type ResultadoModeracion =
  /** Algo cambió: el contenido, las denuncias, o las dos cosas. */
  | { estado: "hecho"; denunciasCerradas: number }
  /** Ya estaba así: ni contenido ni denuncias que tocar. */
  | { estado: "sin_cambios" }
  | { estado: "rechazado"; motivo: "NO_ENCONTRADO" };

/** Cierra las denuncias ABIERTAS de un objeto. Devuelve cuántas. */
async function cerrarDenuncias(
  tx: Db,
  objeto: { targetType: ReportTargetDenunciable; targetId: string },
  estado: "RESOLVED" | "DISMISSED",
): Promise<number> {
  const r = await tx.report.updateMany({
    // Solo las ABIERTAS y solo las de ESTE objeto: lo ya decidido no se vuelve a tocar, y lo de otros
    // objetos no se arrastra por error.
    where: { targetType: objeto.targetType, targetId: objeto.targetId, status: "OPEN" },
    data: { status: estado },
  });
  return r.count;
}

/**
 * RETIRAR lo denunciado. Oculta el contenido y cierra sus denuncias, todo junto.
 */
export async function retirarPorModeracion(
  db: PrismaClient,
  objeto: { targetType: ReportTargetDenunciable; targetId: string },
): Promise<ResultadoModeracion> {
  if (objeto.targetType === "VIDEO") {
    const video = await db.video.findUnique({
      where: { id: objeto.targetId },
      select: { id: true, status: true, submission: { select: { id: true } } },
    });
    if (!video) return { estado: "rechazado", motivo: "NO_ENCONTRADO" };

    return db.$transaction(async (tx) => {
      let cambiado = false;
      if (video.submission) {
        // Con participación: la vía que ya existía, que arrastra la Submission y su motivo.
        const { retirada } = await retirarParticipacionEnTx(tx, video.submission.id);
        cambiado = retirada && video.status !== "REMOVED";
      } else {
        // Suelto: se oculta el vídeo y nada más. El objeto en Bunny se conserva.
        const r = await tx.video.updateMany({
          where: { id: objeto.targetId, status: { not: "REMOVED" } },
          data: { status: "REMOVED" },
        });
        cambiado = r.count > 0;
      }
      const denunciasCerradas = await cerrarDenuncias(tx, objeto, "RESOLVED");
      return cambiado || denunciasCerradas > 0
        ? { estado: "hecho", denunciasCerradas }
        : { estado: "sin_cambios" };
    });
  }

  const comentario = await db.comment.findUnique({
    where: { id: objeto.targetId },
    select: { videoId: true },
  });
  if (!comentario) return { estado: "rechazado", motivo: "NO_ENCONTRADO" };

  return db.$transaction(async (tx) => {
    const r = await retirarComentarioEnTx(tx, {
      commentId: objeto.targetId,
      videoId: comentario.videoId,
      motivo: "MODERACION",
    });
    const denunciasCerradas = await cerrarDenuncias(tx, objeto, "RESOLVED");
    const cambiado = r?.estado === "retirado";
    return cambiado || denunciasCerradas > 0
      ? { estado: "hecho", denunciasCerradas }
      : { estado: "sin_cambios" };
  });
}

/**
 * DESCARTAR las denuncias: el contenido se queda como está y sus avisos pasan a DISMISSED.
 */
export async function descartarDenuncias(
  db: PrismaClient,
  objeto: { targetType: ReportTargetDenunciable; targetId: string },
): Promise<ResultadoModeracion> {
  const denunciasCerradas = await db.$transaction(async (tx) =>
    cerrarDenuncias(tx, objeto, "DISMISSED"),
  );
  return denunciasCerradas > 0 ? { estado: "hecho", denunciasCerradas } : { estado: "sin_cambios" };
}
