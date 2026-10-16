"use client";

import { useState } from "react";

import { EmblemaDeNivel } from "@/components/ui/emblema-nivel";
import { MarcaVipEsquina } from "@/components/ui/identidad-usuario";
import { nivelPorPuntos } from "@/lib/niveles";

/**
 * TAMAÑO DEL EMBLEMA según el del avatar. Va en una esquina, superpuesto: ocupa poco y no tapa la
 * cara. Aquí se fija su caja y su desplazamiento; el glifo y el color los pone `EmblemaDeNivel`.
 */
const EMBLEMA: Record<string, string> = {
  sm: "h-3.5 w-3.5 -right-0.5 -bottom-0.5",
  md: "h-4 w-4 -right-0.5 -bottom-0.5",
  lg: "h-5 w-5 -right-1 -bottom-1",
  xl: "h-6 w-6 -right-1 -bottom-1",
};

/**
 * LA MARCA VIP, EN LA ESQUINA DE ARRIBA — y no en la de abajo, donde la pone la maqueta.
 *
 * ┌─ POR QUÉ SE MUEVE DE ESQUINA ────────────────────────────────────────────────────────────────┐
 * │ La maqueta la pone abajo a la derecha, que es donde este avatar lleva YA el emblema de       │
 * │ NIVEL. Dejarlos en el mismo sitio obliga a elegir: o se tapan, o el VIP pierde su nivel. Las │
 * │ dos cosas son información distinta —cuánto ha jugado y si paga— y las dos estaban decididas  │
 * │ antes. Arriba hay sitio libre y no se pisa nada.                                              │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * AQUÍ SOLO VA LA POSICIÓN, no el tamaño: desde que la marca son LETRAS, su caja la decide su
 * propio texto —una píldora es más ancha que alta— y fijarle un cuadrado desde fuera la
 * deformaría. Antes eran `h-4 w-4` porque el sello era un SVG cuadrado.
 */
const SELLO: Record<string, string> = {
  sm: "-right-1.5 -top-1.5",
  md: "-right-1.5 -top-1.5",
  lg: "-right-2 -top-2",
  xl: "-right-2 -top-2",
};

/**
 * GROSOR DEL ANILLO por tamaño de avatar, en píxeles.
 *
 * EL ANILLO ES LO QUE SE VE DE LEJOS, y por eso es el requisito y no el glifo: en un feed a pantalla
 * completa, o en una rejilla de vídeos, la insignia de la esquina es un punto de color y el marco es
 * lo único que dice "esta persona es Pro" sin tener que acercarse.
 *
 * Va como `box-shadow` y no como `border`: el borde comería del tamaño del círculo —que está fijado
 * por `TAMANO` y encaja en maquetas que ya existen— y además recortaría la foto. La sombra se dibuja
 * FUERA y no ocupa espacio en el flujo.
 */
const GROSOR: Record<string, number> = { sm: 2, md: 2.5, lg: 3, xl: 3.5 };

/**
 * El anillo de un nivel. LEGEND lleva DOBLE contorno y los demás uno solo, y eso no es adorno.
 *
 * El oro de Legend es el MISMO token que marca el puesto 1/2/3 en las listas de ranking
 * (`--df-rank`, compartido a propósito: medalla y corona dicen las dos "lo más alto"). Siendo el
 * mismo color, CIEDE2000 entre los dos es 0: el color NO puede separarlos, así que los separa la
 * FORMA. Un aro doble no se confunde con la banda maciza del marcador de puesto, y además se
 * distingue de los otros cuatro niveles aunque alguien no vea bien los tonos.
 */
function anilloDe(color: string, grosor: number, doble: boolean): string {
  if (!doble) return `0 0 0 ${grosor}px ${color}`;
  // Aro interior, hueco del fondo de página, y aro exterior: tres capas en una sola sombra.
  return [
    `0 0 0 ${grosor}px ${color}`,
    `0 0 0 ${grosor + 1.5}px var(--df-void)`,
    `0 0 0 ${grosor + 3}px ${color}`,
  ].join(", ");
}

const TAMANO = {
  sm: "h-8 w-8 text-xs",
  md: "h-12 w-12 text-base",
  lg: "h-16 w-16 text-xl",
  xl: "h-20 w-20 text-2xl", // podio (puesto 1); aditivo, no cambia los usos existentes
} as const;
export type TamanoAvatar = keyof typeof TAMANO;

