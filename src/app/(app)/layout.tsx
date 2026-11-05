import type { ReactNode } from "react";

import { ProveedorAvisos } from "./avisos-contexto";
import { NavInferiorActiva, NavLateralActiva } from "./nav-activa";

/**
 * ARMAZON compartido (grupo de rutas `(app)`). Monta SOLO el chrome de navegacion, comun a TODAS las
 * pantallas internas: en movil barra inferior fija (safe-area), en escritorio lateral fija; y reserva
 * el hueco de la lateral (`lg:pl-56`). La BARRA SUPERIOR + rejilla ancha de escritorio viven en el
 * grupo `(shell)`, que envuelve las secciones normales; el `/feed` queda FUERA de `(shell)` (layout
 * inmersivo). El hueco de la barra inferior en movil (`pb-24`) lo pone el shell, no aqui: asi el feed
 * (sin shell) es full-bleed sin trucos.
 *
 * Lee el ROL de la sesion porque decide el [+] de la barra inferior (el CTA principal, ver
 * `ctaPrincipal`), y las no-leidas para SEMBRAR el contador compartido de avisos (`ProveedorAvisos`),
 * que envuelve todo: la campana del shell y el icono de Perfil de la barra inferior leen el MISMO
 * estado, y ese estado se refresca solo en el cliente. `getCurrentUser` y `noLeidasDeSesion` estan
 * memoizados por peticion. Se lee DENTRO de la funcion (ambito de peticion), nunca al importar.
 *
 * noindex: lo cubre la cabecera global `X-Robots-Tag` sobre `/:path*` + `robots.txt`; nada por pagina.
 */
export default async function ArmazonLayout({ children }: { children: ReactNode }) {
  const { getCurrentUser } = await import("@/server/auth/current-user");
  const rol = (await getCurrentUser())?.role ?? null;
  // La MISMA sesión (memoizada por petición): una cuenta de EMPRESA lleva su propia nav y su CTA.
  const esCuentaEmpresa = (await getCurrentUser())?.esCuentaEmpresa ?? false;
  // SIN AVISOS PARA UNA EMPRESA: ninguno de sus tipos la tiene como destinataria (participación,
  // premios, puntos) y los anuncios la excluyen de su audiencia. Así que no se cuenta ni se sondea:
  // un contador que nunca puede subir es una consulta cada minuto para nada.
  const conAvisos = rol !== null && !esCuentaEmpresa;
  const { noLeidasDeSesion } = await import("@/server/services/notificaciones-sesion");
  const noLeidas = conAvisos ? await noLeidasDeSesion() : 0;

  return (
    <ProveedorAvisos inicial={noLeidas} activo={conAvisos}>
      <div className="min-h-full">
        {/* Lateral fija — solo escritorio (>= lg) */}
        <div className="fixed inset-y-0 left-0 z-40 hidden lg:block">
          <NavLateralActiva esCuentaEmpresa={esCuentaEmpresa} />
        </div>

        {/* Contenido: solo reserva el hueco de la lateral (lg). El pb-24 de la barra inferior lo pone el shell. */}
        <div className="min-h-full lg:pl-56">{children}</div>

        {/* Barra inferior fija — solo movil; el wrapper pinta el safe-area del mismo color que la barra */}
        <div className="fixed inset-x-0 bottom-0 z-40 bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
          <NavInferiorActiva rol={rol} esCuentaEmpresa={esCuentaEmpresa} />
        </div>
      </div>
    </ProveedorAvisos>
  );
}
