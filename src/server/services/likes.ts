/**
 * ME GUSTA de un vídeo: ponerlo y quitarlo.
 *
 * ┌─ EL CONTADOR SE TOCA CON LA FILA DEL VÍDEO BLOQUEADA ──────────────────────────────────────────┐
 * │ `Video.likeCount` es un cache de las filas `Like`, igual que `commentCount` y que              │
 * │ `Submission.voteCount`. Se mueve con `increment`/`decrement` en la MISMA transacción que la    │
 * │ fila, y SIEMPRE con un `SELECT … FOR UPDATE` sobre el vídeo ANTES. Sin ese cerrojo MariaDB     │
 * │ responde 1020 ("Record has changed since last read") y dos likes a la vez pierden uno — está   │
 * │ medido en el patrón del voto, no es una precaución teórica.                                    │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * NADIE SE DA LIKE A SÍ MISMO, por lo mismo que nadie se denuncia ni se invita: además de que no
 * significa nada, es la forma barata de fabricarse el hito de los 50.
 *
 * EL HITO SE OTORGA FUERA DE LA TRANSACCIÓN, y eso es una regla del repositorio, no una
 * preferencia: `applyPoints` abre su propia transacción (Prisma no las anida) y toma el
 * `FOR UPDATE` de la fila del `User`. Llamarlo con el vídeo ya bloqueado anidaría cerrojos en un
 * orden que ningún otro camino usa — que es exactamente cómo se fabrica un deadlock. Se hace como
 * en `hito-videos`: transacción cerrada, y luego el premio con su clave.
 */
import "server-only";

import { LIKES_PARA_HITO, POINTS, RAZON_HITO_LIKES } from "@/config/constants";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type { Db } from "@/server/db/types";
import { sanearError } from "@/server/observability/sanitize-error";

import { applyPoints, LEDGER_TX_OPTIONS } from "./ledger";
import { VIDEO_VISIBLE } from "./video-visible";

export type ResultadoLike =
  | { estado: "puesto"; likes: number }
  | { estado: "quitado"; likes: number }
  /** Ya estaba así. No es un error: el doble clic y el reintento acaban aquí. */
  | { estado: "sin_cambios"; likes: number }
  | { estado: "rechazado"; motivo: "NO_DISPONIBLE" | "PROPIO" };

/** PRIMERO bloquear la fila del vídeo (su contador), luego leer. Igual que en comentarios. */
async function bloquearVideo(tx: Db, videoId: string): Promise<void> {
  await tx.$executeRaw(
    Prisma.sql`SELECT \`id\` FROM \`Video\` WHERE \`id\` = ${videoId} FOR UPDATE`,
  );
}

/**
 * ¿Se puede querer este vídeo, y de quién es? `null` si no existe o ya no se ve.
 *
 * Misma regla de visibilidad que el feed (`VIDEO_VISIBLE`), así que un vídeo retirado o escondido
 * por denuncias no se puede votar con el corazón — ni se puede usar para averiguar que existe.
 */
async function videoQuerible(db: Db, videoId: string): Promise<{ duenoId: string } | null> {
  const v = await db.video.findFirst({
    where: { id: videoId, ...VIDEO_VISIBLE },
    select: { userId: true },
  });
  return v ? { duenoId: v.userId } : null;
}

/** Clave del hito de likes. UNA por vídeo y para siempre: el hito es un logro, no un saldo. */
export function claveHitoLikes(videoId: string): string {
  return `likes:${videoId}`;
}

/**
 * Otorga el hito de los 50 al DUEÑO del vídeo, si toca. Se llama con la transacción ya cerrada.
 *
 * ES FUNCIÓN DEL ESTADO, no del evento: cuenta las filas `Like` que hay AHORA y compara con el
 * umbral. Por eso da igual cuántas veces se llame ni desde dónde — y por eso una ejecución perdida
 * se repara sola con el siguiente like, en vez de dejar un hito sin cobrar para siempre.
 *
 * MONÓTONO: una vez cobrado no se desotorga. Si el vídeo baja de 50 y vuelve a subir, la clave ya
 * está usada y es un no-op. Un hito es un logro alcanzado, no un saldo de likes vivos — la misma
 * asimetría deliberada que en `hito-videos`.
 *
 * NO PUEDE TUMBAR EL LIKE: si falla, se anota y se sigue. El like ya está puesto, que es lo que
 * pidió la persona; los puntos se reintentan solos.
 */
