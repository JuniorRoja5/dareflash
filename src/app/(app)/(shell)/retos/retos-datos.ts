/**
 * RETOS · el catálogo de categorías adaptado a la vista y el filtro PURO del feed. Aquí vivió la
 * maqueta (`RETOS_SEED`, `RetoSemilla`, `buscarReto`, `retosDestacados`): retos, votos y plazos
 * inventados que pintaba la portada en producción. Se fue con P14 (la portada ya es real); ningún
 * fichero de producción la usaba ya. `sin-datos-maqueta` vigila que no vuelva.
 */

import { CATEGORIES, type CategoryKey } from "@/config/constants";

/**
 * Las 14 categorias — FUENTE UNICA: `CATEGORIES` de `config/constants` (documento maestro; sin
 * "Deportes"). Aqui NO se duplica la lista: solo se ADAPTA su forma a la vista (`clave` = la `key`
 * estable que guarda `Challenge.category`; `nombre` = la etiqueta en español).
 */
export const CATEGORIAS = CATEGORIES.map((c) => ({ clave: c.key, nombre: c.es }));

export type CategoriaClave = CategoryKey;

/** clave -> etiqueta legible de una categoria. Acepta `string` (una clave desconocida se devuelve tal
 *  cual): asi vale tambien para la categoria cruda de un resultado de busqueda. */
export { nombreCategoria } from "@/lib/categorias";

/** Clave del filtro "Todos" (no es una categoria: no puede chocar con ninguna `clave`). */
export const CATEGORIA_TODOS = "todos" as const;

/**
 * Filtro PURO del feed. `todos` -> todos (copia estable, mismo orden); una categoria -> solo los que
 * coinciden. NO muta la lista original. Extraido para atarlo con dientes: ignorar la categoria cae
 * en rojo. Generico sobre `{ categoria }` para atarlo con datos minimos.
 */
export function filtrarRetos<T extends { categoria: string }>(
  retos: readonly T[],
  categoria: string,
): T[] {
  if (categoria === CATEGORIA_TODOS) return retos.slice();
  return retos.filter((reto) => reto.categoria === categoria);
}
