/**
 * EL HALO DORADO DEL VIP EN LAS LISTAS — el candado, en una función pura.
 *
 * ┌─ POR QUÉ UNA FUNCIÓN Y NO ESCRIBIR LA CLASE EN CADA SUPERFICIE ─────────────────────────────┐
 * │ Es el mismo motivo por el que los nombres pasan todos por `NombreUsuario`: si cada sitio      │
 * │ escribe `esVip ? "df-vip-halo" : ""` por su cuenta, el día que haya una cuarta superficie     │
 * │ alguien la escribirá con `esVip ?? true`, o con un flag que no es el del chokepoint, y el     │
 * │ halo saldrá en quien no lo tiene. Con UNA puerta, la condición se escribe una vez y el guard  │
 * │ puede prohibir que la clase aparezca escrita a mano en cualquier otro fichero.                 │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ ES PURA, Y ESO ES LO QUE LA HACE VIABLE EN EL FEED ───────────────────────────────────────┐
 * │ Devuelve una CADENA al pintar. Ni estado, ni efecto, ni observador, ni nada que vuelva a      │
 * │ correr al desplazarse: el halo entero es CSS estático (ver `.df-vip-halo` en `globals.css`).  │
 * │ El feed es lo más caro de la app, y una marca cosmética no puede costarle trabajo por fila.   │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * `esVip` LLEGA RESUELTO del chokepoint (`esVipActivo` / `vipsActivosEntre`), nunca se decide aquí:
 * las tres superficies ya lo traen EN LOTE para toda la lista, así que esto no añade ni una consulta.
 */

/** Las dos formas del halo. La fila del ranking no tiene marco, así que lleva barra (ver el CSS). */
export type VarianteHalo = "tarjeta" | "fila";

const CLASE: Record<VarianteHalo, string> = {
  tarjeta: "df-vip-halo",
  fila: "df-vip-halo-fila",
};

/**
 * La clase del halo si —y solo si— esa persona es VIP activo. Cadena vacía en cualquier otro caso.
 *
 * DEVUELVE "" Y NO `undefined` a propósito: así se puede interpolar directamente en un
 * `className={...}` sin que aparezca la palabra "undefined" en el atributo, que es el fallo tonto
 * que se cuela cuando el valor opcional viaja a una plantilla.
 */
export function claseHaloVip(
  esVip: boolean | undefined,
  variante: VarianteHalo = "tarjeta",
): string {
  return esVip === true ? CLASE[variante] : "";
}
