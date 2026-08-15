"use client";

import { useState } from "react";

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
 */
export function Avatar({
  nombre,
  tamano = "md",
  imagen,
}: {
  nombre: string;
  tamano?: TamanoAvatar;
  imagen?: string | null;
}) {
  const [falla, setFalla] = useState(false);
  const inicial = (nombre.trim().charAt(0) || "?").toUpperCase();
  const base = `inline-flex ${TAMANO[tamano]} shrink-0 items-center justify-center overflow-hidden rounded-full`;

  if (imagen && !falla) {
    return (
      <span aria-hidden className={base}>
        {/* URL propia (/avatars/*.webp servida por Caddy); <img> normal, no next/image. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imagen}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setFalla(true)}
        />
      </span>
    );
  }

  return (
    <span aria-hidden className={`${base} bg-raised font-semibold text-text-dim`}>
      {inicial}
    </span>
  );
}
