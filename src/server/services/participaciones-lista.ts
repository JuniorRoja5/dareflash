/**
 * PARTICIPACIONES visibles de un reto (Fase 2 · 2d), para el detalle. REGLA DEL MÁS RESTRICTIVO: una
 * participación se ve SOLO si `Submission.status = PUBLISHED` Y `Video.status = PUBLISHED` (si cualquiera
 * de los dos no lo está, no se muestra). Orden por `voteCount` desc y, a igualdad, más nuevas primero
 * (índice [challengeId, voteCount]). Devuelve lo justo para pintar la rejilla y reproducir (el poster lo
 * firma el borde con `bunnyVideoId`; el player usa el `videoId` de BD, que reexige PUBLISHED en servidor).
 */
import "server-only";

import type { Db } from "@/server/db/types";

export interface ParticipacionVista {
  submissionId: string;
  videoId: string;
  bunnyVideoId: string;
  title: string | null;
  votos: number;
  username: string;
  displayName: string | null;
}

/** Estado de MI participación en el reto (para el dueño): visible / procesando / fallida / retirada. */
export type EstadoMiParticipacion = "publicada" | "procesando" | "fallida" | "retirada";

export interface MiParticipacion {
  submissionId: string;
  videoId: string;
  estado: EstadoMiParticipacion;
}

const LIMITE_DEFECTO = 60;

/** Lista las participaciones VISIBLES (Submission PUBLISHED + Video PUBLISHED), más votadas primero. */
export async function listarParticipacionesVisibles(
  db: Db,
  challengeId: string,
  limite = LIMITE_DEFECTO,
): Promise<ParticipacionVista[]> {
  const filas = await db.submission.findMany({
    where: { challengeId, status: "PUBLISHED", video: { status: "PUBLISHED" } },
    orderBy: [{ voteCount: "desc" }, { createdAt: "desc" }],
    take: limite,
    select: {
      id: true,
      voteCount: true,
      video: { select: { id: true, bunnyVideoId: true, title: true } },
      user: { select: { username: true, displayName: true } },
    },
  });
  return filas.map((f) => ({
    submissionId: f.id,
    videoId: f.video.id,
    bunnyVideoId: f.video.bunnyVideoId,
    title: f.video.title,
    votos: f.voteCount,
    username: f.user.username,
    displayName: f.user.displayName,
  }));
}

/**
 * MI participación en el reto (la del usuario de la sesión), en CUALQUIER estado, para mostrarle su
 * propio progreso (Procesando/No se pudo procesar) y el botón Reemplazar cuando está publicada. `null`
 * si no participa. El estado se deriva del Video de la Submission (el más restrictivo ya se aplicó al
 * repuntar; aquí basta el estado del vídeo actual de la participación).
 */
export async function miParticipacion(
  db: Db,
  challengeId: string,
  userId: string,
): Promise<MiParticipacion | null> {
  const sub = await db.submission.findUnique({
    where: { challengeId_userId: { challengeId, userId } },
    select: { id: true, video: { select: { id: true, status: true } } },
  });
  if (!sub) return null;
  const estado: EstadoMiParticipacion =
    sub.video.status === "PUBLISHED"
      ? "publicada"
      : sub.video.status === "PENDING"
        ? "procesando"
        : sub.video.status === "FAILED"
          ? "fallida"
          : "retirada"; // REMOVED / REJECTED
  return { submissionId: sub.id, videoId: sub.video.id, estado };
}
