/**
 * RECONCILIACION de subidas ABANDONADAS (pull, NO destructiva). Complementa al confirm: mira las
 * `Video` en PENDING MAS VIEJAS que el umbral de abandono (`createdAt < now - maxEdadMs`). Pasada la
 * caducidad de la credencial TUS, Bunny ya no acepta bytes -> una PENDING tan vieja es DEMOSTRABLEMENTE
 * abandonada; nunca se toca una subida legitima en curso (esas son mas recientes -> territorio del
 * confirm). Resuelve por TRANSICION DE ESTADO, forward-only e idempotente (mismo guard que el confirm);
 * NO borra nada de Bunny (eso es la Parte B).
 *
 * Reutiliza `decidirTransicion`/`aplicarTransicion` del confirm. La diferencia de criterio: aqui, una
 * PENDING que Bunny sigue reportando "procesando" (0-3) o en estado inesperado NO se deja PENDING (como
 * haria el confirm) sino que se marca UPLOAD_INCOMPLETE: la credencial ya caduco, no va a terminar.
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { sanearError } from "@/server/observability/sanitize-error";

import { BunnyNotFoundError, type ClienteBunny, type ConfigBunny } from "./bunny";
import { aplicarTransicion, decidirTransicion, type Transicion } from "./video-confirmacion";

export interface OpcionesReconciliacion {
  now?: Date;
  /** Edad minima para considerar abandonada una PENDING (UMBRAL_ABANDONO_MS). */
  maxEdadMs: number;
  lote: number;
  maxSeg: number;
  log?: (m: string) => void;
}

export interface ResultadoReconciliacion {
  revisados: number;
  /** PENDING vieja que en realidad SI habia terminado en Bunny -> PUBLISHED (rescate). */
  rescatados: number;
  /** FAILED / UPLOAD_INCOMPLETE (credencial caducada sin Finished, u objeto inexistente). */
  incompletos: number;
  /** FAILED / TOO_LONG o TRANSCODE_ERROR (el video existia y fallo por su contenido). */
  fallidos: number;
  /** Error de RED en getVideo -> se deja PENDING para el proximo barrido. */
  pendientes: number;
}

/**
 * Un barrido: revisa hasta `lote` Video en PENDING con `createdAt < now - maxEdadMs`, pregunta a Bunny
 * por cada GUID y aplica la transicion. Independiente por video (no lanza por uno). Un error de RED en
 * `getVideo` deja el video en PENDING; un 404 (objeto inexistente) SI decide (incompleto).
 */
export async function reconciliarVideosAbandonados(
  db: PrismaClient,
  cliente: ClienteBunny,
  config: ConfigBunny,
  opts: OpcionesReconciliacion,
): Promise<ResultadoReconciliacion> {
  const now = opts.now ?? new Date();
  const hasta = new Date(now.getTime() - opts.maxEdadMs);
  const videos = await db.video.findMany({
    where: { status: "PENDING", createdAt: { lt: hasta } }, // MAS VIEJAS que el umbral
    select: { id: true, bunnyVideoId: true },
    take: opts.lote,
  });

  let rescatados = 0;
  let incompletos = 0;
  let fallidos = 0;
  let pendientes = 0;

  for (const v of videos) {
    let t: Transicion;
    // Fuera del `try` a proposito: en la rama del 404 no hay `info`, y aun asi hay que aplicar la
    // transicion. `null` = "no sabemos el nombre" -> `aplicarTransicion` no toca esa columna.
    let miniatura: string | null = null;
    try {
      const info = await cliente.getVideo({
        libraryId: config.libraryId,
        apiKey: config.apiKey,
        videoId: v.bunnyVideoId,
      });
      miniatura = info.thumbnailFileName;
      const base = decidirTransicion(info.status, info.length, opts.maxSeg);
      // Pasado el umbral, "procesando"/"inesperado" ya no van a terminar (credencial caducada).
      t =
        base.destino === "PENDING"
          ? { destino: "FAILED", failureReason: "UPLOAD_INCOMPLETE" }
          : base;
    } catch (e) {
      if (e instanceof BunnyNotFoundError) {
        // El objeto no existe en Bunny (nunca llegaron bytes): incompleta.
        t = { destino: "FAILED", failureReason: "UPLOAD_INCOMPLETE" };
      } else {
        // Error de RED (no 404): NO penalizar; se reintenta el proximo barrido (como el confirm).
        opts.log?.(
          `[reconcile] getVideo fallo (${v.bunnyVideoId}): ${sanearError(e)}; se deja PENDING`,
        );
        pendientes += 1;
        continue;
      }
    }

    const count = await aplicarTransicion(db, v.id, t, miniatura);
    if (count > 0) {
      if (t.destino === "PUBLISHED") rescatados += 1;
      else if (t.failureReason === "UPLOAD_INCOMPLETE") incompletos += 1;
      else fallidos += 1; // TOO_LONG / TRANSCODE_ERROR
    }
  }

  return { revisados: videos.length, rescatados, incompletos, fallidos, pendientes };
}
