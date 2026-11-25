/**
 * LA DURACIÓN DE UN BOOST, DICHA CON PALABRAS (puro).
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
 *
 * LAS PALABRAS vienen de fuera (Fase 11 · P5b2a): esta función decide QUÉ unidad toca y la cuenta; cómo
 * se dice («1 hora», «2 horas», «1 h 30 min») lo pone el diccionario (`duracion`, con plurales) a través
 * de `palabrasDuracion` (src/textos/duracion.ts). El castellano de `PALABRAS_PANEL` es solo para el
 * PANEL, que no se traduce y no pasa por el diccionario de la página: fuera del panel, nadie lo usa.
 */

/** Cómo se dice cada forma de una duración en un idioma. */
export interface PalabrasDuracion {
  minutos(n: number): string;
  horas(n: number): string;
  /** La mezcla, abreviada: «1 h 30 min». */
  horasMinutos(horas: number, minutos: number): string;
  /** Un valor que no es una duración (no entero o <= 0), dicho en crudo. */
  enCrudo(valor: number): string;
}

/** El castellano del PANEL (no se traduce). Las pantallas de la app pasan las suyas, del diccionario. */
export const PALABRAS_PANEL: PalabrasDuracion = {
  minutos: (n) => `${n} ${n === 1 ? "minuto" : "minutos"}`,
  horas: (n) => `${n} ${n === 1 ? "hora" : "horas"}`,
  horasMinutos: (h, m) => `${h} h ${m} min`,
  enCrudo: (valor) => `${valor} minutos`,
};

/** Minutos -> frase. Un valor no entero o <= 0 no es una duración: se dice en crudo, no se adorna. */
export function duracionBoostHumana(
  minutos: number,
  palabras: PalabrasDuracion = PALABRAS_PANEL,
): string {
  if (!Number.isInteger(minutos) || minutos <= 0) return palabras.enCrudo(minutos);

  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;

  if (horas === 0) return palabras.minutos(resto);
  if (resto === 0) return palabras.horas(horas);
  // Mezcla: abreviada, porque "1 hora y 30 minutos" dentro de una frase de producto es un trabalenguas.
  return palabras.horasMinutos(horas, resto);
}
