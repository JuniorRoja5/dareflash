import Link from "next/link";
import type { ReactNode } from "react";

import { NAV_DESTINOS } from "./logic";

// Iconos geometricos inline (sin dependencias): trazo de 1.5 px, currentColor, misma familia severa
// del sistema. Uno por destino no central.
const svg = (hijos: ReactNode) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-5 w-5 shrink-0"
    aria-hidden
  >
    {hijos}
  </svg>
);

const ICONO: Record<string, ReactNode> = {
  inicio: svg(
    <>
      <path d="M3 10.5 12 4l9 6.5" />
      <path d="M5.5 9.5V20h13V9.5" />
    </>,
  ),
  retos: svg(<path d="M13 3 5 13.5h5l-1 7.5 8-10.5h-5z" />), // rayo (flash)
  ranking: svg(
    <>
      <rect x="4" y="12" width="4" height="7" />
      <rect x="10" y="6" width="4" height="13" />
      <rect x="16" y="14" width="4" height="5" />
    </>,
  ),
  perfil: svg(
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
    </>,
  ),
};

/**
 * NAVEGACION INFERIOR (movil) — los cinco destinos de `NAV_DESTINOS` en orden. El [+] central es la
 * accion principal: circulo de relleno --df-action con texto negro (--df-void), el UNICO magenta.
 * Cada objetivo mide 44 px. Es presentacional: la posicion fija la pone el layout (Paso C).
 */
export function NavegacionInferior({ activo }: { activo?: string }) {
  return (
    <nav
      aria-label="Principal"
      className="flex items-stretch justify-around border-t border-line bg-surface"
    >
      {NAV_DESTINOS.map((d) =>
        "central" in d && d.central ? (
          <Link
            key={d.clave}
            href={d.href}
            aria-label={d.nombre}
            className="flex min-h-[44px] min-w-[44px] flex-1 items-center justify-center py-2"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-action text-2xl font-bold leading-none text-void">
              +
            </span>
          </Link>
        ) : (
          <Link
            key={d.clave}
            href={d.href}
            aria-current={activo === d.clave ? "page" : undefined}
            className={`flex min-h-[44px] min-w-[44px] flex-1 flex-col items-center justify-center gap-1 py-2 text-2xs ${
              activo === d.clave ? "text-text" : "text-text-dim"
            }`}
          >
            {ICONO[d.clave]}
            <span>{d.nombre}</span>
          </Link>
        ),
      )}
    </nav>
  );
}

/**
 * NAVEGACION LATERAL (escritorio) — los MISMOS cinco destinos, mismo orden y nombres. El [+]
 * central es una fila de accion en --df-action con texto negro (el unico magenta). Cada fila mide
 * 44 px. Presentacional: el layout la fija (Paso C).
 */
export function NavegacionLateral({ activo }: { activo?: string }) {
  return (
    <nav
      aria-label="Principal"
      className="flex h-full w-56 flex-col gap-1 border-r border-line bg-surface p-3"
    >
      <p
        className="mb-4 px-2 pt-2 text-xl leading-none text-text"
        style={{
          fontFamily: "var(--font-display)",
          fontVariationSettings: '"wght" 800, "wdth" 125',
        }}
      >
        DAREFLASH
      </p>
      {NAV_DESTINOS.map((d) =>
        "central" in d && d.central ? (
          <Link
            key={d.clave}
            href={d.href}
            className="mt-1 flex min-h-[44px] items-center gap-3 rounded-sm bg-action px-3 font-semibold text-void transition-[filter] duration-150 ease-mechanical hover:brightness-110"
          >
            <span className="text-xl font-bold leading-none">+</span>
            <span>{d.nombre}</span>
          </Link>
        ) : (
          <Link
            key={d.clave}
            href={d.href}
            aria-current={activo === d.clave ? "page" : undefined}
            className={`flex min-h-[44px] items-center gap-3 rounded-sm px-3 text-sm transition-colors duration-150 ease-mechanical ${
              activo === d.clave
                ? "bg-raised font-medium text-text"
                : "text-text-dim hover:bg-raised hover:text-text"
            }`}
          >
            {ICONO[d.clave]}
            <span>{d.nombre}</span>
          </Link>
        ),
      )}
    </nav>
  );
}
