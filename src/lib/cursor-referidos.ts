/**
 * EL CURSOR DE "A QUIÉN HE INVITADO" — puro, y aparte del servicio a propósito.
 *
 * La lista va de la invitación más reciente a la más antigua, así que el orden es
 * `(createdAt DESC, id DESC)` y el cursor lleva esa tupla entera. Un OFFSET no vale: mientras alguien
 * mira su historial pueden entrar altas nuevas por su enlace, y la página siguiente se saltaría a
 * quien acabó de registrarse o repetiría a otro. El `id` no es decoración — sin él, dos invitados que
 * se registran en el mismo milisegundo no tienen orden definido.
 *
 * Viaja al cliente en la URL, así que se serializa en texto plano y se REVALIDA al volver: un cursor
 * manipulado no revienta la consulta ni cuela SQL. O casa con la forma esperada, o es `null` (primera
 * página), como en el resto de listas del proyecto.
 */

/** La última posición servida: el instante del alta (en ms) y el id que lo desempata. */
export interface PosicionReferido {
  altaMs: number;
  id: string;
}

export function codificarCursorReferidos(p: PosicionReferido): string {
  return `${p.altaMs}.${p.id}`;
}

/** 13 dígitos cubren cualquier fecha realista en ms; el id es un cuid. */
const FORMA = /^(\d{1,15})\.([A-Za-z0-9_-]{1,64})$/;

/** Cursor inválido o manipulado -> `null` = primera página. Nunca una excepción por un query param. */
export function decodificarCursorReferidos(
  raw: string | null | undefined,
): PosicionReferido | null {
  if (!raw) return null;
  const m = FORMA.exec(raw);
  if (!m?.[1] || !m[2]) return null;
  const altaMs = Number(m[1]);
  if (!Number.isSafeInteger(altaMs)) return null;
  return { altaMs, id: m[2] };
}
