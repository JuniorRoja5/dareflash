/**
 * NIVELES del sistema (dominio, reutilizable: Perfil + Ranking). Puntos -> nivel con nombre, del mas
 * bajo al mas alto. Config de DOMINIO, no de pantalla: la asignacion es una decision de producto, no
 * un detalle de una vista. Es MAQUETA en cuanto a valores mostrados, pero el mapeo puntos->nivel es
 * el real. `tier` (1..5) alimenta el medidor geometrico de la insignia (sin emoji).
 */

export type ClaveNivel = "rookie" | "challenger" | "pro" | "elite" | "legend";

/**
 * EL GLIFO de cada nivel. Son formas NUESTRAS dibujadas en SVG, no emoji: un emoji lo pinta cada
 * sistema operativo a su manera —y el brief los prohibe como iconos—, asi que "la llama de Pro" seria
 * una llama distinta en cada telefono. Rookie no tiene: es el estandar, y marcarlo lo convertiria en
 * una insignia mas en vez de en "todavia no tienes ninguna".
 */
export type ClaveEmblema = "marca" | "llama" | "gema" | "corona";

export type Nivel = {
  clave: ClaveNivel;
  nombre: string;
  /** Umbral INFERIOR inclusivo de puntos para entrar en el nivel. */
  minimo: number;
  /** Posicion 1..5 (rookie=1 ... legend=5): cuantas barras enciende el medidor. */
  tier: number;
  /** Glifo del emblema, o `null` en Rookie (sin marca). */
  emblema: ClaveEmblema | null;
  /**
   * TOKEN CSS del color del emblema (no el hex: los colores viven en `globals.css`, uno por tema, y
   * aqui solo se nombra cual toca). `null` cuando no hay emblema.
   *
   * LEGEND USA `--df-rank`, el oro del podio, y no un oro propio. No es pereza: es lo que dijeron los
   * numeros. En el tema CLARO el dorado ya esta ocupado dos veces —`--df-money` y `--df-rank`— y un
   * tercer oro no se separa de ninguno de los dos (CIEDE2000 por debajo de 8: se confunden). Y el
   * significado tampoco pedia uno nuevo: la medalla y la corona dicen las dos "lo mas alto". Un oro,
   * un significado. Donde el oro YA esta haciendo de puesto (las filas de podio del ranking), el
   * emblema se retira y el nivel lo dice la insignia de texto — ver `FilaPuesto`.
   */
  tokenColor: string | null;
};

/** Los cinco niveles, ORDENADOS por umbral ascendente. Umbrales del brief: 0/100/500/2000/10000. */
export const NIVELES: readonly Nivel[] = [
  { clave: "rookie", nombre: "Rookie", minimo: 0, tier: 1, emblema: null, tokenColor: null },
  {
    clave: "challenger",
    nombre: "Challenger",
    minimo: 100,
    tier: 2,
    emblema: "marca",
    tokenColor: "--df-nivel-challenger",
  },
  {
    clave: "pro",
    nombre: "Pro",
    minimo: 500,
    tier: 3,
    emblema: "llama",
    tokenColor: "--df-nivel-pro",
  },
  {
    clave: "elite",
    nombre: "Elite",
    minimo: 2000,
    tier: 4,
    emblema: "gema",
    tokenColor: "--df-nivel-elite",
  },
  {
    clave: "legend",
    nombre: "Legend",
    minimo: 10000,
    tier: 5,
    emblema: "corona",
    tokenColor: "--df-rank",
  },
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

/**
 * Nivel ALCANZADO al pasar de `antes` a `despues` puntos, o `null` si no se cruzó ningún umbral hacia
 * arriba (PURO). Es lo que decide el aviso SUBISTE_NIVEL: se emite al CRUZAR, no en cada otorgamiento —
 * sumar puntos sin cambiar de nivel no dice nada nuevo.
 *
 * Un salto de varios niveles de golpe (90 -> 600) devuelve SOLO el de llegada (Pro), no uno por cada
 * umbral saltado: un aviso por hecho, y el hecho es "ahora eres Pro". Bajar de nivel devuelve `null`.
 */
export function nivelAlcanzado(antes: number, despues: number): Nivel | null {
  const previo = nivelPorPuntos(antes);
  const nuevo = nivelPorPuntos(despues);
  return nuevo.tier > previo.tier ? nuevo : null;
}
