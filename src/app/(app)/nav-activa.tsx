"use client";

import { usePathname } from "next/navigation";

import { destinoActivo } from "@/components/ui/logic";
import { NavegacionInferior, NavegacionLateral } from "@/components/ui/navegacion";

/**
 * Islas cliente minimas del armazon: leen la ruta (`usePathname`), calculan el destino activo con
 * la funcion PURA `destinoActivo`, y se lo pasan a la nav (que sigue presentacional y pura). Asi el
 * unico "use client" del armazon queda aislado aqui; el layout y las primitivas no se ensucian.
 */

export function NavInferiorActiva() {
  const activo = destinoActivo(usePathname()) ?? undefined;
  return <NavegacionInferior activo={activo} />;
}

export function NavLateralActiva() {
  const activo = destinoActivo(usePathname()) ?? undefined;
  return <NavegacionLateral activo={activo} />;
}
