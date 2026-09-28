/**
 * PROGRESO AL SIGUIENTE NIVEL (puro). Cuánto te falta y qué parte del tramo llevas.
 *
 * Se deriva de `NIVELES` y de nada más: los umbrales son una decisión de producto que ya vive ahí, y
 * escribirlos otra vez en una pantalla sería un segundo catálogo esperando a discrepar del primero.
 * Mover un umbral en `niveles.ts` tiene que cambiar esta barra sin tocar esta función.
 *
 * EL PORCENTAJE ES DEL TRAMO, NO DEL TOTAL. De Challenger (100) a Pro (500) hay 400 puntos, así que
 * con 300 llevas el 50% —no el 3% que saldría de dividir entre los 10.000 de Legend—. Una barra que
 * casi no se mueve en meses no informa de nada.
 */
import { NIVELES, nivelPorPuntos, type Nivel } from "./niveles";

export interface ProgresoNivel {
  /** Nivel actual. */
  nivel: Nivel;
  /** El siguiente, o `null` si ya estás en el más alto. */
  siguiente: Nivel | null;
  /** Puntos que faltan para entrar en `siguiente`. 0 cuando no hay siguiente. */
  faltan: number;
  /** Parte recorrida del tramo actual, 0..100 enteros. 100 solo cuando NO hay siguiente. */
  porcentaje: number;
  /** ¿Es el nivel más alto? Entonces no hay barra que enseñar, hay un techo. */
  esMaximo: boolean;
}

export function progresoNivel(puntos: number): ProgresoNivel {
  const nivel = nivelPorPuntos(puntos);
  const indice = NIVELES.findIndex((n) => n.clave === nivel.clave);
  const siguiente = NIVELES[indice + 1] ?? null;

  // TECHO: ni barra ni "faltan N". Enseñar una barra al 100% permanente invita a buscar el siguiente
  // nivel, y no lo hay; decirlo es más corto y más honesto.
  if (!siguiente) return { nivel, siguiente: null, faltan: 0, porcentaje: 100, esMaximo: true };

  const base = nivel.minimo;
  const tramo = siguiente.minimo - base;
  // Puntos negativos no existen por diseño (`pointsBalance` nunca baja de cero), pero si llegaran
  // caerían en Rookie con un recorrido negativo: se sujeta en 0 en vez de pintar una barra al revés.
  const recorrido = Math.max(0, puntos - base);

  return {
    nivel,
    siguiente,
    faltan: siguiente.minimo - puntos,
    // FLOOR, no round: con 499 de 500, `round` diría "100%" al lado de "falta 1 punto". Una barra que
    // dice que has llegado cuando no has llegado es justo lo que nadie se cree la segunda vez.
    porcentaje: Math.min(100, Math.floor((recorrido / tramo) * 100)),
    esMaximo: false,
  };
}
