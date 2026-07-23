import { PHASE_PRODUCTION_BUILD } from "next/constants";

/**
 * Validacion de entorno en el ARRANQUE del servidor. Vive en un modulo aparte
 * (y no en `instrumentation.ts`) porque usa APIs de Node (`process.exit`) que
 * no existen en el runtime Edge: `instrumentation.ts` se compila para los DOS
 * runtimes, y tener aqui `process.exit` hacia que el archivo no compilara para
 * Edge ("Ecmascript file had an error"), aunque el build acabara en verde.
 *
 * Solo se importa desde el camino Node, asi que el bundle de Edge no lo ve.
 */
export async function validateEnvOnStartup(): Promise<void> {
  // SEGURO, no el mecanismo principal. Verificado empiricamente en Next 16.2.11:
  // `register()` NO se ejecuta durante `next build` (y en arranque NEXT_PHASE
  // llega como undefined). Lo que mantiene el build en verde es que Next no
  // invoca instrumentation al compilar, no esta guarda.
  // Se conserva porque es gratis y cubre el caso de que una version futura de
  // Next si ejecute instrumentation durante el build.
  // El test `npm run test:build-sin-env` vigila esa propiedad.
  if (process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD) return;

  const { validateEnv, EnvValidationError } = await import("@/config/env");

  try {
    validateEnv();
  } catch (error) {
    if (error instanceof EnvValidationError) {
      // Morimos a proposito: un proceso vivo con configuracion invalida
      // serviria peticiones mal configuradas, que es peor que no arrancar.
      console.error(`\n[DareFlash] ${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }
}
