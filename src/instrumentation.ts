import { PHASE_PRODUCTION_BUILD } from "next/constants";

/**
 * `register()` se ejecuta UNA vez al iniciar una instancia del servidor Next y
 * debe completarse antes de que el servidor acepte peticiones. Es el sitio
 * correcto para el fail-fast de configuracion: si falta una variable
 * obligatoria, el servidor no llega a levantarse.
 *
 * Importante: NO se valida durante `next build`. Hostinger compila sin ninguna
 * variable de entorno configurada, y tumbar el build seria un falso positivo:
 * el criterio es que la app no *arranque*, no que no *compile*.
 */
export async function register() {
  // El runtime Edge no tiene acceso al entorno del servidor de la misma forma.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Fase de compilacion: no validamos.
  if (process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD) return;

  const { validateEnv, EnvValidationError } = await import("@/config/env");

  try {
    validateEnv();
  } catch (error) {
    if (error instanceof EnvValidationError) {
      // Mensaje limpio y accionable, sin stack trace ruidoso.
      console.error(`\n[DareFlash] ${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }
}
