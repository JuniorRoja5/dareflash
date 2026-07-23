/**
 * `register()` se ejecuta UNA vez al iniciar una instancia del servidor Next y
 * debe completarse antes de que el servidor acepte peticiones. Es el sitio
 * correcto para el fail-fast de configuracion.
 *
 * OJO: este archivo se compila para los DOS runtimes de Next (Node y Edge).
 * Por eso aqui no puede aparecer ninguna API de Node: la logica que las usa
 * vive en `@/config/startup`, que solo se importa en el camino Node.
 * `NEXT_RUNTIME` es una variable documentada de Next.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { validateEnvOnStartup } = await import("@/config/startup");
  await validateEnvOnStartup();
}
