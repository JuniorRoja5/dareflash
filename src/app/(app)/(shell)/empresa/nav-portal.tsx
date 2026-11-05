"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { SECCIONES_PORTAL, seccionPortalActiva } from "./secciones-portal";

/**
 * LA NAVEGACIÓN DEL PORTAL. Sale de `SECCIONES_PORTAL` (solo lo que existe). Isla cliente mínima: lo
 * único que necesita del navegador es la ruta, para marcar la activa.
 *
 * DOS FORMAS, UNA LISTA: en móvil, pestañas en fila con su subrayado (desplazables si un día no
 * caben); en escritorio, una columna lateral pegada al hacer scroll, con el mismo lenguaje que la
 * barra del panel (fondo elevado + barra fina a la izquierda en la activa).
 *
 * Neutro, sin acento: el acento de la pantalla es el CTA principal del cromo. Cada entrada mide
 * 44 px de alto, el mínimo táctil del brief.
 */
export function NavPortal() {
  const activa = seccionPortalActiva(usePathname());
  return (
    <nav
      aria-label="Portal de empresa"
      className="-mx-4 flex gap-1 overflow-x-auto border-b border-line px-4 [scrollbar-width:none] lg:sticky lg:top-24 lg:mx-0 lg:flex-col lg:overflow-visible lg:border-b-0 lg:px-0 [&::-webkit-scrollbar]:hidden"
    >
      {SECCIONES_PORTAL.map((s) => {
        const esActiva = activa === s.href;
        return (
          <Link
            key={s.href}
            href={s.href}
            aria-current={esActiva ? "page" : undefined}
            className={`-mb-px flex min-h-[44px] shrink-0 items-center border-b-2 px-3 text-sm whitespace-nowrap transition-colors duration-150 ease-mechanical lg:mb-0 lg:rounded-sm lg:border-b-0 lg:border-l-2 ${
              esActiva
                ? "border-text font-medium text-text lg:bg-raised"
                : "border-transparent text-text-dim hover:text-text lg:hover:bg-raised/60"
            }`}
          >
            {s.nombre}
          </Link>
        );
      })}
    </nav>
  );
}
