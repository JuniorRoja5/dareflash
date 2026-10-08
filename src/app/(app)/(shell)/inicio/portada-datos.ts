import { CATEGORIES } from "@/config/constants";

import { retosDestacados, RETOS_SEED } from "../retos/retos-datos";

/**
 * Seleccion APLICADA a la portada. HERO = el reto de MAYOR PREMIO activo (regla COMPUTABLE placeholder;
 * la regla final la decide Sergio) — Challenge, no persona. El resto de los mas votados va al muro. Es
 * maqueta (reusa `RETOS_SEED`). El split evita repetir el reto del hero en el muro.
 */
export const RETO_HERO = [...RETOS_SEED].sort((a, b) => b.premioCents - a.premioCents)[0]!;
export const RETOS_REJILLA = retosDestacados(RETOS_SEED, 6).filter((r) => r.id !== RETO_HERO.id);

/*
 * AQUI VIVIA `PERFILES_BOOST`: cinco usuarios inventados que la portada pintaba como perfiles
 * destacados, en produccion. Se fue al construir la activacion de Boost (Fase 6, Pieza 3): ahora la
 * fila la sirve `destacadosVigentes` con las `BoostActivation` reales, y cuando no hay ninguna la
 * portada lo dice en vez de rellenar el hueco. `sin-datos-maqueta` vigila el nombre para que no
 * vuelva.
 */

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
