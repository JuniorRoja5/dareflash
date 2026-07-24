/**
 * Servicio de VOTO. La antifraude es ESTRUCTURAL: el doble voto lo impide el
 * `@@unique([userId, submissionId])` de la base de datos, no una comprobacion en
 * codigo. Este servicio inserta el Vote e incrementa Submission.voteCount en la
 * MISMA transaccion; si el INSERT viola el UNIQUE, la transaccion entera revierte
 * y el contador no sube.
 *
 * Recibe el PrismaClient por parametro (testeable), como el resto de servicios.
 */
import { Prisma } from "@/generated/prisma/client";
import type { PrismaClient } from "@/generated/prisma/client";

import { LEDGER_TX_OPTIONS } from "@/server/services/ledger";

export interface CastVoteInput {
  userId: string;
  submissionId: string;
  challengeId: string; // denormalizado en Vote (antifraude por reto)
  ipHash?: string; // IP hasheada, nunca en claro
}

export type CastVoteResult = { voted: true } | { voted: false; reason: "ALREADY_VOTED" };

function esViolacionDeUnicidad(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

export async function castVote(db: PrismaClient, input: CastVoteInput): Promise<CastVoteResult> {
  try {
    await db.$transaction(async (tx) => {
      // 1) BLOQUEAR la fila de la Submission (FOR UPDATE), igual que el ledger
      //    bloquea la del User. Serializa a los votantes concurrentes sobre esta
      //    submission, de modo que el incremento del contador no colisiona (evita el
      //    error 1020 "record has changed" del hot-row) y no se pierden votos.
      await tx.$executeRaw(
        Prisma.sql`SELECT \`id\` FROM \`Submission\` WHERE \`id\` = ${input.submissionId} FOR UPDATE`,
      );
      // 2) Insertar el voto: si viola el UNIQUE, la transaccion revierte antes de
      //    tocar el contador.
      await tx.vote.create({
        data: {
          userId: input.userId,
          submissionId: input.submissionId,
          challengeId: input.challengeId,
          ipHash: input.ipHash ?? null,
        },
      });
      // 3) Incrementar el contador denormalizado en la misma transaccion.
      await tx.submission.update({
        where: { id: input.submissionId },
        data: { voteCount: { increment: 1 } },
      });
    }, LEDGER_TX_OPTIONS);

    return { voted: true };
  } catch (e) {
    if (esViolacionDeUnicidad(e)) {
      return { voted: false, reason: "ALREADY_VOTED" };
    }
    throw e;
  }
}
