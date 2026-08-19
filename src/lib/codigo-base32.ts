/**
 * Código en BASE32 sin caracteres confusos (l, o, 0, 1). PRIMITIVA PURA y compartida: la consumen el
 * generador de handles (`server/auth/handle`, longitud 8) y el `publicCode` de los retos
 * (`server/services/reto-codigo`, longitud 8). Un solo sitio para el alfabeto y el mapeo.
 *
 * Alfabeto de LONGITUD POTENCIA DE DOS (32): cada byte se mapea con `& 31` -> distribución uniforme,
 * sin sesgo de módulo. DETERMINISTA: los mismos bytes dan el mismo código (los tests fijan bytes y
 * comprueban la salida exacta). CLIENTE-SEGURO: no usa `crypto`; la aleatoriedad la ponen los llamadores
 * con `randomBytes`.
 */
export const CODIGO_BASE32_ALFABETO = "abcdefghijkmnpqrstuvwxyz23456789";

/** Mapea `longitud` bytes al alfabeto (un carácter por byte, `& 31`). Necesita al menos `longitud` bytes. */
export function codigoBase32(bytes: Uint8Array, longitud: number): string {
  let s = "";
  for (let i = 0; i < longitud; i++) {
    s += CODIGO_BASE32_ALFABETO[bytes[i]! & 31];
  }
  return s;
}
