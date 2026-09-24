"use client";

import { useState } from "react";

import { nivelPorPuntos } from "@/lib/niveles";

/**
 * EL ANILLO DE NIVEL, por tier. GEOMETRÍA Y ESCALA DE GRISES, sin una sola tonalidad nueva: sube el
 * grosor y sube el contraste (línea -> texto atenuado -> texto), y Legend añade un halo separado.
 *
 * Por qué NO una rampa de cinco colores, que es lo que hace todo el mundo: la paleta de este producto
 * asigna significado a cada tono (`--df-money` al dinero, `--df-rank` al podio, `--df-action` a la
 * acción). Cinco colores más, repetidos en CADA avatar de la plataforma, competirían con la cifra del
 * premio justo donde más importa. Con grises, el nivel se lee y no grita.
 *
 * Funciona en claro y en oscuro sin tocar nada: los tokens ya se invierten solos.
 */
const ANILLO: Record<number, string> = {
  1: "ring-1 ring-line",
  2: "ring-2 ring-line",
  3: "ring-2 ring-text-dim",
  4: "ring-2 ring-text",
  5: "ring-2 ring-text ring-offset-2 ring-offset-surface",
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
  const anillo = nivel ? ` ${ANILLO[nivel.tier] ?? ""}` : "";
  const base = `inline-flex ${TAMANO[tamano]} shrink-0 items-center justify-center overflow-hidden rounded-full${anillo}`;

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

  // Sin nivel, se devuelve EL MISMO nodo de siempre: ni un envoltorio de más. Así añadir esto no
  // puede mover una sola maqueta de las que ya existen.
  if (!nivel) return circulo;

  return (
    <span className="relative inline-flex">
      {circulo}
      {/* El anillo es geometría, y la geometría no se lee en voz alta. El nivel se dice aparte para
          quien usa lector de pantalla: en el feed o en un comentario, el anillo es LO ÚNICO que lo
          comunica, así que sin esto ahí el nivel sencillamente no existiría. */}
      <span className="sr-only">Nivel {nivel.nombre}</span>
    </span>
  );
}
