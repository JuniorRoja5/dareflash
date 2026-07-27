/**
 * Login. TIMING-SAFE y SIN ENUMERACION: siempre se ejecuta una verificacion de
 * contrasena (contra un hash ficticio si el usuario no existe), y una credencial
 * invalida responde igual exista o no la cuenta. Solo tras verificar la contrasena
 * se crea la sesion (token nuevo = rotacion; nunca antes).
 *
 * Recibe el PrismaClient por parametro (testeable).
 */
import { SESSION_TTL_BY_ROLE } from "@/config/constants";
import type { PrismaClient } from "@/generated/prisma/client";

import { verifyPasswordConstantTime } from "./password";
import { createSession, type CreatedSession } from "./session";

export type LoginResult =
  | { ok: true; userId: string; session: CreatedSession }
  | { ok: false; reason: "INVALID_CREDENTIALS" | "EMAIL_NOT_VERIFIED" };

export async function login(
  db: PrismaClient,
  input: { email: string; password: string; now?: Date },
): Promise<LoginResult> {
  // Normalizacion en la capa de aplicacion (no depender de la collation de MariaDB).
  const email = input.email.trim().toLowerCase();

  const user = await db.user.findUnique({
    where: { email },
    select: {
      id: true,
      role: true,
      passwordHash: true,
      emailVerified: true,
      deletedAt: true,
      bannedAt: true,
    },
  });

  // SIEMPRE se verifica (timing-safe): si no hay usuario, contra el hash ficticio.
  const passwordOk = await verifyPasswordConstantTime(user?.passwordHash ?? null, input.password);

  // Credenciales invalidas / usuario baneado o borrado: mismo resultado, sin filtrar.
  if (!passwordOk || !user || user.deletedAt !== null || user.bannedAt !== null) {
    return { ok: false, reason: "INVALID_CREDENTIALS" };
  }

  // Barrera antifraude: sin email verificado no se inicia sesion.
  if (user.emailVerified === null) {
    return { ok: false, reason: "EMAIL_NOT_VERIFIED" };
  }

  // TTL por rol: privilegio mayor -> sesion mas corta.
  const session = await createSession(db, user.id, {
    now: input.now,
    ttlMs: SESSION_TTL_BY_ROLE[user.role],
  });
  return { ok: true, userId: user.id, session };
}
