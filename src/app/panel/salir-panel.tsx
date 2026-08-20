"use client";

import { useCerrarSesion } from "@/app/(app)/(shell)/usar-cerrar-sesion";

/**
 * Botón "Salir" del panel de admin. Reutiliza el hook compartido `useCerrarSesion` (POST logout con
 * CSRF + navegación dura a `/`). Compacto para la cabecera; copy humano en error.
 */
export function SalirPanel() {
  const { salir, cargando, error } = useCerrarSesion();
  return (
    <div className="flex items-center gap-3">
      {error ? (
        <span role="alert" className="text-sm text-alarm">
          {error}
        </span>
      ) : null}
      <button
        type="button"
        onClick={salir}
        disabled={cargando}
        className="min-h-[40px] rounded-sm border border-line px-4 text-sm font-medium text-text-dim transition-colors duration-150 ease-mechanical hover:bg-raised hover:text-text disabled:opacity-40"
      >
        {cargando ? "Saliendo…" : "Salir"}
      </button>
    </div>
  );
}
