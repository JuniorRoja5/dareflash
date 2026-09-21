/**
 * EL CURSOR DE LA COLA DE MODERACIÓN — puro, y aparte del servicio a propósito.
 *
 * La cola se ordena por DENUNCIANTES DISTINTOS (desc) y desempata por el id del objeto (desc). Un
 * cursor de OFFSET no vale: mientras el moderador revisa, entran denuncias nuevas que cambian los
 * recuentos, y la página siguiente se saltaría objetos o repetiría otros. Por eso el cursor lleva la
 * TUPLA de orden completa, que es lo que el SQL compara en su `HAVING`.
 *
 * Viaja al cliente, así que se serializa a texto plano y se REVALIDA al volver: un cursor manipulado
 * no puede reventar la consulta ni colar SQL — o casa con la forma esperada, o es `null` (primera
 * página), como en el resto de listas del proyecto.
 */
export interface PosicionCola {
  /** Cuántas personas DISTINTAS han denunciado el objeto (el UNIQUE de Report lo garantiza). */
  denunciantes: number;
  targetId: string;
}

export function codificarCursorCola(p: PosicionCola): string {
  return `${p.denunciantes}.${p.targetId}`;
}

/** Cursor inválido o manipulado -> `null` = primera página. Nunca una excepción por un query param. */
export function decodificarCursorCola(raw: string | null | undefined): PosicionCola | null {
  if (!raw) return null;
  const m = /^(\d{1,9})\.([A-Za-z0-9_-]{1,64})$/.exec(raw);
  if (!m?.[1] || !m[2]) return null;
  const denunciantes = Number(m[1]);
  if (!Number.isSafeInteger(denunciantes)) return null;
  return { denunciantes, targetId: m[2] };
}
