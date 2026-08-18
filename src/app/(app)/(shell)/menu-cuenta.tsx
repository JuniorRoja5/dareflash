"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Avatar } from "@/components/ui/avatar";

import { itemsMenuCuenta } from "./cuenta-logica";
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

const CLASE_ITEM =
  "block w-full px-4 py-2.5 text-left text-sm text-text transition-colors duration-150 ease-mechanical hover:bg-raised focus:bg-raised focus:outline-none";

/**
 * MENÚ DE CUENTA de la barra superior (solo escritorio). El avatar + chevron —antes maqueta muerta— es
 * ahora un desplegable real: con sesión ofrece "Ver mi perfil" y "Cerrar sesión"; a un invitado, solo
 * "Entrar" (las opciones las decide la función PURA `itemsMenuCuenta`). El logout usa `useCerrarSesion`
 * (POST con CSRF + redirect a `/`). a11y: `aria-haspopup=menu` + `aria-expanded`, `role=menu`/`menuitem`,
 * cierre con Escape y con clic fuera.
 */
export function MenuCuenta({
  usuario,
}: {
  usuario: { nombre: string; imagen: string | null } | null;
}) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { salir, cargando, error } = useCerrarSesion();

  useEffect(() => {
    if (!abierto) return;
    function alClicFuera(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    }
    function alTeclado(e: KeyboardEvent): void {
      if (e.key === "Escape") setAbierto(false);
    }
    document.addEventListener("mousedown", alClicFuera);
    document.addEventListener("keydown", alTeclado);
    return () => {
      document.removeEventListener("mousedown", alClicFuera);
      document.removeEventListener("keydown", alTeclado);
    };
  }, [abierto]);

  const items = itemsMenuCuenta(usuario !== null);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-label="Tu cuenta"
        onClick={() => setAbierto((v) => !v)}
        className="flex items-center gap-1 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-text"
      >
        <Avatar
          nombre={usuario?.nombre ?? "Invitado"}
          imagen={usuario?.imagen ?? null}
          tamano="sm"
        />
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
                onClick={() => setAbierto(false)}
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
