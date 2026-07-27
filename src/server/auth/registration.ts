/**
 * Registro. SIN ENUMERACION, y sin oraculo por TIEMPO: si la direccion ya existe es un
 * no-op silencioso, y el coste temporal es el MISMO exista o no la cuenta. La
 * verificacion por email es la barrera antifraude, asi que el registro NO crea sesion:
 * hay que verificar primero.
 *
 * Dos decisiones clave contra los ataques de enumeracion:
 *  1. TIEMPO: `hashPassword` (argon2, ~cientos de ms, el coste dominante) se calcula
 *     SIEMPRE, antes de tocar la BD. Si primero mirasemos si el email existe y solo
 *     entonces hasheasemos, "email nuevo" tardaria cientos de ms mas que "email
 *     existente" y eso, medido, revelaria que cuentas existen. El coste extra por
 *     hashear siempre esta acotado por REGISTER_PER_IP.
 *  2. CARRERA: no hay `findUnique`-luego-`create` (dos peticiones simultaneas con el
 *     mismo email nuevo colarian ambas y una reventaria con un 500). Insertamos directo
 *     y la restriccion UNIQUE de `email` decide; si choca (P2002 = ya existe, o carrera)
 *     lo tratamos como el mismo no-op silencioso.
 *
 * Recibe el PrismaClient por parametro (testeable).
 */
import { Prisma } from "@/generated/prisma/client";
import type { PrismaClient } from "@/generated/prisma/client";
import { requestEmailVerification } from "@/server/services/email-verification";

import { hashPassword } from "./password";

function esEmailYaRegistrado(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

export async function registerUser(
  db: PrismaClient,
  input: { email: string; password: string; birthDate: Date; appUrl: string; now?: Date },
): Promise<void> {
  // Normalizacion en la capa de aplicacion (no depender de la collation de MariaDB).
  const email = input.email.trim().toLowerCase();

  // Hashear SIEMPRE y ANTES de mirar la BD: el coste dominante (argon2) es igual exista
  // o no la cuenta, asi no hay diferencia de tiempo que delate cuentas existentes.
  const passwordHash = await hashPassword(input.password);

  try {
    // Insertar directo; la UNIQUE de `email` decide. Esto tambien cierra la carrera de
    // dos registros simultaneos del mismo email (uno crea, el otro choca -> P2002).
    await db.user.create({
      data: {
        email,
        passwordHash,
        birthDate: input.birthDate,
        emailVerified: null, // sin verificar: sin acciones con efectos
      },
    });
  } catch (e) {
    if (esEmailYaRegistrado(e)) return; // no-op: no revelar que la direccion ya tiene cuenta
    throw e;
  }

  // Solo si la cuenta es NUEVA se encola el correo de verificacion (enlace desde appUrl).
  // El encolado es un INSERT ligero (~ms), despreciable frente al coste de argon2 que ya
  // pagan por igual ambos caminos, asi que no reintroduce un oraculo de tiempo medible.
  await requestEmailVerification(db, { email, appUrl: input.appUrl, now: input.now });
}
