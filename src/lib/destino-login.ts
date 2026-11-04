/**
 * Destino tras un login CORRECTO — fuente ÚNICA de la decisión (pura, cliente-segura). Lo usa el
 * formulario de login. Reglas:
 *   1. Si hay un `?siguiente` LOCAL válido (ya saneado por `rutaSiguienteSegura`) distinto de la home,
 *      se respeta para CUALQUIER cuenta (el usuario venía a un sitio concreto).
 *   2. Si no lo hay (el saneo devolvió "/"): una cuenta de EMPRESA va a su portal, un ADMIN al panel
 *      y el resto a la home.
 *
 * `siguienteSeguro` es la SALIDA de `rutaSiguienteSegura` (una ruta local o "/"); por eso "/" se trata
 * como "sin siguiente" y decide la cuenta. La protección open-redirect vive en `rutaSiguienteSegura`,
 * no aquí: este helper solo elige entre un destino ya-seguro y el que le toca a cada cuenta.
 *
 * LA EMPRESA ATERRIZA EN SU PORTAL, y no es un detalle de comodidad: es su ÚNICA puerta mientras el
 * shell no tenga navegación propia para ella (P2). Sin esto, una empresa verificada entra en la home
 * del producto en el que no puede hacer nada y tiene que saberse la dirección de memoria.
 */
export const DESTINO_PANEL_ADMIN = "/panel";
export const DESTINO_PORTAL_EMPRESA = "/empresa";

export function destinoTrasLogin(
  role: string,
  siguienteSeguro: string,
  esCuentaEmpresa = false,
): string {
  if (siguienteSeguro !== "/") return siguienteSeguro;
  // La empresa primero: una cuenta de empresa no es ADMIN, pero si algún día lo fuera, su sitio
  // seguiría siendo su portal —el panel no es suyo—.
  if (esCuentaEmpresa) return DESTINO_PORTAL_EMPRESA;
  return role === "ADMIN" ? DESTINO_PANEL_ADMIN : "/";
}