/**
 * AVATAR — radius-full. Si hay `imagen` (URL de /avatars/*.webp que sirve Caddy) se pinta la FOTO
 * (object-cover); si falla la carga (onError) o no hay imagen, cae a la INICIAL del nombre sobre
 * --df-raised. Retrocompatible: sin `imagen` se comporta EXACTAMENTE como antes. Decorativo
 * (aria-hidden): el nombre se muestra aparte, no se anuncia dos veces.
 *
 * `perezosa` pide la foto con `loading="lazy"`: para las LISTAS (filas de ranking), donde la mayoría
 * queda bajo el pliegue y no debe competir con lo que se ve al cargar. Por defecto no: un avatar
 * arriba del todo (cabecera, podio, perfil) se quiere ya.
 */
export function Avatar({
  nombre,
  tamano = "md",
  imagen,
  perezosa = false,
  puntos,
  esVip = false,
}: {
  nombre: string;
  tamano?: TamanoAvatar;
  imagen?: string | null;
  perezosa?: boolean;
  /**
   * Puntos de LA PERSONA DEL AVATAR (su `pointsBalance`). Con ellos, el avatar lleva su anillo de
   * nivel; sin ellos, se pinta exactamente igual que siempre.
   *
   * OPCIONAL A PROPÓSITO, y no por comodidad: hay sitios donde este componente pinta a alguien de
   * quien la pantalla NO ha cargado los puntos (la barra de búsqueda, el menú de cuenta, la previa
   * del perfil que estás editando). Obligarlo llevaría a pasar un 0 para salir del paso, y un 0 aquí
   * no es "no lo sé": es Rookie. Ausente significa "esta superficie no lo sabe", que es la verdad.
   */
  puntos?: number;
  /**
   * ¿Es VIP activo? Lo resuelve el chokepoint de la Fase 8 y llega YA decidido: este componente no
   * consulta nada —en una lista serían veinte consultas— ni interpreta un estado.
   */
  esVip?: boolean;
}) {
  const [falla, setFalla] = useState(false);
  const inicial = (nombre.trim().charAt(0) || "?").toUpperCase();
  const nivel = puntos === undefined ? null : nivelPorPuntos(puntos);
  // Rookie es un nivel de verdad, pero NO lleva marca: es el estándar. Así el anillo significa
  // "ha llegado a algo" en vez de ser una etiqueta que todo el mundo lleva.
  const conEmblema = nivel?.emblema && nivel.tokenColor ? nivel : null;
  const base = `inline-flex ${TAMANO[tamano]} shrink-0 items-center justify-center overflow-hidden rounded-full`;
  const anillo = conEmblema
    ? {
        boxShadow: anilloDe(
          `var(${conEmblema.tokenColor})`,
          GROSOR[tamano] ?? 2,
          conEmblema.clave === "legend",
        ),
      }
    : undefined;

  const circulo =
    imagen && !falla ? (
      <span aria-hidden className={base} style={anillo} data-nivel={conEmblema?.clave}>
        {/* URL propia (/avatars/*.webp servida por Caddy); <img> normal, no next/image. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imagen}
          alt=""
          loading={perezosa ? "lazy" : undefined}
          className="h-full w-full object-cover"
          onError={() => setFalla(true)}
        />
      </span>
    ) : (
      <span
        aria-hidden
        className={`${base} bg-raised font-semibold text-text-dim`}
        style={anillo}
        data-nivel={conEmblema?.clave}
      >
        {inicial}
      </span>
    );

  // Sin emblema NI sello —sin puntos o Rookie, y no VIP— se devuelve EL MISMO nodo de siempre: ni
  // un envoltorio de más. Así esto no puede mover una sola maqueta de las que ya existen.
  if (!conEmblema && !esVip) return circulo;

  return (
    <span className="relative inline-flex">
      {circulo}
      {/* LA MARCA SOLO SI ES VIP. Esta es la única puerta por la que entra en un avatar: no hay
          otra forma de pintarla, así que no puede acabar en quien no paga. */}
      {esVip ? <MarcaVipEsquina clase={`pointer-events-none absolute ${SELLO[tamano]}`} /> : null}
      {/* El anillo dice el nivel de lejos; el glifo lo dice DE CERCA y sin depender del color, que es
          lo que necesita quien no distingue bien los tonos. Los dos salen del mismo `nivel`.
          `EmblemaDeNivel` lleva su propio `aria-label`: en el feed o en un comentario es lo ÚNICO que
          comunica el nivel, así que sin eso ahí no existiría para un lector de pantalla. */}
      {conEmblema ? (
        <EmblemaDeNivel
          nivel={conEmblema}
          clase={`pointer-events-none absolute ${EMBLEMA[tamano]}`}
        />
      ) : null}
    </span>
  );
}
