/**
 * LA DURACIÓN DE UN BOOST, DICHA EN CASTELLANO (puro).
 *
 * ┌─ POR QUÉ UNA FUNCIÓN Y NO UN TEXTO ───────────────────────────────────────────────────────────┐
 * │ `BOOST_DURACION_MIN` son 60 minutos, y en castellano eso se dice "1 hora": nadie escribe "60 │
 * │ minutos" en una pantalla. Pero escribir "1 hora" a mano deja la copia MINTIENDO el día que la │
 * │ duración pase a 90 — y ese es exactamente el fallo que /boosts evitó durante toda la pieza     │
 * │ anterior no diciendo la duración. Así que la frase se DERIVA del número.                      │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * SE DICE EN LA UNIDAD MÁS GRANDE QUE SALGA EXACTA: 60 -> "1 hora", 120 -> "2 horas", 90 -> "1 h 30
 * min", 45 -> "45 minutos". No se redondea nunca: "más o menos una hora" sobre un plazo que se cobra
 * es la clase de aproximación que después hay que defender.
 */

/** Minutos -> frase. Un valor no entero o <= 0 no es una duración: se dice en crudo, no se adorna. */
export function duracionBoostHumana(minutos: number): string {
  if (!Number.isInteger(minutos) || minutos <= 0) return `${minutos} minutos`;

  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;

  if (horas === 0) return `${resto} ${resto === 1 ? "minuto" : "minutos"}`;
  if (resto === 0) return `${horas} ${horas === 1 ? "hora" : "horas"}`;
  // Mezcla: abreviada, porque "1 hora y 30 minutos" dentro de una frase de producto es un trabalenguas.
  return `${horas} h ${resto} min`;
}
