/**
 * globalSetup del proyecto `tiempo` (Fase 11 · PTA2): SU base de datos, `<base>_tiempo`, recreada y
 * migrada como las de los workers (`provisionarBds`). Es suya y solo suya: el proyecto corre con un solo
 * worker y DESPUÉS de los demás, pero así no depende de que otro proyecto haya preparado nada, y
 * `npx vitest run --project tiempo` funciona solo. El sufijo lo fija el proyecto (`BD_TEST_SUFIJO`, ver
 * `vitest.config.ts` y `nombreBdWorker`).
 */
import { nombreBdBase } from "./helpers/db";
import { SUFIJO_BD_TIEMPO } from "./helpers/tests-de-tiempo";
import { provisionarBds } from "./global-setup";

export default async function setup(): Promise<void> {
  await provisionarBds([`${nombreBdBase()}_${SUFIJO_BD_TIEMPO}`]);
}
