/**
 * `/style-guide` es una referencia INTERNA de diseño, no una pantalla de producto. Es DEV-ONLY por
 * construccion: solo debe existir en desarrollo. Este predicado (puro y testeable) decide si la
 * ruta debe OCULTARSE (404). El Dockerfile hornea `NODE_ENV=production`, asi que en produccion
 * devuelve 404 sin depender de que nadie se acuerde de retirarla.
 *
 * Fail-secure: cualquier valor que NO sea exactamente "development" oculta la ruta (undefined,
 * "test", "production"...). El caso abierto es el estricto, no el laxo.
 */
export function styleGuideHidden(nodeEnv: string | undefined): boolean {
  return nodeEnv !== "development";
}
