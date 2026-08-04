/**
 * TOPRANKING · datos de VISTA y logica pura (Paso C · unidad 4). Maqueta: NO es el modelo de datos.
 * Dos listas mock (mensual + del reto en curso) y `listaRanking` para el conmutador. Los puntos van
 * en NEUTRO (no son dinero): la primitiva `FilaPuesto` ya garantiza oro solo en 1/2/3 y puntos sin
 * lima. `usuario_demo` aparece en media tabla en ambas para demostrar el resaltado (`activo`).
 */

export type FilaRankVista = { username: string; puntos: number };

/** El usuario actual de la maqueta (el mismo del Perfil): se resalta su fila. */
export const USUARIO_ACTUAL = "usuario_demo";

/** Clasificacion mensual (puntos acumulados del mes). Ordenada de mayor a menor. */
export const RANKING_MENSUAL: readonly FilaRankVista[] = [
  { username: "lucia.voz", puntos: 48210 },
  { username: "noscope_king_2012", puntos: 44980 },
  { username: "cocina_express_maria", puntos: 41500 },
  { username: "carlos_fit", puntos: 38750 },
  { username: "dario", puntos: 35120 },
  { username: "maxi_y_rocky", puntos: 31890 },
  { username: "laia10", puntos: 29400 },
  { username: "sara_p", puntos: 27050 },
  { username: "usuario_demo", puntos: 24680 },
  { username: "entrenador_dani", puntos: 22310 },
  { username: "rae", puntos: 19870 },
  { username: "viajera_incansable_2025", puntos: 17540 },
  { username: "leo", puntos: 15220 },
  { username: "bea", puntos: 12980 },
  { username: "nico_skate", puntos: 10650 },
];

/** Clasificacion del reto en curso (puntos de ESTE reto). Otro orden y otros valores. */
export const RANKING_RETO: readonly FilaRankVista[] = [
  { username: "carlos_fit", puntos: 5240 },
  { username: "cocina_express_maria", puntos: 4980 },
  { username: "laia10", puntos: 4610 },
  { username: "dario", puntos: 4130 },
  { username: "noscope_king_2012", puntos: 3890 },
  { username: "rae", puntos: 3520 },
  { username: "usuario_demo", puntos: 3180 },
  { username: "maxi_y_rocky", puntos: 2940 },
  { username: "lucia.voz", puntos: 2710 },
  { username: "sara_p", puntos: 2450 },
  { username: "leo", puntos: 2190 },
  { username: "bea", puntos: 1980 },
  { username: "nico_skate", puntos: 1720 },
  { username: "entrenador_dani", puntos: 1510 },
  { username: "viajera_incansable_2025", puntos: 1290 },
];

/** Las dos vistas del conmutador: `clave` = estado; `etiqueta` = texto de la pestaña. */
export const RANKING_VISTAS = [
  { clave: "mensual", etiqueta: "Mensual" },
  { clave: "reto", etiqueta: "Top 20 del reto" },
] as const;

export type RankingClave = (typeof RANKING_VISTAS)[number]["clave"];

/**
 * Clave de pestaña -> lista a mostrar (PURA). Extraida para atarla con dientes: cada pestaña
 * devuelve SU lista; romper el mapeo (ignorar la clave) cae en rojo.
 */
export function listaRanking(clave: RankingClave): readonly FilaRankVista[] {
  return clave === "reto" ? RANKING_RETO : RANKING_MENSUAL;
}
