"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { SECCIONES_PORTAL, seccionPortalActiva } from "./secciones-portal";

/**
 * EL PESTAÑERO DEL PORTAL. Sale de `SECCIONES_PORTAL` (solo lo que existe). Isla cliente mínima: lo
 * único que necesita del navegador es la ruta, para marcar la activa.
 *
 * Neutro, sin acento: el acento de la pantalla es el CTA principal del cromo. Cada pestaña mide
 * 44 px de alto, el mínimo táctil del brief.
 */
export function NavPortal() {
  const activa = seccionPortalActiva(usePathname());
  return (
    <nav aria-label="Portal de empresa" className="flex gap-1 border-b border-line">
      {SECCIONES_PORTAL.map((s) => {
        const esActiva = activa === s.href;
        return (
          <Link
            key={s.href}
            href={s.href}
            aria-current={esActiva ? "page" : undefined}
            className={`-mb-px flex min-h-[44px] items-center border-b-2 px-3 text-sm transition-colors duration-150 ease-mechanical ${
              esActiva
                ? "border-text font-medium text-text"
                : "border-transparent text-text-dim hover:text-text"
            }`}
          >
            {s.nombre}
          </Link>
        );
      })}
    </nav>
  );
}
