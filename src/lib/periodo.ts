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

/**
 * `YYYY-Www` de la SEMANA ISO (UTC) en la que cae `fecha`. La clave del regalo semanal del VIP.
 *
 * ┌─ POR QUÉ ISO Y NO "CADA SIETE DÍAS DESDE QUE SE SUSCRIBIÓ" ─────────────────────────────────┐
 * │ Contar siete días desde la suscripción haría que cada VIP tuviera su propio calendario, y   │
 * │ entonces "¿a quién le toca hoy?" sería una consulta por persona en vez de una clave común.   │
 * │ Con la semana ISO, el reparto de una semana es UN conjunto: se recorre una vez y la clave    │
 * │ `(usuario, semana)` dice sola quién ya lo tiene. Quien se suscribe un jueves cobra esa misma │
 * │ semana y la siguiente el lunes — gana un poco la primera vez, que es el lado correcto.      │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ Y POR QUÉ ISO Y NO "LA SEMANA DEL AÑO" A OJO ──────────────────────────────────────────────┐
 * │ Porque el borde de año es justo donde se rompe. La regla ISO es: la semana empieza el LUNES  │
 * │ y la semana 1 es la que contiene el primer JUEVES del año. Así, el 1 de enero puede ser la   │
 * │ semana 52 o 53 del año ANTERIOR, y el 31 de diciembre la semana 1 del SIGUIENTE — y la clave │
 * │ lleva el año que le toca a la semana, no el de la fecha. Sin eso, la última semana de        │
 * │ diciembre y la primera de enero comparten clave y alguien se queda sin su boost.             │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * UTC, como todo lo que cuenta en este producto (`RESET_TIMEZONE`).
 */
export function semanaIso(fecha: Date): string {
  // Se trabaja sobre una copia a MEDIODÍA UTC: a las 00:00 cualquier redondeo de milisegundos
  // puede caer en el día anterior, y aquí un día de diferencia es una semana distinta.
  const d = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate(), 12));
  // Al JUEVES de su semana: el jueves es el que decide a qué año pertenece la semana ISO, así que
  // moviéndose a él primero, el año y el número salen los dos del mismo sitio.
  const diaIso = d.getUTCDay() === 0 ? 7 : d.getUTCDay(); // domingo = 7, no 0
  d.setUTCDate(d.getUTCDate() + 4 - diaIso);
  const anio = d.getUTCFullYear();
  const primeroDeEnero = new Date(Date.UTC(anio, 0, 1, 12));
  const semana = Math.ceil(((d.getTime() - primeroDeEnero.getTime()) / 86_400_000 + 1) / 7);
  return `${anio}-W${String(semana).padStart(2, "0")}`;
}
