import type { ReactNode } from "react";

import { protegerPortal } from "./portal-guard";

/**
 * LAYOUT DEL PORTAL DE EMPRESA. Existe por una razón y es el guard: puesto aquí cubre /empresa y
 * todo lo que cuelgue de él (hoy /empresa/alta; mañana lo que traiga P2), sin que cada página nueva
 * tenga que acordarse. Es el mismo reparto que el panel: el layout dice quién entra al edificio.
 *
 * Y es un guard de VISTA. La barrera de verdad la pone el servidor en cada endpoint.
 */
export default async function LayoutPortal({ children }: { children: ReactNode }) {
  await protegerPortal();
  return <>{children}</>;
}
