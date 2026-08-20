/**
 * Destino tras un login CORRECTO — fuente ÚNICA de la decisión (pura, cliente-segura). Lo usa el
 * formulario de login. Reglas:
 *   1. Si hay un `?siguiente` LOCAL válido (ya saneado por `rutaSiguienteSegura`) distinto de la home,
 *      se respeta para CUALQUIER rol (el usuario venía a un sitio concreto).
 *   2. Si no lo hay (el saneo devolvió "/"), por rol: ADMIN -> panel de admin; el resto -> home.
 *
 * `siguienteSeguro` es la SALIDA de `rutaSiguienteSegura` (una ruta local o "/"); por eso "/" se trata
 * como "sin siguiente" y decide el rol. La protección open-redirect vive en `rutaSiguienteSegura`, no
 * aquí: este helper solo elige entre un destino ya-seguro y el destino por rol.
 */
export const DESTINO_PANEL_ADMIN = "/panel";

export function destinoTrasLogin(role: string, siguienteSeguro: string): string {
  if (siguienteSeguro !== "/") return siguienteSeguro;
  return role === "ADMIN" ? DESTINO_PANEL_ADMIN : "/";
}
