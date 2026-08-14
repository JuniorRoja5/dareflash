/**
 * Perfil · reglas PURAS del nombre y del avatar, COMPARTIDAS por cliente y servidor.
 *
 * El cliente las usa SOLO para UX (feedback inmediato, deshabilitar el botón); el SERVIDOR es el
 * único gate real (re-valida con Zod / re-decodifica la imagen). Mismo patrón que `crear-logic.ts`:
 * la función pura viaja al bundle del navegador sin arrastrar Zod ni Prisma.
 */

/** Longitud del nombre visible (displayName). 2 evita nombres de un carácter; 40 cabe en la UI. */
export const NOMBRE_MIN = 2;
export const NOMBRE_MAX = 40;

/**
 * WHITELIST de caracteres del nombre: letras Unicode, números, espacio y `. _ ' -`. Deja fuera
 * `<`, `>`, `/`, `&`, controles y emojis. React ya escapa al renderizar (el riesgo real de XSS lo
 * cubre el escape, no esta lista), pero acotar el conjunto evita nombres-basura y homoglifos raros.
 * `u` (Unicode) para que `\p{L}`/`\p{N}` cubran acentos y alfabetos no latinos.
 */
export const PATRON_NOMBRE = /^[\p{L}\p{N} ._'-]+$/u;

/** Colapsa espacios internos y recorta extremos: "  Ana   Gómez " -> "Ana Gómez". */
export function normalizarNombre(nombre: string): string {
  return nombre.trim().replace(/\s+/g, " ");
}

/**
 * ¿El nombre es válido? Se valida sobre la forma NORMALIZADA (lo que de verdad se guardaría), en los
 * DOS sentidos: dentro de longitud Y solo caracteres de la whitelist. Vacío/solo espacios -> false.
 */
export function nombreEsValido(nombre: string): boolean {
  const s = normalizarNombre(nombre);
  if (s.length < NOMBRE_MIN || s.length > NOMBRE_MAX) return false;
  return PATRON_NOMBRE.test(s);
}

// ---------------------------------------------------------------------------
// Avatar (imagen)
// ---------------------------------------------------------------------------

/** Tope de tamaño del avatar SUBIDO (bytes que llegan del navegador). 5 MB es de sobra para una foto
 *  de perfil; el servidor recomprime a algo mucho menor. Es un LÍMITE DE SEGURIDAD del servidor, no
 *  solo UX: acota memoria/CPU del decodificado antes de tocar la imagen. */
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

/** Tipos de imagen aceptados. El servidor NO se fía del `Content-Type`: re-detecta por los bytes. */
export const AVATAR_TIPOS = ["image/jpeg", "image/png", "image/webp"] as const;
export type AvatarTipo = (typeof AVATAR_TIPOS)[number];

/** Guarda de UX en el cliente: ¿el fichero elegido supera el tope? (el gate real es el servidor). */
export function avatarExcedeTope(bytes: number): boolean {
  return bytes > AVATAR_MAX_BYTES;
}
