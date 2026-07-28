/**
 * Encolado de email. `enqueueEmail` NO envia: crea un job `SEND_EMAIL`. Asi un SMTP lento o
 * caido nunca tumba la peticion (p.ej. un registro): el usuario recibe respuesta inmediata y
 * el correo sale despues, por el worker (ver src/server/jobs/). El ENVIO (adapter.send) y el
 * borrado del payload al terminar viven en el runner/registro, no aqui.
 */
import "server-only";

import { Prisma } from "@/generated/prisma/client";
import type { PrismaClient } from "@/generated/prisma/client";

import type { EmailMessage } from "./adapter";

const SEND_EMAIL = "SEND_EMAIL";

export interface EnqueueEmailOptions {
  /** Clave de idempotencia DETERMINISTA: un doble encolado del mismo correo no crea dos jobs. */
  idempotencyKey?: string;
  /** Cuando enviarlo (UTC). Por defecto, ya. */
  runAt?: Date;
}

/** Encola un correo. No envia. Un `idempotencyKey` repetido es un no-op silencioso (no duplica). */
export async function enqueueEmail(
  db: PrismaClient,
  message: EmailMessage,
  options: EnqueueEmailOptions = {},
): Promise<void> {
  try {
    await db.job.create({
      data: {
        type: SEND_EMAIL,
        payload: message as unknown as Prisma.InputJsonValue,
        runAt: options.runAt ?? new Date(),
        ...(options.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}),
      },
    });
  } catch (e) {
    // P2002 en idempotencyKey (unico): ya hay un job para este correo -> no-op, no duplicar.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return;
    throw e;
  }
}
