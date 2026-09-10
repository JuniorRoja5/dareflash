/**
 * FORMA DEL PODIO. Pura: entra cuánta gente hay de verdad y sale qué posiciones se pintan y en qué
 * orden visual.
 *
 * POR QUÉ EXISTE. El podio estaba escrito para EXACTAMENTE tres: una tupla `[A, B, C]` y una tabla de
 * geometría con entradas 1/2/3. Con datos de maqueta siempre había tres, así que el caso no existía.
 * Con datos reales existe desde el primer día: hasta que cierre el primer reto no hay NADIE, luego hay
 * uno, luego dos. El componente se limitaba a desaparecer con menos de tres — y como la lista empieza
 * en el 4º puesto, el ganador de los dos primeros retos no salía por ningún lado.
 *
 * La decisión de producto, cerrada: se pintan SOLO las posiciones que existen. Nada de pedestales
 * vacíos ni siluetas fantasma — un pedestal sin persona es un dato falso disfrazado de hueco.
 */

/** Puestos que ocupan pedestal. Más de tres no: el podio son tres, el resto va en lista. */
export const PODIO_MAX = 3;

export type PuestoPodio = 1 | 2 | 3;

/** Token de medalla del podio por puesto. */
export type Medalla = "rank" | "silver" | "bronze";

/**
 * Medalla (token de color) por PUESTO del podio. Regla de marca: 1 -> oro (`rank`), 2 -> plata
 * (`silver`), 3 -> bronce (`bronze`); fuera del podio -> null (no llevan medalla). El oro se reserva
 * al 1; plata SOLO al 2; bronce SOLO al 3. Cambiar el mapeo (p. ej. 2 -> rank) cae en rojo.
 *
 * Vivía dentro del módulo de datos de maqueta, que se retiró. Es lógica de MARCA, no de maqueta:
 * borrarla con los datos falsos habría quitado el guardarraíl junto con el andamio.
 */
export function medallaPuesto(puesto: number): Medalla | null {
  if (puesto === 1) return "rank";
  if (puesto === 2) return "silver";
  if (puesto === 3) return "bronze";
  return null;
}

/**
 * Puestos a pintar, EN ORDEN VISUAL de izquierda a derecha (escritorio).
 *
 * El primero no va a la izquierda: va al CENTRO, con los otros flanqueándolo. Por eso el orden visual
 * no es el orden de clasificación y hace falta esta función en vez de un `slice`.
 *   1 persona  -> [1]        (centrado, sin flancos que dejar vacíos)
 *   2 personas -> [2, 1]     (el primero a la derecha del segundo, sin hueco donde iría el tercero)
 *   3 o más    -> [2, 1, 3]  (el podio clásico)
 */
export function ordenVisualPodio(cuantos: number): PuestoPodio[] {
  const n = Math.min(Math.max(Math.floor(cuantos), 0), PODIO_MAX);
  if (n <= 0) return [];
  if (n === 1) return [1];
  if (n === 2) return [2, 1];
  return [2, 1, 3];
}

/** ¿Cuántos entran al podio? El resto va a la lista. */
export function cuantosEnPodio(total: number): number {
  return Math.min(Math.max(Math.floor(total), 0), PODIO_MAX);
}

/**
 * Puesto (1-based) del primer elemento de la lista que va DEBAJO del podio. Con 2 personas el podio
 * se queda con las 2 y la lista arranca en el 3; con 10, arranca en el 4.
 *
 * Se calcula y no se fija a 4: con la constante clavada, un ranking de 2 personas dejaría la lista
 * empezando en el 4 y los puestos pintados no cuadrarían con la realidad.
 */
export function primerPuestoDeLista(total: number): number {
  return cuantosEnPodio(total) + 1;
}
