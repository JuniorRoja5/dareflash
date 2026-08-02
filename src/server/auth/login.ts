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

import { hashPassword, needsRehash, verifyPasswordConstantTime } from "./password";
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

  // Rehasheo OPORTUNISTA: si el hash guardado usa parametros distintos a los actuales (un p=4
  // antiguo), se regraba con los nuevos ahora que tenemos la contrasena en claro y es correcta.
  // Asi los hashes reales convergen a los MISMOS parametros que DUMMY_HASH y no reaparece la
  // diferencia de tiempo (usuario existente vs inexistente). La verificacion previa ya funciono
  // (la libreria lee los params del propio hash); esto solo actualiza el formato.
  //
  // NOTA (no es un bug, anotado a proposito): esto va DESPUES del return de EMAIL_NOT_VERIFIED,
  // asi que un usuario SIN verificar con un hash antiguo no se regraba hasta que verifique y
  // entre. Es correcto: se regrabara en su primer login real. No lo "arregles" adelantandolo: no
  // se debe hacer trabajo extra en un camino que no inicia sesion.
  if (user.passwordHash !== null && needsRehash(user.passwordHash)) {
    await db.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(input.password) },
    });
  }

  // TTL por rol: privilegio mayor -> sesion mas corta.
  const session = await createSession(db, user.id, {
    now: input.now,
    ttlMs: SESSION_TTL_BY_ROLE[user.role],
  });
  return { ok: true, userId: user.id, session };
}
