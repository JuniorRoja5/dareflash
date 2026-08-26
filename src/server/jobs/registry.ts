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

import { Prisma } from "@/generated/prisma/client";
import type { JobModel } from "@/generated/prisma/models";
import type { EmailAdapter, EmailMessage } from "@/server/email/adapter";
import { urlMiniatura } from "@/server/services/bunny";
import type { ClienteBunny, ConfigBunny } from "@/server/services/bunny";

export type PoliticaReaper = "FAIL" | "REQUEUE";

/** Payload del job BUNNY_DELETE_VIDEO: solo el GUID del objeto en Bunny (no dato personal). */
const BunnyDeletePayloadSchema = z.object({ bunnyVideoId: z.string().min(1) });

/** Payload del job BUNNY_PURGE_THUMBNAIL: el GUID cuyo thumbnail.jpg hay que purgar del borde. */
const BunnyPurgeThumbPayloadSchema = z.object({ bunnyVideoId: z.string().min(1) });

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
  emailAdapter: EmailAdapter;
  /** Cliente de Bunny + su config (libraryId/apiKey) para el borrado del objeto por la cola. */
  bunny: {
    cliente: ClienteBunny;
    config: ConfigBunny;
    /**
     * Hostname de la pull-zone y clave de la API DE CUENTA, SOLO para purgar el CDN. La clave es
     * OPCIONAL (ver `BUNNY_PURGE_API_KEY` en env.ts): sin ella el job de purga no puede trabajar y
     * lo dice en el log, en vez de fingir exito.
     */
    cdnHostname: string;
    purgeApiKey?: string | undefined;
  };
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
     * Purga en el CDN el `thumbnail.jpg` de un video cuyo DUEÑO acaba de fijar una miniatura
     * PERSONALIZADA. Sin esto la miniatura nueva no llega a verse: el borde sigue sirviendo la
     * automatica que cacheo antes (el detalle esta en `purgarMiniatura`).
     *
     * Va por la COLA y no inline en la ruta por dos motivos: purgar con `async=false` puede tardar
     * segundos (no se hace esperar a quien acaba de subir una imagen) y, si Bunny falla, el reintento
     * con backoff lo recupera en vez de dejar la miniatura vieja para siempre. IDEMPOTENTE de verdad
     * (purgar dos veces la misma URL es un no-op correcto) -> reaper REQUEUE.
     */
    BUNNY_PURGE_THUMBNAIL: {
      reaper: "REQUEUE", // idempotente: purgar de mas no rompe nada
      async handler(job) {
        const { bunnyVideoId } = BunnyPurgeThumbPayloadSchema.parse(job.payload);
        // SIN CLAVE DE PURGA: se avisa y se da por HECHO, no se lanza. Lanzar significa "reintentame",
        // y ningun reintento va a hacer aparecer una variable de entorno que no esta: solo llenaria la
        // cola de FAILED y dispararia el aviso de acumulacion, tapando fallos de verdad. La
        // consecuencia real (la miniatura tarda en refrescarse) queda dicha en el log.
        if (!deps.bunny.purgeApiKey) {
          console.warn(
            `[jobs] BUNNY_PURGE_THUMBNAIL: falta BUNNY_PURGE_API_KEY en el .env; NO se purga el CDN ` +
              `(guid ${bunnyVideoId}). La miniatura personalizada no se vera hasta que caduque la cacheada.`,
          );
          return;
        }
        // La URL la construye `urlMiniatura` (punto unico): si la ruta del objeto en Bunny cambiara,
        // se cambia ahi y purga y poster siguen apuntando al MISMO sitio.
        await deps.bunny.cliente.purgeUrl({
          purgeApiKey: deps.bunny.purgeApiKey,
          url: urlMiniatura(deps.bunny.cdnHostname, bunnyVideoId),
        });
      },
      // Si acaba en FAILED, el GUID (interno, no personal) dice que miniatura quedo sin refrescar.
      resumenFallo(job) {
        const p = BunnyPurgeThumbPayloadSchema.safeParse(job.payload);
        return p.success ? { bunnyVideoId: p.data.bunnyVideoId } : null;
      },
    },
  };
}
