import type { ButtonHTMLAttributes } from "react";

/**
 * PILDORA DE FILTRO — variante SELECCIONABLE (interactiva) de la pildora de categoria. Extension
 * EXPLICITA de `PildoraCategoria` (que es presentacional/neutra): aqui hay un <button> con estado.
 * Mismo lenguaje visual (radius-full, filete 1 px, neutra); el estado ACTIVO es neutro ELEVADO
 * (--df-raised, como el destino activo de la nav), NUNCA magenta. Zona tactil 44 px, foco global.
 */
export function PildoraFiltro({
  activo = false,
  className = "",
  children,
  ...props
}: { activo?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      className={`inline-flex min-h-[44px] shrink-0 items-center whitespace-nowrap rounded-full border px-4 text-sm transition-colors duration-150 ease-mechanical ${
        activo
          ? "border-line bg-raised font-medium text-text"
          : "border-line text-text-dim hover:bg-raised hover:text-text"
      } ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
