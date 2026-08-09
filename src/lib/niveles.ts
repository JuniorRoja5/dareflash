/**
 * NIVELES del sistema (dominio, reutilizable: Perfil + Ranking). Puntos -> nivel con nombre, del mas
 * bajo al mas alto. Config de DOMINIO, no de pantalla: la asignacion es una decision de producto, no
 * un detalle de una vista. Es MAQUETA en cuanto a valores mostrados, pero el mapeo puntos->nivel es
 * el real. `tier` (1..5) alimenta el medidor geometrico de la insignia (sin emoji).
 */

export type ClaveNivel = "rookie" | "challenger" | "pro" | "elite" | "legend";

export type Nivel = {
  clave: ClaveNivel;
  nombre: string;
  /** Umbral INFERIOR inclusivo de puntos para entrar en el nivel. */
  minimo: number;
  /** Posicion 1..5 (rookie=1 ... legend=5): cuantas barras enciende el medidor. */
  tier: number;
};

/** Los cinco niveles, ORDENADOS por umbral ascendente. Umbrales del brief: 0/100/500/2000/10000. */
export const NIVELES: readonly Nivel[] = [
  { clave: "rookie", nombre: "Rookie", minimo: 0, tier: 1 },
  { clave: "challenger", nombre: "Challenger", minimo: 100, tier: 2 },
  { clave: "pro", nombre: "Pro", minimo: 500, tier: 3 },
  { clave: "elite", nombre: "Elite", minimo: 2000, tier: 4 },
  { clave: "legend", nombre: "Legend", minimo: 10000, tier: 5 },
];

/** Cuantas barras tiene el medidor de la insignia (== numero de niveles). */
export const TOTAL_TIERS = NIVELES.length;

/**
 * Nivel por puntos (PURO). Devuelve el nivel de mayor `minimo` que `puntos` alcanza. Fronteras
 * INCLUSIVAS por abajo: 99 -> Rookie, 100 -> Challenger, 1999 -> Pro, 2000 -> Elite, 9999 -> Elite,
 * 10000 -> Legend. Puntos negativos -> Rookie. Extraida para atarla con dientes: mover un umbral
 * cae en rojo.
 */
export function nivelPorPuntos(puntos: number): Nivel {
  let elegido = NIVELES[0]!;
  for (const nivel of NIVELES) {
    if (puntos >= nivel.minimo) elegido = nivel;
  }
  return elegido;
}
