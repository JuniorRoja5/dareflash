import type { ReactNode } from "react";

import { NavPortal } from "./nav-portal";
import { protegerPortal } from "./portal-guard";

/**
 * LAYOUT DEL PORTAL DE EMPRESA. Dos trabajos, los dos de "edificio":
 *
 *  1. EL GUARD. Puesto aquí cubre /empresa y todo lo que cuelgue de él, sin que cada página nueva
 *     tenga que acordarse. Es el mismo reparto que el panel: el layout dice quién entra. Y es un guard
 *     de VISTA: la barrera de verdad la pone el servidor en cada endpoint.
 *  2. EL MARCO: la columna del portal y su pestañero (`NavPortal`, de `SECCIONES_PORTAL`). Las
 *     páginas pintan solo su contenido; así una sección nueva entra con el mismo ancho y la misma
 *     navegación que las demás, sin copiar el contenedor.
 */
export default async function LayoutPortal({ children }: { children: ReactNode }) {
  await protegerPortal();
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 lg:px-8 lg:py-12">
      <NavPortal />
      <div className="mt-6">{children}</div>
    </div>
  );
}
