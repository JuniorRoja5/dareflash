/**
 * Registro. SIN ENUMERACION: si la direccion ya existe, es un no-op silencioso; el
 * endpoint responde IGUAL exista o no. La verificacion por email es la barrera
 * antifraude, asi que el registro NO crea sesion: hay que verificar primero.
 *
 * Recibe el PrismaClient por parametro (testeable).
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { requestEmailVerification } from "@/server/services/email-verification";

import { hashPassword } from "./password";

export async function registerUser(
  db: PrismaClient,
  input: { email: string; password: string; birthDate: Date; appUrl: string; now?: Date },
): Promise<void> {
  // Normalizacion en la capa de aplicacion (no depender de la collation de MariaDB).
  const email = input.email.trim().toLowerCase();

  const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) return; // no-op: no revelar que la direccion ya tiene cuenta

  const passwordHash = await hashPassword(input.password);
  await db.user.create({
    data: {
      email,
      passwordHash,
      birthDate: input.birthDate,
      emailVerified: null, // sin verificar: sin acciones con efectos
    },
  });

  // Encola el correo de verificacion (enlace desde appUrl).
  await requestEmailVerification(db, { email, appUrl: input.appUrl, now: input.now });
}
