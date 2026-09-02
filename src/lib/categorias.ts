/**
 * Nombre visible de una categoría a partir de su `key` del catálogo.
 *
 * Vive aquí, en `lib` (puro, sin React ni servidor), porque lo necesitan las DOS orillas: el listado y
 * el detalle de retos en cliente, y los servicios de feed/participaciones en servidor. Estaba escrito
 * dos veces con firmas distintas —una exigía `string` y otra aceptaba `null`—, así que cada consumidor
 * tenía que recordar cuál le tocaba. Una sola, la general.
 *
 * Una key que no esté en el catálogo se muestra TAL CUAL en vez de desaparecer: es un dato de producto
 * que alguien tendrá que corregir, y ocultarlo lo haría invisible.
 */
import { CATEGORIES } from "@/config/constants";

export function nombreCategoria(key: string | null | undefined): string | null {
  if (!key) return null;
  return CATEGORIES.find((c) => c.key === key)?.es ?? key;
}
