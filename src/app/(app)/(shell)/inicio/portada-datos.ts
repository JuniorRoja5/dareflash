import { CATEGORIES } from "@/config/constants";

import { retosDestacados, RETOS_SEED } from "../retos/retos-datos";

/**
 * Seleccion APLICADA a la portada. HERO = el reto de MAYOR PREMIO activo (regla COMPUTABLE placeholder;
 * la regla final la decide Sergio) — Challenge, no persona. El resto de los mas votados va al muro. Es
 * maqueta (reusa `RETOS_SEED`). El split evita repetir el reto del hero en el muro.
 */
export const RETO_HERO = [...RETOS_SEED].sort((a, b) => b.premioCents - a.premioCents)[0]!;
export const RETOS_REJILLA = retosDestacados(RETOS_SEED, 6).filter((r) => r.id !== RETO_HERO.id);

/**
 * PERFILES DESTACADOS (Boost) — maqueta de `BoostActivation` (Fase 6, Stripe): perfiles PAGADOS por
 * posicion (1..N). Son usuarios DISTINTOS del Top Ranking a proposito: el Boost es visibilidad
 * comprada (cualquiera paga por aparecer). El nivel se DERIVA de `puntos` con `nivelPorPuntos`.
 */
export const PERFILES_BOOST = [
  { username: "sara_p", puntos: 540 },
  { username: "laia10", puntos: 780 },
  { username: "rae", puntos: 140 },
  { username: "nico_skate", puntos: 10 },
  { username: "bea", puntos: 30 },
] as const;

/**
 * STATS del hero — agregados reales del producto (en produccion: consultas). Aqui `categorias` es
 * REAL (las 14 de `CATEGORIES`); `premiosActivosCents` (SUM de premios de Challenges activos) y
 * `retosAbiertos` (COUNT de Challenges abiertos) van con valores de maqueta representativos.
 */
export const STATS_INICIO = {
  categorias: CATEGORIES.length,
  premiosActivosCents: 840000,
  retosAbiertos: 2310,
} as const;
