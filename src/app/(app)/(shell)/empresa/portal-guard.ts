import "server-only";

import { redirect } from "next/navigation";

/** La raíz del portal. La seguridad no es el nombre (es el guard), pero se centraliza. */
export const PORTAL_PATH = "/empresa";

/**
 * GUARD DEL PORTAL (lo llama el LAYOUT -> cubre todo el subárbol: /empresa y /empresa/alta).
 *
 * Exige solo SESIÓN. El correo verificado —la barrera antifraude de cualquier acción con efectos— lo
 * exige el chokepoint (`empresaDeLaSesion`), y cada pantalla lo CUENTA en vez de rebotar: quien
 * acaba de registrarse y no ha confirmado el correo tiene que leer qué le falta, no aterrizar en
 * la portada sin explicación.
 *
 * Igual que `protegerPanel`, esto es un guard de VISTA: cada endpoint que escriba mantiene el suyo
 * (`mutatingRoute` + `requireVerifiedUser`). Un guard de layout no protege una ruta de la API.
 */
export async function protegerPortal(): Promise<void> {
  const { AuthError, requireUser } = await import("@/server/auth/rbac");
  try {
    await requireUser();
  } catch (e) {
    if (e instanceof AuthError && e.code === "UNAUTHENTICATED") {
      redirect(`/entrar?siguiente=${encodeURIComponent(PORTAL_PATH)}`);
    }
    throw e;
  }
}
