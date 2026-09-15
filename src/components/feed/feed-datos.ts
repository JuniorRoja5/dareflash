/**
 * FEED · formato de contadores. Aquí vivía también `COMENTARIOS_FEED`, la maqueta del panel de
 * comentarios de escritorio (veinte comentarios inventados, los mismos para todos los vídeos). Se fue
 * cuando llegaron los comentarios reales (`ComentariosVideo`), y `tests/sin-datos-maqueta.test.ts`
 * impide que vuelva.
 */

/** 1 decimal, sin ".0" (1.0 -> "1", 12.4 -> "12.4"). */
function redondea1(x: number): string {
  return (Math.round(x * 10) / 10).toString();
}

/**
 * Formato COMPACTO de un contador (decision PURA, atada con dientes): < 1000 tal cual; miles -> "K";
 * millones -> "M". Se renderiza con `tabular-nums`. Romper el formato (no compactar) cae en rojo.
 */
export function formatearContador(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${redondea1(n / 1000)}K`;
  return `${redondea1(n / 1_000_000)}M`;
}
