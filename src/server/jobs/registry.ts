/**
 * REGISTRO de tipos de job: cada tipo declara su handler y —lo importante— su POLITICA DE
 * REAPER, junto a la definicion del tipo (no como constante global). Razon: distintos tipos
 * necesitan la respuesta contraria ante un worker caido a media ejecucion.
 *
 *  - "FAIL":    a FAILED, NO reencolar. Para efectos externos que NO son idempotentes de
 *               verdad. SEND_EMAIL: sobre SMTP no hay exactly-once; reencolar un envio a
 *               medias = correo DUPLICADO, peor que una perdida recuperable con "reenviar".
 *  - "REQUEUE": devolver a PENDING SIEMPRE. Para trabajos idempotentes de verdad (por
 *               idempotencyKey), donde perder el efecto es inaceptable (ledgers, Fase 7).
 *
 * Los handlers reciben el `payload` del job. Deben LANZAR en caso de fallo (el runner decide
 * reintento con backoff o FAILED). El registro se construye con sus dependencias (el
 * adaptador de correo) para poder inyectar un doble en los tests.
 */
import { z } from "zod";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type { JobModel } from "@/generated/prisma/models";
import type { EmailAdapter, EmailMessage } from "@/server/email/adapter";
import { encolarTramo, repartirAnuncio } from "@/server/services/anuncios";
import type { ClienteBunny, ConfigBunny } from "@/server/services/bunny";

export type PoliticaReaper = "FAIL" | "REQUEUE";

/** Payload del job BUNNY_DELETE_VIDEO: solo el GUID del objeto en Bunny (no dato personal). */
const BunnyDeletePayloadSchema = z.object({ bunnyVideoId: z.string().min(1) });

/** Payload del job FANOUT_ANUNCIO: el anuncio y, en las continuaciones, el cursor del tramo. */
const FanoutPayloadSchema = z.object({
  announcementId: z.string().min(1),
  desde: z.string().min(1).optional(),
});

export interface DefTipoJob {
  /** Ejecuta el trabajo. Lanza en fallo. */
  handler: (job: JobModel) => Promise<void>;
  /** Que hace el reaper si este tipo queda colgado (worker muerto a media ejecucion). */
  reaper: PoliticaReaper;
  /**
   * Tope del backoff entre reintentos para este tipo. SEND_EMAIL lo baja a minutos: un correo
   * de verificacion que llega horas tarde ya no sirve (el usuario se fue). Por defecto 6 h.
   */
  backoffTopeMs?: number;
  /**
   * Resumen NO sensible a conservar en el payload si el job acaba en FAILED, para saber a
   * quien afecto (reenvio manual). NUNCA el enlace/token, solo lo justo para identificar.
   */
  resumenFallo?: (job: JobModel) => Prisma.InputJsonValue | null;
}

export type Registro = Record<string, DefTipoJob>;

export interface DepsRegistro {
  /** La BD, para los jobs que escriben en ella (el reparto de anuncios). */
  db: PrismaClient;
  emailAdapter: EmailAdapter;
  /** Cliente de Bunny + su config (libraryId/apiKey) para el borrado del objeto por la cola. */
  bunny: { cliente: ClienteBunny; config: ConfigBunny };
}

/** Construye el registro de tipos con sus dependencias. */
export function construirRegistro(deps: DepsRegistro): Registro {
  return {
    SEND_EMAIL: {
      reaper: "FAIL", // sin exactly-once sobre SMTP: reencolar = correo duplicado
      backoffTopeMs: 20 * 60_000, // 20 min: un correo de verificacion tardio no sirve
      async handler(job) {
        const message = job.payload as unknown as EmailMessage;
        await deps.emailAdapter.send(message);
      },
      // Conserva SOLO el destinatario (para reenviar a mano), nunca el enlace/token del cuerpo.
      resumenFallo(job) {
        const message = job.payload as unknown as EmailMessage | null;
        return message?.to ? { to: message.to } : null;
      },
    },

    /**
     * Borra el objeto en Bunny cuando el DUEÑO borro su video (la fila ya quedo REMOVED en la ruta).
     * IDEMPOTENTE: un 404 de Bunny (BunnyNotFoundError) significa "ya no existe" -> EXITO, sin
     * reintento; encolar/procesar dos veces el mismo GUID no rompe nada. Un fallo de RED/HTTP se
     * PROPAGA (throw) y el runner reintenta con backoff (REQUEUE); si se agota, el Job queda FAILED
     * y VISIBLE (el objeto NO se pierde en silencio, a diferencia del best-effort inline anterior).
     * NO depende del barrido de huerfanos, que CONSERVA los REMOVED (moderacion, Parte B).
     */
    BUNNY_DELETE_VIDEO: {
      reaper: "REQUEUE", // idempotente de verdad: si el worker cae a media, reintentar es seguro
      async handler(job) {
        const { bunnyVideoId } = BunnyDeletePayloadSchema.parse(job.payload);
        // `deleteVideo` trata el 404 como EXITO (idempotente): borrar un objeto ausente ya cumple el
        // objetivo. Un fallo de RED/HTTP se PROPAGA y el runner lo reintenta (backoff) hasta FAILED.
        await deps.bunny.cliente.deleteVideo({
          libraryId: deps.bunny.config.libraryId,
          apiKey: deps.bunny.config.apiKey,
          videoId: bunnyVideoId,
        });
      },
      // Si acaba en FAILED, conserva el GUID (interno, no personal) para saber que objeto quedo sin borrar.
      resumenFallo(job) {
        const p = BunnyDeletePayloadSchema.safeParse(job.payload);
        return p.success ? { bunnyVideoId: p.data.bunnyVideoId } : null;
      },
    },

    /**
     * Reparte un anuncio del panel: un TRAMO de la audiencia por keyset, con INSERT IGNORE de los avisos
     * sobre la UNIQUE de Notification. REQUEUE, al contrario que SEND_EMAIL: esto escribe en NUESTRA BD
     * y es idempotente de verdad, así que reintentar (o reanudar tras una caída) es seguro y deseable —
     * quien ya lo tenía no recibe otro—. Si queda audiencia, encola el tramo siguiente con su cursor.
     */
    FANOUT_ANUNCIO: {
      reaper: "REQUEUE",
      async handler(job) {
        const { announcementId, desde } = FanoutPayloadSchema.parse(job.payload);
        const tramo = await repartirAnuncio(deps.db, announcementId, desde ?? null);
        if (tramo.siguiente) await encolarTramo(deps.db, announcementId, tramo.siguiente);
      },
      // Si acaba en FAILED, conserva a qué anuncio y a qué tramo afectaba (ids internos, no personales).
      resumenFallo(job) {
        const p = FanoutPayloadSchema.safeParse(job.payload);
        return p.success
          ? {
              announcementId: p.data.announcementId,
              ...(p.data.desde ? { desde: p.data.desde } : {}),
            }
          : null;
      },
    },
  };
}
