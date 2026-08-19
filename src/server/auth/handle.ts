/**
 * HANDLE (username) auto-generado. El `username` es ESTRUCTURALMENTE obligatorio (columna NOT NULL,
 * ver migración `username_not_null`): cada vía de creación de `User` DEBE asignar uno. Aquí vive el
 * generador —único punto— para que registro, bootstrap admin y cualquier alta futura usen el MISMO.
 *
 * NEUTRAL a propósito: base fija `user` + sufijo aleatorio; NO se deriva del email (privacidad: el
 * handle es público). El sufijo sale de un alfabeto sin caracteres confusos (nada de l/o/0/1) y de
 * longitud potencia-de-dos (32) para mapear bytes con máscara sin sesgo de módulo. La UNICIDAD la
 * garantiza la constraint `@unique` de la BD; ante colisión, quien crea REGENERA y reintenta
 * (`HANDLE_MAX_INTENTOS`), no hay `findUnique`-luego-`create` (carrera).
 *
 * Formato compartido con la edición manual (P2) y el backfill de la migración: `^[a-z0-9._]{3,30}$`.
 */
import { randomBytes } from "node:crypto";

import { codigoBase32 } from "@/lib/codigo-base32";

// Formato canónico: fuente única en `@/lib/handle-formato` (cliente-seguro). Se re-exporta para que
// quien ya importaba `HANDLE_RE` desde aquí no cambie.
export { HANDLE_RE } from "@/lib/handle-formato";
// Alfabeto: fuente única en `@/lib/codigo-base32` (compartido con el publicCode de los retos). Se
// re-exporta con el nombre de siempre para no romper a quien lo importaba.
export { CODIGO_BASE32_ALFABETO as HANDLE_ALFABETO } from "@/lib/codigo-base32";

/** Base neutra (no derivada de datos personales). */
export const HANDLE_PREFIJO = "user";

/** Longitud del sufijo aleatorio. 32^8 ≈ 1.1e12 combinaciones -> colisión práctica ~nula. */
export const HANDLE_SUFIJO_LEN = 8;

/** Reintentos acotados ante colisión del UNIQUE antes de rendirse (fallo real, no bucle infinito). */
export const HANDLE_MAX_INTENTOS = 5;

/** PURA: prefijo + sufijo. Aislada para testear el ensamblado sin aleatoriedad. */
export function construirHandle(sufijo: string): string {
  return `${HANDLE_PREFIJO}${sufijo}`;
}

/**
 * PURA: mapea bytes -> sufijo (base32 sin confusos, longitud `HANDLE_SUFIJO_LEN`). Delega en la
 * primitiva compartida `codigoBase32`: comportamiento IDÉNTICO al de antes (mismos bytes -> mismo
 * sufijo), sus tests siguen verdes. Necesita al menos `HANDLE_SUFIJO_LEN` bytes.
 */
export function sufijoDesdeBytes(bytes: Uint8Array): string {
  return codigoBase32(bytes, HANDLE_SUFIJO_LEN);
}

/** Genera un handle aleatorio válido (impura: `randomBytes`). Cada llamada es un candidato nuevo. */
export function generarHandle(): string {
  return construirHandle(sufijoDesdeBytes(randomBytes(HANDLE_SUFIJO_LEN)));
}
