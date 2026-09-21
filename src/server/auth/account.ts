/**
 * Operaciones de cuenta sensibles a la seguridad. Reciben el PrismaClient por
 * parametro (testeable).
 */
import { SESSION_TTL_BY_ROLE } from "@/config/constants";
import type { PrismaClient } from "@/generated/prisma/client";
import type { Db } from "@/server/db/types";

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
 * EL NUCLEO de banear, DENTRO de una transaccion que abre quien llama. Existe para que el gobierno de
 * cuentas pueda escribir su `AuditLog` en la MISMA transaccion que el baneo: si el registro de quien
 * hizo que se escribiera aparte, un fallo entre medias dejaria una cuenta baneada sin rastro de por
 * quien. La logica NO se duplica: `banUser` es esto mismo con su transaccion propia.
 */
export async function banearEnTx(tx: Db, userId: string, now: Date = new Date()): Promise<void> {
  await tx.user.update({ where: { id: userId }, data: { bannedAt: now } });
  await revokeAllUserSessions(tx, userId);
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
  await db.$transaction(async (tx) => {
    await banearEnTx(tx, input.userId, input.now ?? new Date());
  });
}

/**
 * LEVANTAR el baneo. Solo pone `bannedAt` a null: las sesiones borradas al banear NO resucitan —ni
 * deben—, asi que el usuario vuelve a entrar y coge un TTL nuevo. Es lo contrario de banear, no un
 * "deshacer": lo que se destruyo (las sesiones) sigue destruido.
 */
export async function desbanearEnTx(tx: Db, userId: string): Promise<void> {
  await tx.user.update({ where: { id: userId }, data: { bannedAt: null } });
}

/**
 * EL NUCLEO de cambiar el rol, dentro de la transaccion de quien llama (ver `banearEnTx`).
 */
export async function cambiarRolEnTx(
  tx: Db,
  userId: string,
  role: "USER" | "MODERATOR" | "ADMIN",
): Promise<void> {
  await tx.user.update({ where: { id: userId }, data: { role } });
  await revokeAllUserSessions(tx, userId);
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
    await cambiarRolEnTx(tx, input.userId, input.role);
  });
}
