"use client";

import { usePathname } from "next/navigation";

import { destinoActivo } from "@/components/ui/logic";
import { NavegacionInferior, NavegacionLateral } from "@/components/ui/navegacion";

/**
 * Islas cliente minimas del armazon: leen la ruta (`usePathname`), calculan el destino activo con
 * la funcion PURA `destinoActivo`, y se lo pasan a la nav (que sigue presentacional y pura). Asi el
 * unico "use client" del armazon queda aislado aqui; el layout y las primitivas no se ensucian. El ROL
 * (que decide el [+] de la barra inferior) y las no-leidas (el numero del icono de Perfil) los resuelve
 * el layout en el servidor y llegan por prop.
 */

export function NavInferiorActiva({ rol, noLeidas }: { rol: string | null; noLeidas: number }) {
  const activo = destinoActivo(usePathname()) ?? undefined;
  return <NavegacionInferior activo={activo} rol={rol} noLeidas={noLeidas} />;
}

export function NavLateralActiva() {
  const activo = destinoActivo(usePathname()) ?? undefined;
  return <NavegacionLateral activo={activo} />;
}
