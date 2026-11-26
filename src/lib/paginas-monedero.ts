/**
 * LAS DOS LISTAS PAGINADAS DEL MONEDERO EN UNA URL (PU1) — puro.
 *
 * /wallet enseña dos historiales a la vez, «Tus solicitudes» y «Últimos movimientos», y cada uno pasa
 * de página por su cuenta con `PasosKeyset`. Si los dos usaran `cursor` y `pila`, pasar de página en
 * uno movería el otro (los dos leerían el mismo cursor, que además no es de su tabla). Por eso cada
 * lista tiene SUS nombres, y el enlace de una lleva la posición de la otra tal como está: pasar de
 * página en los movimientos deja las solicitudes donde estaban, y al revés.
 *
 * Lo fija `tests/monedero-paginas`.
 */
import {
  leerPila,
  type ClavesPaginacion,
  type Paginacion,
  escribirPila,
} from "@/lib/paginacion-pila";

export const CLAVES_SOLICITUDES: ClavesPaginacion = {
  cursor: "solicitudes",
  pila: "solicitudes_pila",
};
export const CLAVES_MOVIMIENTOS: ClavesPaginacion = {
  cursor: "movimientos",
  pila: "movimientos_pila",
};

/** Filas por página en las dos listas. */
export const FILAS_POR_PAGINA_MONEDERO = 10;

type Busqueda = Readonly<Record<string, string | string[] | undefined>>;

/**
 * El cursor tal como viene: solo una cadena, recortada. Es dato de fuera; quien lo decodifica
 * (`decodificarCursorTiempo`) rechaza uno manipulado y devuelve la primera página.
 */
function cursorDe(v: string | string[] | undefined): string | null {
  return typeof v === "string" && v !== "" ? v.slice(0, 120) : null;
}

function leer(sp: Busqueda, claves: ClavesPaginacion): Paginacion {
  return { cursor: cursorDe(sp[claves.cursor]), pila: leerPila(sp[claves.pila]) };
}

export interface PaginasMonedero {
  solicitudes: Paginacion;
  movimientos: Paginacion;
}

export function leerPaginasMonedero(sp: Busqueda): PaginasMonedero {
  return { solicitudes: leer(sp, CLAVES_SOLICITUDES), movimientos: leer(sp, CLAVES_MOVIMIENTOS) };
}

/** Una posición escrita con sus nombres, para viajar como `filtro` en el enlace de la OTRA lista. */
function comoFiltro(p: Paginacion, claves: ClavesPaginacion): Record<string, string | null> {
  return { [claves.cursor]: p.cursor, [claves.pila]: escribirPila(p.pila) || null };
}

/** Lo que el enlace de las SOLICITUDES tiene que conservar: dónde están los movimientos. */
export function conservarParaSolicitudes(p: PaginasMonedero): Record<string, string | null> {
  return comoFiltro(p.movimientos, CLAVES_MOVIMIENTOS);
}

/** Lo que el enlace de los MOVIMIENTOS tiene que conservar: dónde están las solicitudes. */
export function conservarParaMovimientos(p: PaginasMonedero): Record<string, string | null> {
  return comoFiltro(p.solicitudes, CLAVES_SOLICITUDES);
}
