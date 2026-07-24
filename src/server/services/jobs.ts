/**
 * Reclamacion de jobs de la cola, PORTABLE (sin SKIP LOCKED).
 *
 * Cada ejecucion genera un token propio y hace un UPDATE ATOMICO que marca como
 * RUNNING un lote de jobs pendientes vencidos, estampando su token en `lockedBy`.
 * Luego relee sus filas por ese token. Dos ejecuciones simultaneas NO reclaman el
 * mismo job: el UPDATE bloquea las filas segun las recorre y reevalua el WHERE
 * (`status='PENDING'`) sobre la version ya comprometida, asi que la segunda salta
 * las que la primera acaba de marcar RUNNING. No hace falta SKIP LOCKED.
 *
 * Todos los handlers deben ser idempotentes (el cron puede solaparse o repetirse).
 * Igual que el ledger, recibe el PrismaClient por parametro (testeable).
 */
import { Prisma } from "@/generated/prisma/client";
import type { PrismaClient } from "@/generated/prisma/client";
import type { JobModel } from "@/generated/prisma/models";

import { LEDGER_TX_OPTIONS } from "@/server/services/ledger";

export interface ClaimJobsInput {
  /** Token unico de esta ejecucion (p.ej. un cuid/uuid distinto por invocacion). */
  workerToken: string;
  /** Tamano del lote. Lotes pequenos y frecuentes (respeta el timeout del plan). */
  limit: number;
  /** "ahora" en UTC (inyectable para tests). Por defecto, el reloj del servidor. */
  now?: Date;
}

/**
 * Reclama hasta `limit` jobs pendientes cuyo `runAt` ya vencio y los devuelve.
 * Devuelve exactamente las filas que ESTA ejecucion reclamo (por su token).
 */
export async function claimJobs(db: PrismaClient, input: ClaimJobsInput): Promise<JobModel[]> {
  const { workerToken } = input;
  const now = input.now ?? new Date();

  // `limit` va como identificador crudo, pero validado como entero positivo: MySQL
  // no siempre acepta un parametro ligado en LIMIT.
  const limit = Math.floor(input.limit);
  if (!Number.isFinite(limit) || limit <= 0) {
    throw new Error(`claimJobs: limit invalido (${input.limit}).`);
  }

  return db.$transaction(async (tx) => {
    await tx.$executeRaw(
      Prisma.sql`
        UPDATE \`Job\`
        SET \`status\` = 'RUNNING', \`lockedBy\` = ${workerToken}, \`lockedAt\` = ${now}
        WHERE \`status\` = 'PENDING' AND \`runAt\` <= ${now}
        ORDER BY \`runAt\` ASC
        LIMIT ${Prisma.raw(String(limit))}
      `,
    );

    return tx.job.findMany({
      where: { lockedBy: workerToken, status: "RUNNING" },
      orderBy: { runAt: "asc" },
    });
  }, LEDGER_TX_OPTIONS);
}
