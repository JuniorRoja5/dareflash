/**
 * CONFIRMACION de subida (sondeo por el worker, pull). Lee los `Video` en PENDING, pregunta a Bunny
 * el estado de cada uno por su GUID (Get Video; SIN enumerar la biblioteca — eso es reconciliacion)
 * y decide la transicion. Forward-only e idempotente: SOLO promueve desde PENDING; jamas pisa una
 * decision de moderacion (PUBLISHED/REMOVED/REJECTED) ni re-toca un FAILED.
 *
 * Mapeo de estados de Bunny (0-8). Con Premium Encoding APAGADO (nuestra config), un video va
 * 0->1->2->3->4 y NUNCA llega a 7/8 (JIT). Por eso 7/8 = inesperado (senal de cambio de config), no
 * se publican adivinando.
 */
import type { PrismaClient } from "@/generated/prisma/client";
import type { VideoFailureReason } from "@/config/constants";
import { avisoVideoFallido, avisoVideoListo } from "@/lib/notificaciones";
import { sanearError } from "@/server/observability/sanitize-error";

import type { ClienteBunny, ConfigBunny } from "./bunny";
import { emitirAviso } from "./notificaciones";

export type Transicion =
  | { destino: "PUBLISHED"; durationSec: number }
  | { destino: "FAILED"; failureReason: VideoFailureReason }
  | { destino: "PENDING"; espera: "procesando" | "inesperado" };

/**
 * Decision PURA a partir del estado de Bunny y la duracion. `maxSeg` = tope (VIDEO_MAX_DURATION_SEC).
 *  - 4 (Finished): UNICO listo. length <= maxSeg -> PUBLISHED; si excede -> FAILED (TOO_LONG).
 *  - 5/6 (Error/UploadFailed) -> FAILED (TRANSCODE_ERROR).
 *  - 0-3 (procesando) -> PENDING (se reintenta).
 *  - cualquier otro (7/8/...) -> PENDING "inesperado" (JIT/Premium-off no deberia ocurrir). NO se
 *    publica adivinando el orden.
 */
export function decidirTransicion(status: number, length: number, maxSeg: number): Transicion {
  if (status === 4) {
    return length <= maxSeg
      ? { destino: "PUBLISHED", durationSec: length }
      : { destino: "FAILED", failureReason: "TOO_LONG" };
  }
  if (status === 5 || status === 6) return { destino: "FAILED", failureReason: "TRANSCODE_ERROR" };
  if (status >= 0 && status <= 3) return { destino: "PENDING", espera: "procesando" };
  return { destino: "PENDING", espera: "inesperado" };
}

/**
 * Aplica la transicion a UNA fila con el GUARD forward-only: `where { id, status: PENDING }`. Un
 * video que ya no esta en PENDING -> no-op (count 0). Aqui vive el invariante critico.
 *
 * Es el UNICO sitio donde un video sale de PENDING, y lo llaman DOS barridos: el sondeo de
 * confirmacion y la reconciliacion de subidas abandonadas (que rescata a PUBLISHED las que si
 * terminaron, y cierra en FAILED las que no). Por eso lo que depende de que un video se publique o
 * falle cuelga de aqui, y no de uno de los dos barridos:
 *
 *  - el AVISO al dueño (VIDEO_LISTO / VIDEO_FALLIDO), en la MISMA transaccion que la transicion: o
 *    se escriben los dos o ninguno. Fuera de ella, un proceso que muriera entre medias dejaria el
 *    aviso perdido PARA SIEMPRE, porque el guard forward-only impide que la transicion vuelva a
 *    ocurrir. "NUNCA LOS DOS" es estructural: el aviso solo sale cuando esta transicion GANA el paso
 *    desde PENDING, y un video solo sale de PENDING una vez;
 *  - el HITO de videos publicados, DESPUES de la transaccion (sus puntos abren la suya y Prisma no
 *    anida). Antes vivia solo en el sondeo, y un video rescatado no sumaba su hito hasta la siguiente
 *    publicacion del usuario.
 */
