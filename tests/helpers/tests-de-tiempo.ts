/**
 * LOS TESTS QUE MIDEN TIEMPO CORREN SOLOS (Fase 11 · PTA2).
 *
 * Un test que mide cuánto tarda algo mide también lo que está haciendo la máquina a la vez. Los dos de
 * argon2 (`excesoDelHash`, en `tiempo-argon2.ts`) comparan dos caminos contra `H/2`, y en el proyecto
 * general compartían la CPU con otros tres workers: medido, el peor caso sano pasaba de 0,19·(H/2) solos
 * a 0,34·(H/2) en la suite. Lejos de 1, pero ese margen se come con cada test que entra en la suite.
 *
 * Así que van en su PROPIO proyecto de vitest (`tiempo`, en `vitest.config.ts`): un solo worker, su propia
 * BD (`<base>_tiempo`) y `groupOrder` detrás de todos, de modo que empiezan cuando lo demás ya terminó.
 * El proyecto general los EXCLUYE: no corren dos veces ni en paralelo. `npx vitest run` (lo que corre
 * el CI, en sus dos jobs) ejecuta los tres proyectos.
 *
 * Esta lista es la ÚNICA fuente: la leen los dos proyectos. Un fichero nuevo que importe
 * `tests/helpers/tiempo-argon2` tiene que estar aquí; si no, `tests-de-tiempo-aislados` se pone rojo y
 * lo nombra.
 */
export const TESTS_DE_TIEMPO = [
  "tests/registration.test.ts",
  "tests/registro-cuenta-existente.test.ts",
] as const;

/**
 * El sufijo de la BD del proyecto `tiempo`. Lo pasa el proyecto a sus workers en `BD_TEST_SUFIJO`
 * (ver `nombreBdWorker`); a propósito NO empieza por `TEST_`, que es el prefijo que se carga del `.env`.
 */
export const SUFIJO_BD_TIEMPO = "tiempo";
