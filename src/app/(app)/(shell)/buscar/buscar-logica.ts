/**
 * BÚSQUEDA · lógica PURA de la vista /buscar (sin red ni estado): construcción de la URL del endpoint,
 * validación de la consulta, y destino de los chips de categoría. Testeable en aislamiento.
 */
import { CATEGORIES, type CategoryKey } from "@/config/constants";

/** Pestañas que consultan la API (la de "categorias" NO consulta: lista chips que enlazan a /retos). */
export type TipoBusqueda = "usuarios" | "retos";

/** ¿La consulta tiene longitud suficiente para buscar? (mismo mínimo que el endpoint: 2). */
export function consultaValida(q: string): boolean {
  return q.trim().length >= 2;
}

/** URL del endpoint de A2 con los parámetros dados (el cursor, opcional, para "cargar más"). */
export function urlBuscar(p: { q: string; tipo: TipoBusqueda; cursor?: string | null }): string {
  const sp = new URLSearchParams({ q: p.q.trim(), tipo: p.tipo });
  if (p.cursor) sp.set("cursor", p.cursor);
  return `/api/buscar?${sp.toString()}`;
}

/** Destino de un chip de categoría: el feed de retos FILTRADO por esa categoría. */
export function hrefCategoria(clave: CategoryKey): string {
  return `/retos?categoria=${encodeURIComponent(clave)}`;
}

/** Valida un valor de la URL contra las categorías conocidas; `null` si no es ninguna. */
export function categoriaValida(v: string | null | undefined): CategoryKey | null {
  if (!v) return null;
  return CATEGORIES.some((c) => c.key === v) ? (v as CategoryKey) : null;
}
