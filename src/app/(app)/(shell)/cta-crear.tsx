"use client";

import { usePathname } from "next/navigation";

import { Boton } from "@/components/ui/boton";

/**
 * CTA "Crear reto" de la barra superior, CONSCIENTE de la ruta. En /inicio el magenta de CONTENIDO es
 * el CTA del hero de la portada; para no mostrar dos "Crear reto" magenta gemelos en la misma
 * pantalla (un unico magenta DOMINANTE por pantalla), aqui se ATENUA a secundario en esa ruta. En el
 * resto del shell (retos, ranking, perfil...) es el magenta persistente (cromo, como el [+] de la nav
 * movil). Reusa el primitivo `Boton` en su forma de enlace (href): un CTA de navegacion identico a un
 * boton, sin duplicar clases.
 */
export function CtaCrear() {
  const enInicio = usePathname() === "/inicio";
  return (
    <Boton href="/crear" variante={enInicio ? "secundario" : "principal"}>
      <span className="text-lg font-bold leading-none">+</span>
      <span>Crear reto</span>
    </Boton>
  );
}
