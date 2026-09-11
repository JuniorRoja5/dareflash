import Link from "next/link";
import type { ReactNode } from "react";

import { NOTIF_NO_LEIDAS_TOPE } from "@/config/constants";
import { ctaPrincipal } from "@/lib/cta-principal";
import { textoBadge } from "@/lib/notificaciones";

import { destinosDe, NAV_ESCRITORIO, NAV_MOVIL } from "./logic";

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
  feed: svg(
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M10.5 9.5l4 2.5-4 2.5z" />
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
 * NAVEGACION INFERIOR (movil) — los cinco destinos de `NAV_MOVIL` en orden (Feed es el home del
 * movil). El [+] central es el CTA PRINCIPAL, por ROL y de la MISMA fuente que el de la barra de
 * escritorio y el hero (`ctaPrincipal`): "Subir vídeo" a /crear para el no-admin, "Crear reto" al panel
 * para el admin. Antes decia "Crear" e iba a /crear para todos: un tercer sitio con su propio texto.
 * Circulo de relleno --df-action con texto negro (--df-void), el UNICO magenta. Cada objetivo mide
 * 44 px. Presentacional: la posicion fija la pone el layout, y el rol se lo pasa quien la monta.
 *
 * AVISOS en movil: no hay campana (no hay barra superior). Los avisos se leen desde /perfil, y por eso
 * el icono de PERFIL lleva el numero de no-leidas, NEUTRO como todo recuento y con el mismo tope
 * ("99+") que la campana de escritorio.
 */
export function NavegacionInferior({
  activo,
  rol,
  noLeidas = 0,
}: {
  activo?: string;
  rol: string | null;
  /** Avisos sin leer del usuario de la sesión (0 = sin número). */
  noLeidas?: number;
}) {
  const cta = ctaPrincipal(rol);
  const badgePerfil = textoBadge(noLeidas, NOTIF_NO_LEIDAS_TOPE);
  return (
    <nav
      aria-label="Principal"
      className="flex items-stretch justify-around border-t border-line bg-surface"
    >
      {destinosDe(NAV_MOVIL).map((d) =>
        "central" in d && d.central ? (
          <Link
            key={d.clave}
            href={cta.href}
            aria-label={cta.texto}
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
            <span className="relative">
              {ICONO[d.clave]}
              {d.clave === "perfil" && badgePerfil ? (
                <span className="absolute -top-1.5 -right-2.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-text-dim px-1 text-2xs font-semibold tabular-nums text-void">
                  {badgePerfil}
                </span>
              ) : null}
            </span>
            <span>
              {d.nombre}
              {d.clave === "perfil" && badgePerfil ? (
                <span className="sr-only"> ({badgePerfil} avisos sin leer)</span>
              ) : null}
            </span>
          </Link>
        ),
      )}
    </nav>
  );
}

/**
 * NAVEGACION LATERAL (escritorio) — los destinos de `NAV_ESCRITORIO` (Inicio, Feed, Retos, Ranking,
 * Perfil). El CTA principal NO va aqui: es el boton magenta de la barra superior (el unico magenta).
 * Sin [+]. Cada fila mide 44 px; activo = neutro elevado. Presentacional: el layout la fija.
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
      {destinosDe(NAV_ESCRITORIO).map((d) => (
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
      ))}
    </nav>
  );
}
