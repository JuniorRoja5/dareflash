"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * CTA "Crear reto" de la barra superior, CONSCIENTE de la ruta. En /inicio el magenta de CONTENIDO es
 * el CTA del hero de la portada; para no mostrar dos "Crear reto" magenta gemelos en la misma
 * pantalla (un unico magenta DOMINANTE por pantalla), aqui se ATENUA a secundario (filete neutro) en
 * esa ruta. En el resto del shell (retos, ranking, perfil...) este es el magenta persistente (cromo,
 * como el [+] de la nav movil). Reusa el lenguaje del boton; es un <Link> de navegacion vestido, no un
 * primitivo nuevo.
 */
export function CtaCrear() {
  const enInicio = usePathname() === "/inicio";
  const variante = enInicio
    ? "border-line text-text hover:bg-raised"
    : "border-transparent bg-action text-void hover:brightness-110";
  return (
    <Link
      href="/crear"
      className={`inline-flex min-h-[44px] items-center gap-2 rounded-sm border px-5 text-sm font-semibold transition-[filter,background-color,border-color] duration-150 ease-mechanical ${variante}`}
    >
      <span className="text-lg font-bold leading-none">+</span>
      <span>Crear reto</span>
    </Link>
  );
}
