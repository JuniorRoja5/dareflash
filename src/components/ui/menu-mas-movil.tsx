"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";

import { destinosDe, NAV_MOVIL_MAS, type DestinoClave } from "./logic";

/**
 * EL MENÚ "MÁS" DE LA BARRA DE MÓVIL — la puerta a lo que no cabe en la barra.
 *
 * ┌─ POR QUÉ EXISTE ──────────────────────────────────────────────────────────────────────────────┐
 * │ La barra inferior tenía cinco destinos fijos, y los otros —Inicio, Ranking, Puntos, Referidos │
 * │ y Boost— NO TENÍAN PUERTA EN MÓVIL: se llegaba por los botones del perfil propio o por un      │
 * │ enlace suelto de la portada, y a Inicio no se llegaba. Un destino que nadie puede abrir no    │
 * │ rompe ninguna pantalla, así que no lo caza nada: por eso hace falta un sitio donde esté todo. │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * SU CONTENIDO SE DERIVA (`NAV_MOVIL_MAS` = escritorio menos barra) y se resuelve con `destinosDe`,
 * como cualquier otra lista de la nav. Aquí no hay una tercera lista que pueda discrepar.
 *
 * ES LA ÚNICA ISLA CLIENTE de la nav: lo que necesita estado es abierto/cerrado, y nada más. La
 * barra sigue siendo presentacional y pura.
 *
 * ┌─ NI `role="menu"` NI `role="menuitem"`, Y ES DELIBERADO ──────────────────────────────────────┐
 * │ Ese patrón ARIA obliga a implementar navegación por flechas, Home/End y foco gestionado a     │
 * │ mano; declararlo sin eso le promete a un lector de pantalla un comportamiento que no está, y  │
 * │ es peor que no declararlo. Esto es lo que de verdad es: un botón con `aria-expanded` y una    │
 * │ LISTA DE ENLACES, que el tabulador recorre solo y cualquier lector anuncia bien.              │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * EMPIEZA CERRADO Y NO RECUERDA NADA entre páginas: la nav vive en el armazón y no se desmonta al
 * navegar, así que el cierre al elegir destino se hace a mano (`onClick`). Un menú que se queda
 * abierto tras navegar tapa la pantalla a la que acabas de llegar.
 *
 * EL MOVIMIENTO DE LA FLECHA ES CSS (`transition`), nunca JS: la regla global de
 * `prefers-reduced-motion` apaga transiciones y animaciones con `!important` sobre `*`, así que
 * quien pide menos movimiento ve el giro instantáneo sin que este componente tenga que acordarse.
 * Un giro animado desde JS se saltaría esa red.
 */
export function MenuMasMovil({
  activo,
  icono,
  etiqueta = "Más",
}: {
  /** Clave del destino activo, para marcar la fila y encender el botón si lo que se ve está dentro. */
  activo?: string;
  /** El icono de cada destino, por clave. Lo pasa la barra: aquí no se dibuja nada propio. */
  icono: Record<string, ReactNode>;
  etiqueta?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const idMenu = useId();

  const destinos = destinosDe(NAV_MOVIL_MAS as readonly DestinoClave[]);
  /** Si el destino que se está viendo vive aquí dentro, el botón se enciende como cualquier otro. */
  const dentro = destinos.some((d) => d.clave === activo);

  const cerrar = useCallback(() => setAbierto(false), []);

  useEffect(() => {
    if (!abierto) return;
    // TOCAR FUERA cierra. `pointerdown` y no `click`: en móvil el click llega tarde (tras el scroll
    // y el posible 300 ms), y mientras el menú tapa lo que el dedo quería tocar.
    const fuera = (e: PointerEvent) => {
      if (!caja.current?.contains(e.target as Node)) cerrar();
    };
    const escapar = (e: KeyboardEvent) => {
      if (e.key === "Escape") cerrar();
    };
    document.addEventListener("pointerdown", fuera);
    document.addEventListener("keydown", escapar);
    return () => {
      document.removeEventListener("pointerdown", fuera);
      document.removeEventListener("keydown", escapar);
    };
  }, [abierto, cerrar]);

  return (
    <div ref={caja} className="relative flex flex-1">
      {abierto ? (
        /* El panel sube DESDE la barra: `bottom-full` lo ancla justo encima, así que no tapa los
           otros destinos ni se sale por abajo. Ancho mínimo para que el objetivo táctil sea cómodo. */
        <ul
          id={idMenu}
          aria-label={etiqueta}
          className="absolute right-1 bottom-full mb-1 min-w-44 overflow-hidden rounded-sm border border-line bg-surface shadow-[var(--df-shadow-md)]"
        >
          {destinos.map((d) => (
            <li key={d.clave}>
              <Link
                href={d.href}
                aria-current={activo === d.clave ? "page" : undefined}
                onClick={cerrar}
                className={`flex min-h-[44px] items-center gap-3 px-4 text-sm transition-colors duration-[var(--df-dur-fast)] ease-mechanical ${
                  activo === d.clave
                    ? "bg-raised font-medium text-text"
                    : "text-text-dim hover:bg-raised hover:text-text"
                }`}
              >
                {icono[d.clave]}
                <span>{d.nombre}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        aria-controls={idMenu}
        className={`flex min-h-[44px] min-w-[44px] flex-1 flex-col items-center justify-center gap-1 py-2 text-2xs ${
          abierto || dentro ? "text-text" : "text-text-dim"
        }`}
      >
        {/* LA FLECHA ES EL MISMO BOTÓN EN DOS ESTADOS: gira 180° al desplegar y vuelve al replegar,
            con la misma transición. Dos iconos distintos harían un salto en vez de un gesto. */}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`h-5 w-5 shrink-0 transition-transform duration-[var(--df-dur-fast)] ease-mechanical ${
            abierto ? "rotate-180" : ""
          }`}
          aria-hidden
        >
          <path d="M6 15l6-6 6 6" />
        </svg>
        <span>{etiqueta}</span>
      </button>
    </div>
  );
}
