/**
 * Perfil · reglas PURAS del nombre y del avatar, COMPARTIDAS por cliente y servidor.
 *
 * El cliente las usa SOLO para UX (feedback inmediato, deshabilitar el botón); el SERVIDOR es el
 * único gate real (re-valida con Zod / re-decodifica la imagen). Mismo patrón que `crear-logic.ts`:
 * la función pura viaja al bundle del navegador sin arrastrar Zod ni Prisma.
 */
import { HANDLE_RE, USERNAME_MIN, USERNAME_MAX } from "@/lib/handle-formato";

export { USERNAME_MIN, USERNAME_MAX };

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
// Nombre de usuario (handle público) — reglas de UX del formulario (P2)
// ---------------------------------------------------------------------------

/** Normaliza el handle a como se guardaría: recorta y pasa a minúsculas (la unicidad es _ci). */
export function normalizarUsername(v: string): string {
  return v.trim().toLowerCase();
}

/**
 * ¿El handle tiene el FORMATO válido? (UX del formulario). Valida sobre la forma normalizada, con el
 * mismo `HANDLE_RE` que usa el servidor. NO comprueba reservados ni unicidad: eso es gate del servidor
 * (la lista de reservados es server-only; el duplicado lo decide la constraint de la BD).
 */
export function usernameEsValido(v: string): boolean {
  return HANDLE_RE.test(normalizarUsername(v));
}

// ---------------------------------------------------------------------------
// Bio y enlaces (perfil v1)
// ---------------------------------------------------------------------------

/** Longitud máxima de la biografía. */
export const BIO_MAX = 300;

/**
 * Longitud máxima del sitio web. Coincide con el ANCHO DE COLUMNA (`website VARCHAR(191)`, el default
 * de Prisma para String): sin este tope, una URL válida de >191 caracteres pasaría Zod y reventaría al
 * insertar con un error crudo de la BD (500 sin copy humano). Se valida arriba con mensaje claro.
 */
export const WEBSITE_MAX = 191;

/**
 * HANDLES (no URLs) de redes: guardar el handle y NO una URL libre evita que alguien meta un enlace
 * malicioso disfrazado de red social. La URL la construye el frontend a partir del handle validado.
 */
export const PATRON_INSTAGRAM = /^[A-Za-z0-9._]{1,30}$/; // usuario de Instagram, sin @ ni URL
export const PATRON_YOUTUBE = /^[A-Za-z0-9._-]{1,30}$/; // handle de YouTube SIN el @ inicial

/** Quita @ iniciales del handle de YouTube (se guarda sin @; el frontend antepone `@`). */
export function normalizarYoutube(handle: string): string {
  return handle.trim().replace(/^@+/, "");
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

// ---------------------------------------------------------------------------
// Estado VISIBLE de MIS vídeos (SOLO el perfil propio)
// ---------------------------------------------------------------------------

/**
 * Estado SEMÁNTICO de un vídeo en "Mis vídeos", ya humanizado del enum crudo de Prisma. El SERVIDOR
 * lo deriva de `status` + `failureReason` (`estadoDeVideo`, con Zod); el CLIENTE lo traduce a copy
 * ("Procesando", "Publicado", "No se pudo procesar"…). Al usuario NUNCA le llega PENDING/FAILED/
 * TOO_LONG: solo este puñado de casos, y sin el `failureReason` crudo. Es un TIPO (sin runtime), así
 * que viaja al bundle del navegador sin arrastrar Zod ni Prisma, igual que el resto de este módulo.
 *
 * `no-disponible`: el vídeo estuvo publicado pero su objeto en Bunny desapareció (la reconciliación
 * Parte C lo degradó a FAILED/OBJETO_INEXISTENTE). Es DISTINTO de "error" (no es que fallara al
 * procesar): al usuario se le dice que "ya no está disponible", no que "no se pudo procesar".
 */
export type EstadoVideo =
  "procesando" | "publicado" | "demasiado-largo" | "no-disponible" | "error";
