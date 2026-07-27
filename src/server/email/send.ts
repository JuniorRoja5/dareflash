/**
 * Envio de email VIA COLA de trabajos.
 *
 * `enqueueEmail` no envia: encola un job `SEND_EMAIL`. Asi un SMTP lento o un limite
 * de envio nunca tumba la peticion (p.ej. un registro): el usuario recibe respuesta
 * inmediata y el correo sale despues. `processEmailBatch` es el handler que corre
 * desde la cola (el runner del cron llega en el Paso 8).
 *
 * El LOG operativo NUNCA registra el cuerpo ni el token: `lastError` es generico, y
 * al terminar un envio se BORRA el payload del job (que contiene el enlace/token),
 * para no retenerlo en la BD.
 */
import "server-only";

import { EMAIL_MAX_PER_QUEUE_RUN } from "@/config/constants";
import { Prisma } from "@/generated/prisma/client";
import type { PrismaClient } from "@/generated/prisma/client";
import { claimJobs } from "@/server/services/jobs";

import type { EmailAdapter, EmailMessage } from "./adapter";

const SEND_EMAIL = "SEND_EMAIL";

export interface EnqueueEmailOptions {
  /** Clave de idempotencia (evita encolar el mismo correo dos veces). */
  idempotencyKey?: string;
  /** Cuando enviarlo (UTC). Por defecto, ya. */
  runAt?: Date;
}

/** Encola un correo. No envia. */
export async function enqueueEmail(
  db: PrismaClient,
  message: EmailMessage,
  options: EnqueueEmailOptions = {},
): Promise<void> {
  await db.job.create({
    data: {
      type: SEND_EMAIL,
      payload: message as unknown as Prisma.InputJsonValue,
      runAt: options.runAt ?? new Date(),
      ...(options.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}),
    },
  });
}

export interface ProcessEmailInput {
  workerToken: string;
  /** Ritmo maximo por ejecucion (respeta el limite horario del SMTP compartido). */
  limit?: number;
  now?: Date;
}

export interface ProcessEmailResult {
  sent: number;
  failed: number;
}

/** Backoff exponencial acotado, en ms. */
function backoffMs(attempts: number): number {
  return Math.min(2 ** attempts * 1000, 10 * 60 * 1000); // hasta 10 min
}

/**
 * Reclama un lote de jobs SEND_EMAIL y los envia con el adaptador dado. Marca DONE
 * (y borra el payload) o reintenta con backoff hasta maxAttempts (luego FAILED).
 */
export async function processEmailBatch(
  db: PrismaClient,
  adapter: EmailAdapter,
  input: ProcessEmailInput,
): Promise<ProcessEmailResult> {
  const jobs = await claimJobs(db, {
    workerToken: input.workerToken,
    limit: input.limit ?? EMAIL_MAX_PER_QUEUE_RUN,
    now: input.now,
    type: SEND_EMAIL,
  });

  let sent = 0;
  let failed = 0;

  for (const job of jobs) {
    try {
      const message = job.payload as unknown as EmailMessage;
      await adapter.send(message);
      await db.job.update({
        where: { id: job.id },
        // Borrar el payload: contiene el enlace/token, no debe quedar retenido.
        data: { status: "DONE", payload: Prisma.DbNull, lockedBy: null },
      });
      sent += 1;
    } catch {
      const attempts = job.attempts + 1;
      const agotado = attempts >= job.maxAttempts;
      await db.job.update({
        where: { id: job.id },
        data: {
          status: agotado ? "FAILED" : "PENDING",
          attempts,
          lastError: "email send failed", // generico, sin token ni cuerpo
          lockedBy: null,
          runAt: agotado
            ? job.runAt
            : new Date((input.now ?? new Date()).getTime() + backoffMs(attempts)),
        },
      });
      failed += 1;
    }
  }

  return { sent, failed };
}
