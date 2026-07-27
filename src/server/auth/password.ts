/**
 * Hash y verificacion de contrasenas con Argon2id (verificado que funciona en el
 * hosting compartido de Hostinger, Paso 6 / Tarea A).
 *
 * Recibe/develve strings; no toca la BD. Testeable desde Node y usable desde el
 * script CLI del admin, por eso NO lleva `import "server-only"` (no guarda secretos;
 * basta la convencion de que nada bajo src/server/** se importa desde el cliente).
 */
import argon2 from "argon2";

const ARGON2_OPTIONS = { type: argon2.argon2id } as const;

/**
 * Hash ficticio (params por defecto de argon2id) para la verificacion TIMING-SAFE
 * del login: cuando el usuario NO existe, se verifica igualmente contra este hash
 * para que la respuesta tarde lo mismo que cuando si existe. Sin esto, un atacante
 * distingue "usuario existe" por el tiempo de respuesta (canal lateral) -> enumeracion.
 */
const DUMMY_HASH =
  "$argon2id$v=19$m=65536,p=4,t=3$T7FPkqOWwQ9A/1lZ+yd7Fg$WXKFC9qLIX/4FX2cIiPW1xwzQpXZ7jS50PgPgGXDV8w";

/** Hashea una contrasena en claro con Argon2id. */
export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, ARGON2_OPTIONS);
}

/** Verifica una contrasena contra su hash. Nunca lanza por hash invalido: devuelve false. */
export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

/**
 * Verificacion TIMING-SAFE para el login: acepta `hash | null`. Si es null (el
 * usuario no existe o no tiene contrasena), gasta el mismo tiempo verificando contra
 * el hash ficticio y devuelve false. SIEMPRE ejecuta un argon2.verify.
 */
export async function verifyPasswordConstantTime(
  hash: string | null,
  plain: string,
): Promise<boolean> {
  const target = hash ?? DUMMY_HASH;
  const ok = await verifyPassword(target, plain);
  // Si no habia hash real, el resultado nunca es valido (aunque el dummy "coincidiera").
  return hash !== null && ok;
}
