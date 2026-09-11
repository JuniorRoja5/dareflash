"use client";

import { usePathname } from "next/navigation";

import { Boton } from "@/components/ui/boton";
import { ctaPrincipal } from "@/lib/cta-principal";

/**
 * CTA PRINCIPAL de la barra superior, CONSCIENTE del ROL y de la ruta. Texto y destino salen de
 * `ctaPrincipal` (fuente única): el admin ve "Crear reto" (al panel) y el resto su acción real, "Subir
 * vídeo" (a /crear). Antes decía "Crear reto" a todo el mundo y llevaba a subir un vídeo.
 *
 * En /inicio el magenta de CONTENIDO es el CTA del hero de la portada; para no mostrar dos CTA magenta
 * gemelos en la misma pantalla (un unico magenta DOMINANTE por pantalla), aqui se ATENUA a secundario en
 * esa ruta. En el resto del shell es el magenta persistente (cromo, como el [+] de la nav movil). Reusa
 * el primitivo `Boton` en su forma de enlace (href), sin duplicar clases.
 */
export function CtaCrear({ rol }: { rol: string | null }) {
  const enInicio = usePathname() === "/inicio";
  const { texto, href } = ctaPrincipal(rol);
  return (
    <Boton href={href} variante={enInicio ? "secundario" : "principal"}>
      <span className="text-lg font-bold leading-none">+</span>
      <span>{texto}</span>
    </Boton>
  );
}
