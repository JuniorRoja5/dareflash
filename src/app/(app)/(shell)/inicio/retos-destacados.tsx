"use client";

import { useEffect, useState } from "react";

import { TarjetaVertical } from "../retos/tarjeta-vertical";
import { RETOS_REJILLA } from "./portada-datos";

/**
 * MURO de retos destacados (brief v2) — rejilla de tiles 9:16 verticales (`TarjetaVertical`, reusable).
 * Isla cliente minima: convierte los offsets (`restanteMs`) en plazos absolutos en el montaje (mismo
 * patron que el feed: sin Date.now() en el render, sin mismatch de hidratacion; hasta entonces cada
 * marcador muestra su placeholder). En movil 2 columnas; desde sm, 3.
 */
export function RetosDestacados() {
  const [plazos, setPlazos] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    const fijarPlazos = (): void => {
      const ahora = Date.now();
      const mapa: Record<string, number> = {};
      for (const reto of RETOS_REJILLA) mapa[reto.id] = ahora + reto.restanteMs;
      setPlazos(mapa);
    };
    fijarPlazos();
  }, []);

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      {RETOS_REJILLA.map((reto) => (
        <TarjetaVertical key={reto.id} reto={reto} deadlineMs={plazos?.[reto.id] ?? null} />
      ))}
    </div>
  );
}
