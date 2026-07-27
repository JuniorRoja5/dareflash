/**
 * Operaciones de cuenta sensibles a la seguridad. Reciben el PrismaClient por
 * parametro (testeable).
 */
import { SESSION_TTL_BY_ROLE } from "@/config/constants";
import type { PrismaClient } from "@/generated/prisma/client";

import { hashPassword } from "./password";
import { createSession, revokeAllUserSessions, type CreatedSession } from "./session";

/**
 * Cambia la contrasena, REVOCA TODAS las sesiones del usuario y crea UNA NUEVA para
 * el dispositivo que hace el cambio, todo en la MISMA transaccion. Asi las sesiones
 * del atacante mueren pero el usuario legitimo NO se queda fuera tras un cambio
 * legitimo. Devuelve la sesion nueva para que el endpoint fije la cookie.
 * El endpoint verifica la contrasena ACTUAL antes de llamar aqui.
 *
 * El hash (argon2, ~lento) se calcula ANTES de abrir la transaccion, para no
 * mantenerla abierta (ni la conexion) durante el hasheo.
 */
export async function changePassword(
  db: PrismaClient,
  input: { userId: string; newPassword: string; now?: Date },
): Promise<CreatedSession> {
  const passwordHash = await hashPassword(input.newPassword);
  return db.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: input.userId },
      data: { passwordHash },
      select: { role: true },
    });
    await revokeAllUserSessions(tx, input.userId);
    return createSession(tx, input.userId, {
      now: input.now,
      ttlMs: SESSION_TTL_BY_ROLE[user.role],
    });
  });
}

/**
 * Banea a un usuario: marca `bannedAt` Y borra TODAS sus sesiones, en la MISMA
 * transaccion. El chequeo de `bannedAt` en validateSession es defensa en profundidad;
 * el borrado es la revocacion REAL (si se levanta el baneo, no resucitan).
 */
export async function banUser(
  db: PrismaClient,
  input: { userId: string; now?: Date },
): Promise<void> {
  const now = input.now ?? new Date();
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: input.userId }, data: { bannedAt: now } });
    await revokeAllUserSessions(tx, input.userId);
  });
}

/**
 * Cambia el ROL de un usuario y REVOCA TODAS sus sesiones en la MISMA transaccion.
 * Motivo: el TTL de sesion se fija en el login segun el rol; sin revocar, un usuario
 * ascendido a ADMIN conservaria su sesion de 30 dias. Al revocar, vuelve a entrar y
 * coge el TTL correcto (mas corto).
 */
export async function changeRole(
  db: PrismaClient,
  input: { userId: string; role: "USER" | "MODERATOR" | "ADMIN" },
): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: input.userId }, data: { role: input.role } });
    await revokeAllUserSessions(tx, input.userId);
  });
}