export async function aplicarTransicion(
  db: PrismaClient,
  videoId: string,
  t: Transicion,
  /**
   * Nombre del fichero de miniatura que Bunny acaba de reportar. Se guarda EN LA MISMA escritura que
   * la publicacion: el dueno pudo fijar una miniatura personalizada durante la subida, y este es el
   * primer momento en que Bunny nos dice como la llamo. Sin esto, el poster pediria el frame
   * automatico. `undefined`/`null` no toca la columna (no se pisa un nombre bueno con un vacio).
   */
  thumbnailFileName?: string | null,
): Promise<number> {
  if (t.destino === "PENDING") return 0;
  const miniatura = thumbnailFileName ? { thumbnailFileName } : {};
  const data =
    t.destino === "PUBLISHED"
      ? { status: "PUBLISHED" as const, durationSec: t.durationSec, ...miniatura }
      : { status: "FAILED" as const, failureReason: t.failureReason };

  const hecho = await db.$transaction(async (tx) => {
    const r = await tx.video.updateMany({ where: { id: videoId, status: "PENDING" }, data });
    if (r.count === 0) return { count: 0, userId: null };
    const v = await tx.video.findUnique({ where: { id: videoId }, select: { userId: true } });
    if (v) {
      await emitirAviso(
        tx,
        v.userId,
        t.destino === "PUBLISHED"
          ? avisoVideoListo(videoId)
          : avisoVideoFallido(videoId, t.failureReason),
      );
    }
    return { count: r.count, userId: v?.userId ?? null };
  });

  // HITO: solo tras una publicacion que ocurrio DE VERDAD en esta llamada (count > 0), no una que ya
  // estaba hecha. Sus puntos nunca tumban la transicion, que es lo que de verdad importa: un fallo se
  // anota y la siguiente publicacion del usuario otorga todos los hitos que falten.
  if (hecho.count > 0 && t.destino === "PUBLISHED" && hecho.userId) {
    try {
      const { otorgarHitosDeVideos } = await import("./hito-videos");
      await otorgarHitosDeVideos(db, hecho.userId);
    } catch (e) {
      console.error(`[transicion] hito de vídeos de ${hecho.userId}: ${sanearError(e)}`);
    }
  }
  return hecho.count;
}

export interface OpcionesConfirm {
  now?: Date;
  maxEdadMs: number;
  lote: number;
  maxSeg: number;
  log?: (m: string) => void;
}

export interface ResultadoConfirm {
  revisados: number;
  publicados: number;
  fallidos: number;
  pendientes: number;
}

/**
 * Un barrido: revisa hasta `lote` Video en PENDING con `createdAt >= now - maxEdadMs` (los mas
 * viejos los hereda la reconciliacion), pregunta a Bunny por cada GUID y aplica la transicion. Un
 * fallo de red en `getVideo` deja el video en PENDING (no lo penaliza). No lanza por video: cada uno
 * es independiente.
 */
export async function confirmarVideosPendientes(
  db: PrismaClient,
  cliente: ClienteBunny,
  config: ConfigBunny,
  opts: OpcionesConfirm,
): Promise<ResultadoConfirm> {
  const now = opts.now ?? new Date();
  const desde = new Date(now.getTime() - opts.maxEdadMs);
  const videos = await db.video.findMany({
    where: { status: "PENDING", createdAt: { gte: desde } },
    select: { id: true, bunnyVideoId: true },
    take: opts.lote,
  });

  let publicados = 0;
  let fallidos = 0;
  let pendientes = 0;

  for (const v of videos) {
    let info: { status: number; length: number; thumbnailFileName: string | null };
    try {
      info = await cliente.getVideo({
        libraryId: config.libraryId,
        apiKey: config.apiKey,
        videoId: v.bunnyVideoId,
      });
    } catch (e) {
      opts.log?.(
        `[confirm] getVideo fallo (${v.bunnyVideoId}): ${sanearError(e)}; se deja PENDING`,
      );
      pendientes += 1;
      continue;
    }

    const t = decidirTransicion(info.status, info.length, opts.maxSeg);
    if (t.destino === "PENDING") {
      if (t.espera === "inesperado") {
        opts.log?.(
          `[confirm] ESTADO INESPERADO ${info.status} (${v.bunnyVideoId}): JIT/Premium-off no ` +
            `deberia ocurrir; revisar config/mapeo.`,
        );
      }
      pendientes += 1;
      continue;
    }

    // El aviso al dueño y el hito de vídeos van DENTRO de `aplicarTransicion` (ver su comentario):
    // así salen también cuando es la reconciliación la que publica, no solo este sondeo.
    const count = await aplicarTransicion(db, v.id, t, info.thumbnailFileName);
    if (count > 0) {
      if (t.destino === "PUBLISHED") {
        publicados += 1;
        // Recién publicado: publica su participación (primera) o completa el reemplazo (red de
        // seguridad si el cliente se fue). Independiente por vídeo: un fallo aquí no corta el barrido.
        try {
          const { publicarParticipacionSiProcede } = await import("./participacion");
          await publicarParticipacionSiProcede(db, v.id);
        } catch (e) {
          opts.log?.(`[confirm] participación de ${v.id} no pudo publicarse: ${sanearError(e)}`);
        }
      } else fallidos += 1;
    }
  }

  return { revisados: videos.length, publicados, fallidos, pendientes };
}

/** Cadencia ADAPTATIVA: si el barrido vio videos en PENDING, frecuente; si no, en reposo. */
export function cadenciaConfirmMs(
  huboPendientes: boolean,
  activoMs: number,
  reposoMs: number,
): number {
  return huboPendientes ? activoMs : reposoMs;
}
