"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { SECCIONES_PANEL, seccionActiva } from "./secciones";

/**
 * Navegación del panel. En escritorio, barra lateral vertical; en móvil, fila horizontal desplazable.
 * Resalta la sección activa (ruta actual, `seccionActiva`). Reutilizable, sin datos.
 */
export function PanelNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Secciones del panel"
      className="-mx-6 flex gap-1 overflow-x-auto border-b border-line px-6 pb-2 [scrollbar-width:none] lg:mx-0 lg:w-52 lg:shrink-0 lg:flex-col lg:overflow-visible lg:border-b-0 lg:border-r lg:px-0 lg:pr-4 lg:pb-0 [&::-webkit-scrollbar]:hidden"
    >
      {SECCIONES_PANEL.map((s) => {
        const activo = seccionActiva(s.href, pathname);
        return (
          <Link
            key={s.href}
            href={s.href}
            aria-current={activo ? "page" : undefined}
            className={`shrink-0 rounded-sm px-3 py-2 text-sm transition-colors duration-150 ease-mechanical ${
              activo
                ? "bg-raised font-semibold text-text"
                : "text-text-dim hover:bg-raised hover:text-text"
            }`}
          >
            {s.label}
          </Link>
        );
      })}
    </nav>
  );
}
