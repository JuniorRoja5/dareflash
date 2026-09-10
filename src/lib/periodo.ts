/**
 * PERIODO MENSUAL en UTC. El ranking se reinicia por mes natural, y "mes natural" tiene que
 * significar lo mismo en todo el sistema o los bordes se descuadran: alguien gana un reto a las
 * 23:50 del día 31 en Madrid y su victoria cae en un mes distinto según quién la mire.
 *
 * TODO EN UTC, como el resto del proyecto (ver `RESET_TIMEZONE` en constants). El corte del mes es el
 * día 1 a las 00:00 UTC. La zona horaria del usuario solo interviene al PRESENTAR, nunca al contar.
 *
 * El periodo se guarda como texto `YYYY-MM` a propósito, no como fecha: es una CLAVE, no un instante.
 * Así el índice del ranking agrupa por igualdad exacta —el caso más barato— en vez de por rango, y
 * dos filas del mismo mes no pueden diferir por un milisegundo.
 */

/** `YYYY-MM` del mes natural (UTC) en el que cae `fecha`. */
export function periodoDe(fecha: Date): string {
  const anio = fecha.getUTCFullYear();
  const mes = String(fecha.getUTCMonth() + 1).padStart(2, "0");
  return `${anio}-${mes}`;
}

/**
 * Rango semiabierto `[desde, hasta)` del periodo. Semiabierto y no cerrado a propósito: con un
 * "hasta" inclusivo hay que elegir el último milisegundo del mes, y esa es una fuente clásica de
 * victorias que se pierden o se cuentan dos veces en el borde.
 */
export function rangoDelPeriodo(periodo: string): { desde: Date; hasta: Date } {
  const [anio, mes] = periodo.split("-").map(Number);
  const a = anio ?? 1970;
  const m = mes ?? 1;
  return {
    desde: new Date(Date.UTC(a, m - 1, 1)),
    hasta: new Date(Date.UTC(a, m, 1)),
  };
}

/** ¿`fecha` cae dentro del periodo? Misma regla que el rango, en un solo sitio. */
export function estaEnPeriodo(fecha: Date, periodo: string): boolean {
  const { desde, hasta } = rangoDelPeriodo(periodo);
  return fecha >= desde && fecha < hasta;
}
