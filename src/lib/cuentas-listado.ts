/**
 * EL VOCABULARIO Y EL CURSOR DEL LISTADO DE CUENTAS (/panel/usuarios) — puro, y aparte del servicio a
 * propósito: lo leen el servidor (para consultar) y la página (para pintar los controles), y escrito
 * dos veces acabarían ofreciendo un orden que la consulta no sabe hacer.
 *
 * TODO LLEGA POR LA URL, así que todo entra por un saneador que devuelve un valor válido o el de por
 * defecto. Un query param manipulado no puede reventar la consulta ni colar SQL: o casa con la forma
 * esperada, o no existe.
 *
 * EL CURSOR LLEVA SU ORDEN DENTRO, y esa es su pieza menos obvia. El keyset compara la TUPLA del
 * orden vigente; un cursor hecho para "puntos" contiene un saldo, y aplicarlo a "alta" compararía ese
 * saldo contra una fecha. En vez de confiar en que la pantalla limpie el cursor al cambiar de orden
 * —lo haría hoy y se olvidaría mañana—, el cursor se RECHAZA si no es del orden que se está pidiendo,
 * y la lista empieza por el principio. Es un no-op, no un error.
 */

/** Los órdenes del listado. Cada uno tiene su índice (ver `User` en el esquema). */
export const ORDENES_CUENTAS = ["alta", "alfabetico", "puntos", "victorias"] as const;
export type OrdenCuentas = (typeof ORDENES_CUENTAS)[number];

/** Por defecto, las últimas altas: es lo que un moderador quiere ver al abrir la pantalla. */
export const ORDEN_CUENTAS_DEFECTO: OrdenCuentas = "alta";

/**
 * Órdenes cuyo valor de cursor es un ENTERO. El alfabético compara texto (el handle); los demás,
 * números —y una fecha lo es, en milisegundos—. La lista existe para que la validación del cursor
 * sepa qué forma exigir sin repetir un `switch`.
 */
const ORDENES_NUMERICOS = new Set<OrdenCuentas>(["alta", "puntos", "victorias"]);

export function ordenCuentasEsNumerico(orden: OrdenCuentas): boolean {
  return ORDENES_NUMERICOS.has(orden);
}

/** Orden pedido por la URL, saneado. Cualquier cosa rara cae al de por defecto. */
export function ordenCuentasDe(raw: unknown): OrdenCuentas {
  return typeof raw === "string" && (ORDENES_CUENTAS as readonly string[]).includes(raw)
    ? (raw as OrdenCuentas)
    : ORDEN_CUENTAS_DEFECTO;
}

/** El filtro de ESTADO. `null` = sin filtrar (todas menos las borradas, que no existen para nadie). */
export const ESTADOS_CUENTA = ["activa", "suspendida"] as const;
export type EstadoCuenta = (typeof ESTADOS_CUENTA)[number];

export function estadoCuentaDe(raw: unknown): EstadoCuenta | null {
  return typeof raw === "string" && (ESTADOS_CUENTA as readonly string[]).includes(raw)
    ? (raw as EstadoCuenta)
    : null;
}

/**
 * El filtro de ROL. Se escribe aquí la lista COMPLETA —incluido ADMIN—, que no es lo mismo que
 * `ROLES_ASIGNABLES` (`lib/permisos`): aquel dice qué roles se pueden OTORGAR y a propósito no
 * contiene ADMIN; este dice por cuáles se puede FILTRAR, y esconder al superadmin de un filtro no
 * protege nada. Dos listas distintas porque responden a dos preguntas distintas.
 */
export const ROLES_FILTRO = ["USER", "MODERATOR", "ADMIN"] as const;
export type RolFiltro = (typeof ROLES_FILTRO)[number];

export function rolFiltroDe(raw: unknown): RolFiltro | null {
  return typeof raw === "string" && (ROLES_FILTRO as readonly string[]).includes(raw)
    ? (raw as RolFiltro)
    : null;
}

/** La última posición servida: el valor del orden vigente y el id que lo desempata. */
export interface PosicionCuentas {
  orden: OrdenCuentas;
  /** Siempre texto. Para los órdenes numéricos, el entero en decimal (una fecha, en ms). */
  valor: string;
  id: string;
}

/**
 * `<orden>.<id>.<valor en base64url>`.
 *
 * El valor va codificado porque el del orden alfabético es un HANDLE, y los handles llevan puntos
 * (`^[a-z0-9._]{3,30}$`): concatenado en crudo partiría el cursor por el sitio equivocado.
 */
export function codificarCursorCuentas(p: PosicionCuentas): string {
  return `${p.orden}.${p.id}.${Buffer.from(p.valor, "utf8").toString("base64url")}`;
}

const FORMA = /^([a-z]{1,12})\.([A-Za-z0-9_-]{1,64})\.([A-Za-z0-9_-]{0,64})$/;
const ENTERO = /^-?\d{1,19}$/;

/**
 * Cursor inválido, manipulado o DE OTRO ORDEN -> `null` = primera página. Nunca una excepción por un
 * query param, y nunca una comparación entre magnitudes distintas.
 */
export function decodificarCursorCuentas(
  raw: string | null | undefined,
  ordenEsperado: OrdenCuentas,
): PosicionCuentas | null {
  if (!raw) return null;
  const m = FORMA.exec(raw);
  if (!m?.[1] || !m[2] || m[3] === undefined) return null;

  const orden = m[1];
  if (!(ORDENES_CUENTAS as readonly string[]).includes(orden)) return null;
  if (orden !== ordenEsperado) return null;

  const valor = Buffer.from(m[3], "base64url").toString("utf8");
  if (valor === "") return null;
  if (ordenCuentasEsNumerico(orden as OrdenCuentas)) {
    if (!ENTERO.test(valor) || !Number.isSafeInteger(Number(valor))) return null;
  }
  return { orden: orden as OrdenCuentas, valor, id: m[2] };
}
