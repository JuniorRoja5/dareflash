/**
 * Cuenta CANARIO para validar restauraciones. Vive en produccion pero nace INUTILIZABLE:
 * `bannedAt` puesto y `emailVerified` a null, de modo que `login` y `validateSession` la
 * rechazan pase lo que pase con su contrasena. La validacion NO pasa por el flujo de login:
 * llama directo a `verifyPassword` contra su hash. Asi demostramos que la fila sobrevivio
 * al ciclo dump/restore y que argon2 funciona, SIN dejar una credencial valida en una base
 * con dinero.
 *
 * IMPORTANTE: no "arregles" esta cuenta quitandole el baneo o verificandola. Si lo haces,
 * la validacion del respaldo FALLA a proposito (ver problemasDeSeguridadDelCanario): una
 * cuenta canario usable seria una puerta trasera permanente con contrasena conocida.
 */
import type { PrismaClient } from "../../src/generated/prisma/client";
import { hashPassword, verifyPassword } from "../../src/server/auth/password";

/** `.invalid` (RFC 2606) garantiza que nunca es una direccion entregable. */
export const CANARY_EMAIL = "canary+backup-restore@dareflash.invalid";

/**
 * Contrasena CONOCIDA a proposito: la cuenta esta baneada y sin verificar, asi que no
 * sirve para entrar. Solo se usa para comprobar que verifyPassword casa con el hash
 * restaurado. No es un secreto porque la cuenta es inutilizable por diseño.
 */
export const CANARY_PASSWORD = "backup-restore-canary-cuenta-inutilizable";

/** Fecha de baneo FIJA (sentinela "baneado desde siempre"): reprovisionar es idempotente. */
const CANARY_BANNED_AT = new Date("2000-01-01T00:00:00.000Z");

export interface FilaCanario {
  bannedAt: Date | null;
  emailVerified: Date | null;
  passwordHash: string | null;
}

export interface ResultadoCanario {
  ok: boolean;
  motivos: string[];
}

/**
 * Problemas de SEGURIDAD del canario (puro). El invariante es que sea INUTILIZABLE:
 * baneado Y sin verificar. Si no lo es, se reporta como problema y la validacion falla.
 */
export function problemasDeSeguridadDelCanario(row: FilaCanario): string[] {
  const m: string[] = [];
  if (row.bannedAt === null) {
    m.push("PELIGRO: el canario NO esta baneado (seria una credencial usable con clave conocida)");
  }
  if (row.emailVerified !== null) {
    m.push("PELIGRO: el canario tiene emailVerified != null (seria una credencial usable)");
  }
  if (!row.passwordHash) {
    m.push("el canario no tiene passwordHash");
  }
  return m;
}

/** Crea o repone el canario. Idempotente: siempre queda baneado, sin verificar y con hash valido. */
export async function provisionarCanario(db: PrismaClient): Promise<void> {
  const passwordHash = await hashPassword(CANARY_PASSWORD);
  await db.user.upsert({
    where: { email: CANARY_EMAIL },
    update: { bannedAt: CANARY_BANNED_AT, emailVerified: null, passwordHash },
    create: { email: CANARY_EMAIL, bannedAt: CANARY_BANNED_AT, emailVerified: null, passwordHash },
  });
}

/**
 * Valida el canario en la base (restaurada): existe, es inutilizable (baneado + sin
 * verificar) y su hash casa con CANARY_PASSWORD. `verify` es inyectable para tests.
 */
export async function validarCanarioEnBase(
  db: PrismaClient,
  verify: (hash: string, plain: string) => Promise<boolean> = verifyPassword,
): Promise<ResultadoCanario> {
  const row = await db.user.findUnique({
    where: { email: CANARY_EMAIL },
    select: { bannedAt: true, emailVerified: true, passwordHash: true },
  });
  if (!row) {
    return { ok: false, motivos: ["no existe la cuenta canario en la base restaurada"] };
  }

  const motivos = problemasDeSeguridadDelCanario(row);
  // Prueba de integridad: la fila sobrevivio al ciclo y argon2 verifica contra el hash.
  const passOk = row.passwordHash ? await verify(row.passwordHash, CANARY_PASSWORD) : false;
  if (!passOk) {
    motivos.push("verifyPassword del canario fallo (hash corrupto o argon2 roto)");
  }

  return { ok: motivos.length === 0, motivos };
}
