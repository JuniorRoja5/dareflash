/**
 * TOPRANKING · datos de VISTA y logica pura (Paso C · unidad 4). Maqueta: NO es el modelo de datos.
 * Dos listas mock (mensual + del reto en curso) y `listaRanking` para el conmutador. Los puntos van
 * en NEUTRO (no son dinero): la primitiva `FilaPuesto` ya garantiza oro solo en 1/2/3 y puntos sin
 * lima. `usuario_demo` aparece en media tabla en ambas para demostrar el resaltado (`activo`).
 */

import { USUARIO_DEMO } from "@/lib/usuario-demo";

/**
 * Forma de fila del ranking. `puntos` = la puntuacion que se MUESTRA en esta vista (globales en
 * Mensual; votos del reto en Top 20). `puntosGlobales` = los puntos ACUMULADOS del usuario, que
 * mueven su NIVEL: la insignia se deriva SIEMPRE de estos (no de `puntos`), asi el nivel es coherente
 * en las dos vistas. En Mensual coinciden; en Top 20 no (el nivel es global, el standing es del reto).
 */
export type FilaRankVista = { username: string; puntos: number; puntosGlobales: number };

/** El usuario actual de la maqueta (el mismo del Perfil, fuente unica): se resalta su fila. */
export const USUARIO_ACTUAL = USUARIO_DEMO.username;

/** Los puntos que determinan el NIVEL de una fila: SIEMPRE los globales, nunca los de la vista.
 *  Extraida para atarla con dientes: derivar el nivel de `puntos` (la vista) cae en rojo. */
export function puntosNivel(fila: FilaRankVista): number {
  return fila.puntosGlobales;
}

/**
 * Clasificacion mensual (puntos acumulados del mes). Ordenada de mayor a menor. Los puntos estan
 * repartidos para que los NIVELES varien (Legend -> Elite -> Pro -> Challenger -> Rookie) y se vean
 * las insignias; es maqueta (los valores no son datos reales). `usuario_demo` va en el puesto 9 para
 * demostrar el resaltado de "Tu".
 */
export const RANKING_MENSUAL: readonly FilaRankVista[] = [
  { username: "lucia.voz", puntos: 14200, puntosGlobales: 14200 }, // Legend
  { username: "noscope_king_2012", puntos: 8600, puntosGlobales: 8600 }, // Elite
  { username: "cocina_express_maria", puntos: 5400, puntosGlobales: 5400 }, // Elite
  { username: "carlos_fit", puntos: 3100, puntosGlobales: 3100 }, // Elite
  { username: "dario", puntos: 1850, puntosGlobales: 1850 }, // Pro
  { username: "maxi_y_rocky", puntos: 1200, puntosGlobales: 1200 }, // Pro
  { username: "laia10", puntos: 780, puntosGlobales: 780 }, // Pro
  { username: "sara_p", puntos: 540, puntosGlobales: 540 }, // Pro
  // usuario_demo: fuente unica (Mensual muestra los globales) -> Challenger, puesto 9 (Tu)
  {
    username: USUARIO_DEMO.username,
    puntos: USUARIO_DEMO.puntos,
    puntosGlobales: USUARIO_DEMO.puntos,
  },
  { username: "entrenador_dani", puntos: 210, puntosGlobales: 210 }, // Challenger
  { username: "rae", puntos: 140, puntosGlobales: 140 }, // Challenger
  { username: "viajera_incansable_2025", puntos: 95, puntosGlobales: 95 }, // Rookie
  { username: "leo", puntos: 60, puntosGlobales: 60 }, // Rookie
  { username: "bea", puntos: 30, puntosGlobales: 30 }, // Rookie
  { username: "nico_skate", puntos: 10, puntosGlobales: 10 }, // Rookie
];

/**
 * Clasificacion del reto en curso (VOTOS de ESTE reto). Otro orden y otros valores. `puntos` = votos
 * del reto (lo que se muestra); `puntosGlobales` = los puntos acumulados del usuario (mueven el
 * NIVEL, igual que en Mensual). Por eso el standing del reto y el nivel se desacoplan: p. ej. `rae`
 * es 6a por votos pero globalmente Challenger, y `lucia.voz` es 9a por votos pero Legend.
 */
export const RANKING_RETO: readonly FilaRankVista[] = [
  { username: "carlos_fit", puntos: 5240, puntosGlobales: 3100 }, // Elite
  { username: "cocina_express_maria", puntos: 4980, puntosGlobales: 5400 }, // Elite
  { username: "laia10", puntos: 4610, puntosGlobales: 780 }, // Pro
  { username: "dario", puntos: 4130, puntosGlobales: 1850 }, // Pro
  { username: "noscope_king_2012", puntos: 3890, puntosGlobales: 8600 }, // Elite
  { username: "rae", puntos: 3520, puntosGlobales: 140 }, // Challenger
  // usuario_demo: fuente unica para el nivel (Challenger), aunque su standing del reto sea alto
  { username: USUARIO_DEMO.username, puntos: 3180, puntosGlobales: USUARIO_DEMO.puntos },
  { username: "maxi_y_rocky", puntos: 2940, puntosGlobales: 1200 }, // Pro
  { username: "lucia.voz", puntos: 2710, puntosGlobales: 14200 }, // Legend
  { username: "sara_p", puntos: 2450, puntosGlobales: 540 }, // Pro
  { username: "leo", puntos: 2190, puntosGlobales: 60 }, // Rookie
  { username: "bea", puntos: 1980, puntosGlobales: 30 }, // Rookie
  { username: "nico_skate", puntos: 1720, puntosGlobales: 10 }, // Rookie
  { username: "entrenador_dani", puntos: 1510, puntosGlobales: 210 }, // Challenger
  { username: "viajera_incansable_2025", puntos: 1290, puntosGlobales: 95 }, // Rookie
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

/** Token de medalla del podio por puesto. */
export type Medalla = "rank" | "silver" | "bronze";

/**
 * Medalla (token de color) por PUESTO del podio (PURO). Regla de marca: 1 -> oro (`rank`), 2 -> plata
 * (`silver`), 3 -> bronce (`bronze`); fuera del podio -> null (no llevan medalla). El oro se reserva
 * al 1; plata SOLO al 2; bronce SOLO al 3. Extraida para atarla con dientes: cambiar el mapeo
 * (p. ej. 2 -> rank) cae en rojo.
 */
export function medallaPuesto(puesto: number): Medalla | null {
  if (puesto === 1) return "rank";
  if (puesto === 2) return "silver";
  if (puesto === 3) return "bronze";
  return null;
}

/**
 * Orden VISUAL del podio (PURO): recibe el top-3 en orden de ranking [1, 2, 3] y lo coloca como
 * [2, 1, 3] — 2 a la izquierda, 1 al centro (alto), 3 a la derecha. Extraida para atarla con dientes:
 * devolver [1, 2, 3] (o cualquier otro orden) cae en rojo.
 */
export function ordenPodio<A, B, C>(top3: readonly [A, B, C]): [B, A, C] {
  return [top3[1], top3[0], top3[2]];
}

/**
 * Pagina PURA: la porcion de `lista` en la pagina `pagina` (base 1) con `tamano` elementos. Fuera de
 * rango -> lista vacia. Extraida para atarla con dientes: devolver la pagina equivocada cae en rojo.
 */
export function paginar<T>(lista: readonly T[], pagina: number, tamano: number): T[] {
  const inicio = (pagina - 1) * tamano;
  return lista.slice(inicio, inicio + tamano);
}
