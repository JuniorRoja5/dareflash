"use client";

import { usePathname } from "next/navigation";

import { Boton } from "@/components/ui/boton";
import { ctaPrincipal } from "@/lib/cta-principal";

/**
 * CTA PRINCIPAL de la barra superior, CONSCIENTE del ROL, del TIPO DE CUENTA y de la ruta. Texto y
 * destino salen de `ctaPrincipal` (fuente única): el admin ve "Crear reto" (al panel), una cuenta de
 * empresa "Mi empresa" (a su portal) y el resto su acción real, "Subir vídeo" (a /crear). Antes decía
 * "Crear reto" a todo el mundo y llevaba a subir un vídeo.
 *
 * El "+" va SOLO si el destino crea algo (`crea`): el de la empresa hoy no crea nada.
 *
 * En /inicio el acento de CONTENIDO es el CTA del hero de la portada; para no mostrar dos CTA acentuados
 * gemelos en la misma pantalla (un unico acento DOMINANTE por pantalla), aqui se ATENUA a secundario en
 * esa ruta. En el resto del shell es el acento persistente (cromo, como el [+] de la nav movil). Reusa
 * el primitivo `Boton` en su forma de enlace (href), sin duplicar clases.
 */
export function CtaCrear({
  rol,
  esCuentaEmpresa = false,
}: {
  rol: string | null;
  esCuentaEmpresa?: boolean;
}) {
  const enInicio = usePathname() === "/inicio";
  const { texto, href, crea } = ctaPrincipal(rol, esCuentaEmpresa);
  return (
    <Boton href={href} variante={enInicio ? "secundario" : "principal"}>
      {crea ? <span className="text-lg font-bold leading-none">+</span> : null}
      <span>{texto}</span>
    </Boton>
  );
}
