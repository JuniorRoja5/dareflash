import type { ReactNode } from "react";

import { NavPortal } from "./nav-portal";
import { protegerPortal } from "./portal-guard";

/**
 * LAYOUT DEL PORTAL DE EMPRESA. Dos trabajos, los dos de "edificio":
 *
 *  1. EL GUARD. Puesto aquí cubre /empresa y todo lo que cuelgue de él, sin que cada página nueva
 *     tenga que acordarse. Es el mismo reparto que el panel: el layout dice quién entra. Y es un guard
 *     de VISTA: la barrera de verdad la pone el servidor en cada endpoint.
 *  2. EL MARCO: la navegación del portal (`NavPortal`, de `SECCIONES_PORTAL`) y el ancho. Las páginas
 *     pintan solo su contenido; así una sección nueva entra con el mismo ancho y la misma navegación
 *     que las demás, sin copiar el contenedor.
 *
 * EN ESCRITORIO, NAVEGACIÓN LATERAL Y EL RESTO DEL ANCHO PARA EL CONTENIDO (fase9-diseno): antes era
 * una columna de 768 px con pestañas encima, perdida en una pantalla de 1440. En móvil, las pestañas
 * de siempre, arriba y desplazables.
 */
export default async function LayoutPortal({ children }: { children: ReactNode }) {
  await protegerPortal();
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 lg:grid lg:grid-cols-[11rem_minmax(0,1fr)] lg:items-start lg:gap-10 lg:px-8 lg:py-12">
      <NavPortal />
      <div className="mt-6 min-w-0 lg:mt-0">{children}</div>
    </div>
  );
}
