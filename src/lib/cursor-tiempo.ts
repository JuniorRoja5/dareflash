/**
 * EL CURSOR DE UNA LISTA ORDENADA POR `(createdAt, id)` — puro, y compartido.
 *
 * Casi todas las listas del producto se recorren igual: más recientes primero, desempatando por id.
 * El cursor de todas ellas es la misma tupla y la misma validación, así que vive una vez. Existía ya
 * tres veces copiado (el historial propio de retiradas, la cola del panel, la bandeja de avisos), y
 * la cuarta copia iba a ser la que se dejara el `id` fuera.
 *
 * LLEVA LA TUPLA COMPLETA, no solo el id: la referencia es un VALOR de orden, no una fila que tenga
 * que seguir existiendo. Si el cursor fuera un id y esa fila se borrara, la página siguiente no
 * sabría dónde empezar.
 *
 * VIAJA EN LA URL, así que es dato de fuera: un cursor manipulado vuelve `null` —la primera página—
 * en vez de reventar la consulta. Nunca lanza.
 *
 * El formato (dígitos, un punto, caracteres de id) encaja a propósito con lo que acepta la pila de
 * `paginacion-pila`, que es quien lo guarda para poder ir hacia atrás.
 */

export interface PosicionTiempo {
  creadoMs: number;
  id: string;
}

/**
 * La forma del `where` del keyset. Se nombra —en vez de devolver `object`— para poder METERLA EN UN
 * `AND` con tipos: hay listas cuyo propio filtro ya trae un `OR` en la raíz, y ahí fundir con spread
 * se come uno de los dos. Ver `dondeDesde`.
 */
export interface DondeDesdeTiempo {
  OR?: [{ createdAt: { lt: Date } }, { createdAt: Date; id: { lt: string } }];
}

export function codificarCursorTiempo(p: PosicionTiempo): string {
  return `${p.creadoMs}.${p.id}`;
}

export function decodificarCursorTiempo(raw: string | null | undefined): PosicionTiempo | null {
  if (!raw) return null;
  const m = /^(\d{1,15})\.([A-Za-z0-9_-]{1,64})$/.exec(raw);
  if (!m?.[1] || !m[2]) return null;
  const creadoMs = Number(m[1]);
  if (!Number.isSafeInteger(creadoMs)) return null;
  return { creadoMs, id: m[2] };
}

/**
 * El `where` del keyset: "lo que viene DESPUÉS de esta posición", bajando. Se devuelve como objeto
 * para fundirlo con el resto del filtro; `{}` cuando no hay cursor (primera página).
 *
 * Es el trozo que más se copia mal —se escribe el `lt` de la fecha y se olvida la rama del
 * desempate, y entonces dos filas del mismo milisegundo se repiten entre páginas—, así que también
 * vive aquí.
 *
 * ┌─ CUIDADO AL FUNDIRLO: `...dondeDesde(…)` SOLO VALE SI EL FILTRO NO TIENE `OR` ───────────────┐
 * │ Lo que devuelve es un `OR` en la raíz. Si el `where` de la lista ya trae el suyo —la regla de │
 * │ visibilidad del feed, por ejemplo— el spread se come uno de los dos SIN AVISAR, y entonces la │
 * │ página 2 deja de filtrar lo que filtraba la 1. Para ese caso está `conKeysetTiempo`.          │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export function dondeDesde(desde: PosicionTiempo | null): DondeDesdeTiempo {
  if (!desde) return {};
  return {
    OR: [
      { createdAt: { lt: new Date(desde.creadoMs) } },
      { createdAt: new Date(desde.creadoMs), id: { lt: desde.id } },
    ],
  };
}

/**
 * EL FILTRO DE LA LISTA **Y** EL DEL KEYSET, sin que uno se coma al otro.
 *
 * Los mete en un `AND`, que es la única forma de componer dos condiciones cuando las dos pueden
 * traer un `OR`. Es lo que hay que usar siempre que el `where` de la lista no sea una conjunción
 * plana de igualdades — y, por si acaso, también cuando lo es: cuesta lo mismo y no hay que volver
 * a mirarlo cada vez que alguien añada una condición al filtro.
 */
export function conKeysetTiempo<T extends object>(filtro: T, desde: PosicionTiempo | null): T {
  if (!desde) return filtro;
  // El `as T` es el precio de ser genérico: `{ AND: [...] }` es un `where` válido en cualquier
  // modelo de Prisma, pero el tipo de `T` no lo sabe. Queda ENCERRADO aquí, en una línea, en vez
  // de repetido en cada lista.
  return { AND: [filtro, dondeDesde(desde)] } as unknown as T;
}
