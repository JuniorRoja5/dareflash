import type { ReactNode } from "react";

import { Tarjeta } from "./tarjeta";

/**
 * PIEZAS DE UN FORMULARIO LARGO (fase9-diseno). Nacieron en el alta de empresa y las usa también
 * «Proponer un reto»: dos formularios con la misma maqueta no se escriben dos veces.
 */

/**
 * UN BLOQUE: un `fieldset` con su título, dentro de una tarjeta. Los campos van en una rejilla de dos
 * columnas desde `sm`; el que necesita todo el ancho lo pide con `sm:col-span-2`. Así los cortos (país,
 * ciudad, fechas) van de dos en dos y cada campo mide lo que su contenido.
 */
export function BloqueFormulario({
  titulo,
  descripcion,
  children,
}: {
  titulo: string;
  descripcion?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Tarjeta className="p-5 lg:p-6">
      <fieldset>
        <legend className="text-base font-semibold text-text">{titulo}</legend>
        {descripcion ? <p className="mt-1 text-sm text-text-dim">{descripcion}</p> : null}
        <div className="mt-4 grid gap-4 sm:grid-cols-2">{children}</div>
      </fieldset>
    </Tarjeta>
  );
}

/**
 * LA ACCIÓN DE ENVIAR, A MANO. En móvil y tableta se PEGA encima de la barra inferior (3.9rem + el
 * safe-area: la altura de `NavegacionInferior`, medida); en escritorio, donde no hay barra inferior,
 * vuelve a su sitio al final del formulario. El fondo opaco evita que se lea el texto de debajo.
 *
 * `children` es el botón; `nota` lo que se dice al lado (un error, o qué falta: un botón apagado sin
 * explicación parece roto).
 */
export function BarraEnviar({ children, nota }: { children: ReactNode; nota?: ReactNode }) {
  return (
    <div className="sticky bottom-[calc(3.9rem+env(safe-area-inset-bottom))] z-20 -mx-4 border-t border-line bg-void/95 px-4 py-3 backdrop-blur-md sm:mx-0 sm:rounded-sm sm:border lg:static lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        {children}
        {nota}
      </div>
    </div>
  );
}
