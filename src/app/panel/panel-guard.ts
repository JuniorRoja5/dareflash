import "server-only";

import { redirect } from "next/navigation";

import { AuthError, requireRole } from "@/server/auth/rbac";
import type { SessionUser } from "@/server/auth/session";

/** Segmento del panel de admin. La SEGURIDAD no es el nombre (es `requireRole`), pero se centraliza. */
export const PANEL_PATH = "/panel";

/**
 * GUARD del panel de admin (punto ÚNICO; lo llama el layout del panel -> protege TODO el subárbol).
 * Exige ADMIN verificado vía `requireRole("ADMIN")`:
 *   - UNAUTHENTICATED -> a login, con vuelta al panel tras entrar.
 *   - FORBIDDEN / no verificado -> a "/", SIN revelar que el panel existe (no 404 ni mensaje de admin).
 * Devuelve el `SessionUser` admin si pasa. `redirect()` de Next lanza (tipo `never`), así que tras el
 * try/catch el admin está garantizado.
 *
 * NOTA para el siguiente mensaje: este guard protege la VISTA. Cada endpoint que ESCRIBA (crear reto…)
 * debe volver a llamar `requireRole("ADMIN")` por su cuenta; el layout no protege los writes.
 */
export async function protegerPanel(): Promise<SessionUser> {
  try {
    return await requireRole("ADMIN");
  } catch (e) {
    if (e instanceof AuthError && e.code === "UNAUTHENTICATED") {
      redirect(`/entrar?siguiente=${encodeURIComponent(PANEL_PATH)}`);
    }
    redirect("/");
  }
}
