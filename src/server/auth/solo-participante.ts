import "server-only";

import { redirect } from "next/navigation";

/**
 * LAS PANTALLAS DE PARTICIPANTE NO SE LE ENSEÑAN A UNA EMPRESA (Fase 9, P2).
 *
 * ┌─ EL FALLO QUE CIERRA ─────────────────────────────────────────────────────────────────────────┐
 * │ Una cuenta de empresa no participa: `mutatingRoute` le cierra subir, votar, comprar Boost,     │
 * │ suscribirse o cobrar. Pero las PANTALLAS seguían abiertas: entrando por URL o por un enlace    │
 * │ viejo llegaba a "Subir tu vídeo", a sus puntos o al VIP, con un botón principal que el         │
 * │ servidor le iba a negar. La pantalla prometía lo que el servidor sabía que no.                 │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Se llama al PRINCIPIO de cada página de participante y, si la sesión es de empresa, la manda a SU
 * sitio. No es la seguridad —esa sigue en cada endpoint—; es que la pantalla no mienta. Un test
 * estructural (`empresa-shell`) censa las páginas de `(app)`: cada una está clasificada como de
 * participante (y entonces llama a esto) o compartida, y una página nueva sin clasificar es rojo.
 *
 * `destino`: el portal por defecto; la edición del perfil manda a la CUENTA, que es lo que quien la
 * abre venía a buscar (correo y contraseña).
 */
export async function apartarCuentaEmpresa(
  destino: "/empresa" | "/empresa/cuenta" = "/empresa",
): Promise<void> {
  const { getCurrentUser } = await import("@/server/auth/current-user");
  const sesion = await getCurrentUser();
  if (sesion?.esCuentaEmpresa) redirect(destino);
}
