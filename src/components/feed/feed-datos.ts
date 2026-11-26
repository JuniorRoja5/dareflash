/**
 * FEED · formato de contadores. Aquí vivía también `COMENTARIOS_FEED`, la maqueta del panel de
 * comentarios de escritorio (veinte comentarios inventados, los mismos para todos los vídeos). Se fue
 * cuando llegaron los comentarios reales (`ComentariosVideo`), y `tests/sin-datos-maqueta.test.ts`
 * impide que vuelva.
 */
import { formatearCompacto, type Idioma } from "@/lib/formato";

/**
 * Formato COMPACTO de un contador (decision PURA, atada con dientes): < 1000 tal cual; desde mil, la
 * forma compacta DEL IDIOMA («1,2 mil» en español, «1.2K» en inglés), del formateador único (P1). Antes
 * se escribía a mano («12.4K» también en español); un tamaño o una cifra compacta escritos a mano son
 * rojo en `formato-a-mano`. Se renderiza con `tabular-nums`.
 */
export function formatearContador(n: number, idioma: Idioma): string {
  return formatearCompacto(n, idioma);
}
