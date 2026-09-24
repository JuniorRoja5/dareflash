"use client";

import { useState } from "react";

import { EmblemaDeNivel } from "@/components/ui/emblema-nivel";
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
}) {
  const [falla, setFalla] = useState(false);
  const inicial = (nombre.trim().charAt(0) || "?").toUpperCase();
  const nivel = puntos === undefined ? null : nivelPorPuntos(puntos);
  // Rookie es un nivel de verdad, pero NO lleva marca: es el estándar. Así el emblema significa
  // "ha llegado a algo" en vez de ser una etiqueta que todo el mundo lleva.
  const conEmblema = nivel?.emblema ? nivel : null;
  const base = `inline-flex ${TAMANO[tamano]} shrink-0 items-center justify-center overflow-hidden rounded-full`;

  const circulo =
    imagen && !falla ? (
      <span aria-hidden className={base}>
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
      <span aria-hidden className={`${base} bg-raised font-semibold text-text-dim`}>
        {inicial}
      </span>
    );

  // Sin emblema —sin puntos, o Rookie— se devuelve EL MISMO nodo de siempre: ni un envoltorio de
  // más. Así esto no puede mover una sola maqueta de las que ya existen.
  if (!conEmblema) return circulo;

  return (
    <span className="relative inline-flex">
      {circulo}
      {/* El emblema es un glifo, y un glifo no se lee en voz alta. `EmblemaDeNivel` lleva su propio
          `aria-label` con el nombre del nivel: en el feed o en un comentario es LO ÚNICO que lo
          comunica, así que sin eso ahí el nivel sencillamente no existiría. */}
      <EmblemaDeNivel
        nivel={conEmblema}
        clase={`pointer-events-none absolute ${EMBLEMA[tamano]} drop-shadow-[0_0_2px_var(--df-void)]`}
      />
    </span>
  );
}
