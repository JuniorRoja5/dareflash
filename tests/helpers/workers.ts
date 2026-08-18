/**
 * Nº de BDs de test aisladas, UNA por worker de vitest. DEBE coincidir con `maxForks` en
 * vitest.config.ts: el globalSetup crea `dareflash_test_1..N` y cada fork usa la suya según su
 * `VITEST_POOL_ID` (1..N). Aislar por worker elimina la contaminación cruzada de la BD compartida y
 * permite reactivar el paralelismo. 4 = nº de CPUs del entorno objetivo.
 */
export const NUM_WORKER_DBS = 4;
