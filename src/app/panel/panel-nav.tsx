"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ICONO_SECCION } from "./panel-iconos";
import { SECCIONES_PANEL, seccionActiva } from "./secciones";

/**
 * Navegación del panel. Barra lateral persistente en escritorio (icono + etiqueta, columna vertical);
 * en móvil, fila horizontal desplazable dentro del área. Resalta la sección activa (`seccionActiva`) sin
 * usar magenta —reservado a la ACCIÓN principal de cada pantalla—: el activo es fondo elevado + texto
 * pleno + una barra fina a la izquierda. Reutilizable, sin datos.
 */
export function PanelNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Secciones del panel"
      className="flex gap-1 overflow-x-auto border-b border-line px-5 py-2 [scrollbar-width:none] lg:flex-col lg:overflow-visible lg:border-b-0 lg:px-3 lg:py-4 [&::-webkit-scrollbar]:hidden"
    >
      {SECCIONES_PANEL.map((s) => {
        const activo = seccionActiva(s.href, pathname);
        const Icono = ICONO_SECCION[s.href];
        return (
          <Link
            key={s.href}
            href={s.href}
            aria-current={activo ? "page" : undefined}
            className={`group flex shrink-0 items-center gap-2.5 rounded-sm border-l-2 px-3 py-2 text-sm transition-colors duration-150 ease-mechanical ${
              activo
                ? "border-text bg-raised font-semibold text-text"
                : "border-transparent text-text-dim hover:bg-raised/60 hover:text-text"
            }`}
          >
            {Icono ? (
              <Icono
                className={`shrink-0 ${activo ? "text-text" : "text-text-dim group-hover:text-text"}`}
              />
            ) : null}
            <span className="whitespace-nowrap">{s.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
