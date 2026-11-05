import "server-only";

import { redirect } from "next/navigation";

import type { AmbitoEmpresa } from "@/server/auth/empresa-actual";

/**
 * EL ÁMBITO DE UNA PÁGINA DEL PORTAL, resuelto igual en todas. Sale del CHOKEPOINT
 * (`requireEmpresa`) —nunca de la URL— y traduce sus dos negativas a lo que cada pantalla hace:
 *  - sin empresa: es alguien que acaba de llegar -> al alta;
 *  - correo sin confirmar: no es un error, es lo que le falta -> la pantalla lo CUENTA (`null`).
 *
 * La página de Resumen (`/empresa`) lo resolvía en línea; con dos páginas más, una tercera copia del
 * mismo `try` sería la que se quede atrás el día que el chokepoint aprenda otra negativa.
 */
export async function ambitoDelPortal(): Promise<AmbitoEmpresa | null> {
  const { AuthError } = await import("@/server/auth/rbac");
  const { SinEmpresa, requireEmpresa } = await import("@/server/auth/empresa-actual");
  try {
    return await requireEmpresa();
  } catch (e) {
    if (e instanceof SinEmpresa) redirect("/empezar/empresa");
    if (e instanceof AuthError && e.code === "EMAIL_NOT_VERIFIED") return null;
    throw e;
  }
}
