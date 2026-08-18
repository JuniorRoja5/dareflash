"use client";

import { Boton } from "@/components/ui/boton";

import { useCerrarSesion } from "./usar-cerrar-sesion";

/**
 * Botón "Cerrar sesión" para /perfil (mi perfil) — la vía que alcanza el MÓVIL (la barra superior es
 * solo escritorio). Acción de baja jerarquía: variante fantasma (nada de magenta, que es Boost).
 * Solo se monta en el perfil propio, que ya exige sesión.
 */
export function CerrarSesion({ className = "" }: { className?: string }) {
  const { salir, cargando, error } = useCerrarSesion();
  return (
    <div className={className}>
      <Boton
        variante="fantasma"
        className="w-full py-3"
        onClick={salir}
        disabled={cargando}
        aria-busy={cargando}
      >
        {cargando ? "Cerrando sesión…" : "Cerrar sesión"}
      </Boton>
      {error ? (
        <p role="alert" className="mt-2 text-center text-sm text-alarm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
