import type { ReactNode } from "react";

import { NavInferiorActiva, NavLateralActiva } from "./nav-activa";

/**
 * ARMAZON compartido (grupo de rutas `(app)`). Monta SOLO el chrome de navegacion, comun a TODAS las
 * pantallas internas: en movil barra inferior fija (safe-area), en escritorio lateral fija; y reserva
 * el hueco de la lateral (`lg:pl-56`). La BARRA SUPERIOR + rejilla ancha de escritorio viven en el
 * grupo `(shell)`, que envuelve las secciones normales; el `/feed` queda FUERA de `(shell)` (layout
 * inmersivo). El hueco de la barra inferior en movil (`pb-24`) lo pone el shell, no aqui: asi el feed
 * (sin shell) es full-bleed sin trucos.
 *
 * noindex: lo cubre la cabecera global `X-Robots-Tag` sobre `/:path*` + `robots.txt`; nada por pagina.
 */
export default function ArmazonLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-full">
      {/* Lateral fija — solo escritorio (>= lg) */}
      <div className="fixed inset-y-0 left-0 z-40 hidden lg:block">
        <NavLateralActiva />
      </div>

      {/* Contenido: solo reserva el hueco de la lateral (lg). El pb-24 de la barra inferior lo pone el shell. */}
      <div className="min-h-full lg:pl-56">{children}</div>

      {/* Barra inferior fija — solo movil; el wrapper pinta el safe-area del mismo color que la barra */}
      <div className="fixed inset-x-0 bottom-0 z-40 bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
        <NavInferiorActiva />
      </div>
    </div>
  );
}
