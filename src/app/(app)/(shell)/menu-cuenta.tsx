"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";

import { Avatar } from "@/components/ui/avatar";

import { itemsMenuCuenta } from "./cuenta-logica";
import { useCerrarDesplegable } from "./usar-desplegable";
import { useCerrarSesion } from "./usar-cerrar-sesion";

function IconoChevron() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 text-text-dim"
      aria-hidden
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

/**
 * Silueta GENÉRICA del invitado. Antes el invitado recibía un `Avatar` con la inicial de "Invitado":
 * una "I" en un círculo, que se lee como la cuenta de alguien. Un invitado no tiene cuenta que pintar,
 * así que se pinta un hueco neutro con forma de persona, del mismo tamaño que el avatar.
 */
function SiluetaInvitado() {
  return (
    <span
      aria-hidden
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-raised text-text-dim"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4"
      >
        <circle cx="12" cy="8.5" r="3.5" />
        <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
      </svg>
    </span>
  );
}

const CLASE_ITEM =
  "block w-full px-4 py-2.5 text-left text-sm text-text transition-colors duration-150 ease-mechanical hover:bg-raised focus:bg-raised focus:outline-none";

/**
 * MENÚ DE CUENTA de la barra superior (solo escritorio). El avatar + chevron es un desplegable real:
 * con sesión ofrece "Ver mi perfil" y "Cerrar sesión"; a un invitado, solo "Entrar", y en vez de un
 * avatar ve la silueta genérica (las opciones las decide la función PURA `itemsMenuCuenta`). El logout
 * usa `useCerrarSesion` (POST con CSRF + navegación dura a `/`). a11y: `aria-haspopup=menu` +
 * `aria-expanded`, `role=menu`/`menuitem`, cierre con Escape y con clic fuera (`useCerrarDesplegable`,
 * compartido con la campana de avisos).
 */
export function MenuCuenta({
  usuario,
}: {
  usuario: { nombre: string; imagen: string | null } | null;
}) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const cerrar = useCallback(() => setAbierto(false), []);
  useCerrarDesplegable(ref, abierto, cerrar);
  const { salir, cargando, error } = useCerrarSesion();

  const items = itemsMenuCuenta(usuario !== null);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-label={usuario ? "Tu cuenta" : "Acceder"}
        onClick={() => setAbierto((v) => !v)}
        className="flex items-center gap-1 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-text"
      >
        {usuario ? (
          <Avatar nombre={usuario.nombre} imagen={usuario.imagen} tamano="sm" />
        ) : (
          <SiluetaInvitado />
        )}
        <IconoChevron />
      </button>

      {abierto ? (
        <div
          role="menu"
          aria-label="Cuenta"
          className="absolute right-0 z-40 mt-2 w-56 overflow-hidden rounded-sm border border-line bg-surface py-1 shadow-[var(--df-shadow-md)]"
        >
          {items.map((item) =>
            item.id === "logout" ? (
              <button
                key={item.id}
                role="menuitem"
                type="button"
                onClick={salir}
                disabled={cargando}
                aria-busy={cargando}
                className={`${CLASE_ITEM} disabled:opacity-40`}
              >
                {cargando ? "Cerrando sesión…" : item.label}
              </button>
            ) : (
              <Link
                key={item.id}
                role="menuitem"
                href={item.href ?? "/"}
                onClick={cerrar}
                className={CLASE_ITEM}
              >
                {item.label}
              </Link>
            ),
          )}
          {error ? (
            <p role="alert" className="px-4 py-1.5 text-xs text-alarm">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
