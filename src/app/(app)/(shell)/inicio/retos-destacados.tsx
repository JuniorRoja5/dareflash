"use client";

import { useEffect, useState } from "react";

import { TarjetaReto } from "../retos/tarjeta-reto";
import { RETOS_REJILLA } from "./portada-datos";

/**
 * Rejilla de RETOS DESTACADOS de la portada — REUSA la primitiva de feed `TarjetaReto` tal cual (no
 * la duplica). Isla cliente minima: convierte los offsets (`restanteMs`) en plazos absolutos en el
 * montaje (mismo patron que el feed: sin Date.now() en el render, sin mismatch de hidratacion; hasta
 * entonces cada marcador muestra su placeholder). En movil 1 columna; desde sm, 2.
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
    <div className="grid gap-4 sm:grid-cols-2">
      {RETOS_REJILLA.map((reto) => (
        <TarjetaReto key={reto.id} reto={reto} deadlineMs={plazos?.[reto.id] ?? null} />
      ))}
    </div>
  );
}
