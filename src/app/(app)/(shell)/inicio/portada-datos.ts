import { retosDestacados, RETOS_SEED } from "../retos/retos-datos";

/**
 * Seleccion APLICADA a la portada: los 5 retos mas votados (via `retosDestacados`, pura y testeada).
 * El 1o va al HERO (marcador grande = firma); el resto, a la rejilla de destacados. El split evita
 * repetir el mismo reto en el hero y en la rejilla. Es maqueta (reusa `RETOS_SEED` tal cual).
 */
const TOP = retosDestacados(RETOS_SEED, 5);

export const RETO_HERO = TOP[0]!;
export const RETOS_REJILLA = TOP.slice(1);
