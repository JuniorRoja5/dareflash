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
import { Prisma } from "@/generated/prisma/client";
import type { JobModel } from "@/generated/prisma/models";
import type { EmailAdapter, EmailMessage } from "@/server/email/adapter";

export type PoliticaReaper = "FAIL" | "REQUEUE";

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
  };
}
