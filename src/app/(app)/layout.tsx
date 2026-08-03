import type { ReactNode } from "react";

import { NavInferiorActiva, NavLateralActiva } from "./nav-activa";

/**
 * ARMAZON de la app (grupo de rutas `(app)`). Monta la navegacion de forma RESPONSIVE sobre las
 * pantallas internas: en movil, barra inferior fija (respeta el safe-area); en escritorio, lateral
 * fija. Reutiliza las primitivas del Paso B (no las redibuja); solo las posiciona y les pasa el
 * destino activo (via las islas cliente de `nav-activa`).
 *
 * Lo que NO entra aqui: la landing (/) y las paginas de auth (/verify, login futuro) viven FUERA
 * de este grupo y por tanto SIN barra. noindex: lo cubre la cabecera global `X-Robots-Tag` sobre
 * `/:path*` + `robots.txt`; no se añade nada por pagina.
 */
export default function ArmazonLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-full">
      {/* Lateral fija — solo escritorio (>= lg) */}
      <div className="fixed inset-y-0 left-0 z-40 hidden lg:block">
        <NavLateralActiva />
      </div>

      {/* Contenido: deja hueco para la lateral (lg) y para la barra inferior (movil) */}
      <div className="min-h-full pb-24 lg:pb-0 lg:pl-56">{children}</div>

      {/* Barra inferior fija — solo movil; el wrapper pinta el safe-area del mismo color que la barra */}
      <div className="fixed inset-x-0 bottom-0 z-40 bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
        <NavInferiorActiva />
      </div>
    </div>
  );
}
