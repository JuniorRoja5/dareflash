import Link from "next/link";
import type { ReactNode } from "react";

import { NOTIF_NO_LEIDAS_TOPE } from "@/config/constants";
import { ctaPrincipal } from "@/lib/cta-principal";
import { textoBadge } from "@/lib/notificaciones";

import { destinosDe, NAV_ESCRITORIO, NAV_MOVIL } from "./logic";
import { MenuMasMovil } from "./menu-mas-movil";

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
  // PUNTOS — tres galones ascendentes: la insignia de grado de toda la vida, y nivel es exactamente
  // eso. NO se dibuja con barras: el icono de Ranking ya son barras y a 20 px los dos serian el mismo.
  puntos: svg(
    <>
      <path d="M6 9.5 12 4l6 5.5" />
      <path d="M6 14.5 12 9l6 5.5" />
      <path d="M6 19.5 12 14l6 5.5" />
    </>,
  ),
  // DESTACADOS (Boost) — una estrella de cinco puntas, hueca y de un solo trazo. Es la marca
  // universal de "destacado", y aquí además es la ÚNICA figura del juego que no es ni un rectángulo
  // ni una silueta ni un galón: a 20 px no se confunde con ninguna de las otras siete, que es la
  // prueba que de verdad importa en una barra lateral.
  destacados: svg(
    <path d="m12 3.5 2.6 5.3 5.9.9-4.25 4.15 1 5.85L12 16.9l-5.25 2.75 1-5.85L3.5 9.7l5.9-.9z" />,
  ),
  // REFERIDOS — dos siluetas: la tuya y la que traes. Misma familia de trazo que el resto.
  referidos: svg(
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19.5a5.5 5.5 0 0 1 11 0" />
      <path d="M17 7.5v5M19.5 10h-5" />
    </>,
  ),
};

/**
 * NAVEGACION INFERIOR (movil) — CINCO HUECOS: los cuatro destinos de `NAV_MOVIL` (Feed es el home
 * del movil) y, en el quinto, el menu "Mas".
 *
 * ┌─ POR QUE EL QUINTO HUECO ES UN MENU Y NO UN DESTINO ──────────────────────────────────────────┐
 * │ Antes la barra eran cinco destinos fijos y los otros cinco de escritorio —Inicio, Ranking,    │
 * │ Puntos, Referidos y Boost— no tenian puerta en movil: se llegaba por los botones del perfil   │
 * │ propio, por un enlace suelto de la portada, o no se llegaba. Un destino que nadie puede abrir │
 * │ no rompe ninguna pantalla, asi que no lo caza nada.                                           │
 * │                                                                                               │
 * │ Ranking salio de la barra para dejarle el sitio; no se perdio, esta en el menu con el resto.  │
 * │ El contenido del menu se DERIVA (escritorio menos barra), asi que mover un destino de un sitio│
 * │ a otro no puede dejarlo inalcanzable (ver `NAV_MOVIL_MAS` y `MenuMasMovil`).                   │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * El [+] central es el CTA PRINCIPAL, por ROL y de la MISMA fuente que el de la barra de
 * escritorio y el hero (`ctaPrincipal`): "Subir vídeo" a /crear para el no-admin, "Crear reto" al panel
 * para el admin. Antes decia "Crear" e iba a /crear para todos: un tercer sitio con su propio texto.
 * Circulo de relleno --df-action con texto negro (--df-void), el UNICO magenta. Cada objetivo mide
 * 44 px. Presentacional: la posicion fija la pone el layout, y el rol se lo pasa quien la monta.
 *
 * AVISOS en movil: no hay campana (no hay barra superior). Los avisos se leen desde /perfil, y por eso
 * el icono de PERFIL lleva el numero de no-leidas, NEUTRO como todo recuento y con el mismo tope
 * ("99+") que la campana de escritorio. El badge va atado a la CLAVE `perfil`, asi que se movio con
 * el solo al cambiar el orden de la barra.
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
      {/* EL QUINTO HUECO. Va después del bucle y no dentro: no es un destino del catálogo, es la
          puerta a los que no caben. Recibe el MISMO juego de iconos, así que las filas del
          desplegable se ven como las de la lateral y no como otra cosa. */}
      <MenuMasMovil activo={activo} icono={ICONO} />
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
