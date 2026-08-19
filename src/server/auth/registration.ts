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
 *     y la restriccion UNIQUE de `email` decide; si choca en EMAIL (P2002 = ya existe, o
 *     carrera) es el no-op silencioso. Un P2002 en OTRA constraint unica se relanza (ver
 *     `esViolacionUnicaDeEmail`): no ocultar un fallo real tras "te enviamos un correo".
 *
 * Recibe el PrismaClient por parametro (testeable).
 */
import { Prisma } from "@/generated/prisma/client";
import type { PrismaClient } from "@/generated/prisma/client";
import { objetivoDeViolacionUnica } from "@/server/db/errores";
import { requestEmailVerification } from "@/server/services/email-verification";

import { generarHandle, HANDLE_MAX_INTENTOS } from "./handle";
import { hashPassword } from "./password";

/**
 * ¿Es un P2002 causado por la constraint UNICA de `email`? SOLO ese caso es el no-op
 * silencioso del registro. User tiene otra columna unica (`username`, ahora SIEMPRE
 * asignado en el alta, ver mas abajo); si el alta viola OTRA constraint unica que NO sea
 * la colision de handle (que se reintenta), NO debe tragarse en silencio (el usuario veria
 * "te hemos enviado un correo" sin que exista cuenta): se relanza.
 */
export function esViolacionUnicaDeEmail(e: unknown): boolean {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== "P2002") return false;
  return /email/i.test(objetivoDeViolacionUnica(e));
}

/**
 * ¿Es un P2002 causado por la constraint UNICA de `username`? Es el caso RECUPERABLE del alta:
 * el handle auto-generado ha chocado con uno ya existente -> se regenera y se reintenta (acotado).
 * NO es un error a mostrar al usuario (el handle es interno en el registro; se personaliza luego).
 */
export function esViolacionUnicaDeUsername(e: unknown): boolean {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== "P2002") return false;
  return /username/i.test(objetivoDeViolacionUnica(e));
}

export async function registerUser(
  db: PrismaClient,
  input: { email: string; password: string; birthDate: Date; appUrl: string; now?: Date },
  // `generarHandle` inyectable SOLO para test (forzar una colision de handle y ver el reintento).
  // Produccion usa el generador real por defecto.
  deps: { generarHandle?: () => string } = {},
): Promise<void> {
  const nuevoHandle = deps.generarHandle ?? generarHandle;
  // Normalizacion en la capa de aplicacion (no depender de la collation de MariaDB).
  const email = input.email.trim().toLowerCase();

  // Hashear SIEMPRE y ANTES de mirar la BD: el coste dominante (argon2) es igual exista
  // o no la cuenta, asi no hay diferencia de tiempo que delate cuentas existentes.
  const passwordHash = await hashPassword(input.password);

  // Insertar directo; la UNIQUE de `email` decide (cierra tambien la carrera de dos registros
  // simultaneos del mismo email: uno crea, el otro choca -> P2002). El `username` se auto-genera
  // (handle NEUTRAL; nunca NULL) y, si choca con uno existente, se REGENERA y se reintenta (acotado):
  // no hay findUnique-luego-create, la constraint es el arbitro.
  for (let intento = 0; ; intento++) {
    try {
      await db.user.create({
        data: {
          email,
          username: nuevoHandle(),
          passwordHash,
          birthDate: input.birthDate,
          emailVerified: null, // sin verificar: sin acciones con efectos
        },
      });
      break; // creado
    } catch (e) {
      // Choque en `email` -> no-op silencioso (sin enumeracion).
      if (esViolacionUnicaDeEmail(e)) return;
      // Choque en `username` -> el handle aleatorio ya existia; regenerar y reintentar (acotado).
      if (esViolacionUnicaDeUsername(e) && intento < HANDLE_MAX_INTENTOS - 1) continue;
      // Cualquier otra cosa (o agotar los reintentos) es un fallo real: no ocultarlo.
      throw e;
    }
  }

  // Solo si la cuenta es NUEVA se encola el correo de verificacion (enlace desde appUrl).
  // El encolado es un INSERT ligero (~ms), despreciable frente al coste de argon2 que ya
  // pagan por igual ambos caminos, asi que no reintroduce un oraculo de tiempo medible.
  await requestEmailVerification(db, { email, appUrl: input.appUrl, now: input.now });
}