export async function otorgarHitoLikes(db: PrismaClient, videoId: string): Promise<boolean> {
  try {
    const likes = await db.like.count({ where: { videoId } });
    if (likes < LIKES_PARA_HITO) return false;

    const video = await db.video.findUnique({ where: { id: videoId }, select: { userId: true } });
    if (!video) return false;

    const r = await applyPoints(db, {
      userId: video.userId,
      delta: POINTS.VIDEO_50_LIKES,
      reason: RAZON_HITO_LIKES,
      refType: "VIDEO",
      refId: videoId,
      idempotencyKey: claveHitoLikes(videoId),
    });
    return r.applied;
  } catch (e) {
    console.error(`[likes] hito de ${videoId}: ${sanearError(e)}`);
    return false;
  }
}

/** Pone el like. Repetirlo no suma dos veces: lo impide el UNIQUE, no un `if`. */
export async function darLike(
  db: PrismaClient,
  entrada: { userId: string; videoId: string },
): Promise<ResultadoLike> {
  const video = await videoQuerible(db, entrada.videoId);
  if (!video) return { estado: "rechazado", motivo: "NO_DISPONIBLE" };
  if (video.duenoId === entrada.userId) return { estado: "rechazado", motivo: "PROPIO" };

  const r = await db.$transaction(async (tx) => {
    await bloquearVideo(tx, entrada.videoId);
    // `createMany` + `skipDuplicates` en vez de `create` + catch: un choque de UNIQUE dentro de una
    // transacción interactiva la aborta entera, y aquí el choque es el caso NORMAL (doble clic).
    const creado = await tx.like.createMany({
      data: [{ userId: entrada.userId, videoId: entrada.videoId }],
      skipDuplicates: true,
    });
    if (creado.count === 0) {
      const v = await tx.video.findUniqueOrThrow({
        where: { id: entrada.videoId },
        select: { likeCount: true },
      });
      return { estado: "sin_cambios" as const, likes: v.likeCount };
    }
    const v = await tx.video.update({
      where: { id: entrada.videoId },
      data: { likeCount: { increment: 1 } },
      select: { likeCount: true },
    });
    return { estado: "puesto" as const, likes: v.likeCount };
  }, LEDGER_TX_OPTIONS);

  // FUERA de la transacción (ver la cabecera). Solo cuando este like fue nuevo: si no cambió nada,
  // tampoco puede haber cruzado el umbral.
  if (r.estado === "puesto") {
    if (r.likes >= LIKES_PARA_HITO) await otorgarHitoLikes(db, entrada.videoId);
    // La racha, por la misma razón y en el mismo sitio: escribe en `User`, así que no puede ir
    // dentro de la transacción que bloquea el vídeo.
    const { marcarDiaActivo } = await import("./racha");
    await marcarDiaActivo(db, entrada.userId);
  }
  return r;
}

/** Quita el like. Quitar uno que no estaba no descuenta nada. */
export async function quitarLike(
  db: PrismaClient,
  entrada: { userId: string; videoId: string },
): Promise<ResultadoLike> {
  // NO se exige que el vídeo siga siendo visible: si se escondió mientras tanto, quien le dio like
  // tiene que poder retirarlo igual. Exigir visibilidad aquí dejaría likes atrapados.
  const existe = await db.video.findUnique({
    where: { id: entrada.videoId },
    select: { id: true },
  });
  if (!existe) return { estado: "rechazado", motivo: "NO_DISPONIBLE" };

  return db.$transaction(async (tx) => {
    await bloquearVideo(tx, entrada.videoId);
    const borrados = await tx.like.deleteMany({
      where: { userId: entrada.userId, videoId: entrada.videoId },
    });
    if (borrados.count === 0) {
      const v = await tx.video.findUniqueOrThrow({
        where: { id: entrada.videoId },
        select: { likeCount: true },
      });
      return { estado: "sin_cambios", likes: v.likeCount };
    }
    const v = await tx.video.update({
      where: { id: entrada.videoId },
      data: { likeCount: { decrement: 1 } },
      select: { likeCount: true },
    });
    return { estado: "quitado", likes: v.likeCount };
  }, LEDGER_TX_OPTIONS);
}

/**
 * De estos vídeos, ¿a cuáles les he dado like? UNA consulta para toda la página, nunca una por
 * vídeo. Sin sesión devuelve vacío sin tocar la base: el feed es público y un invitado no tiene
 * likes que resolver.
 */
export async function misLikes(
  db: Db,
  userId: string | null | undefined,
  videoIds: string[],
): Promise<Set<string>> {
  if (!userId || videoIds.length === 0) return new Set();
  const filas = await db.like.findMany({
    where: { userId, videoId: { in: videoIds } },
    select: { videoId: true },
  });
  return new Set(filas.map((f) => f.videoId));
}
