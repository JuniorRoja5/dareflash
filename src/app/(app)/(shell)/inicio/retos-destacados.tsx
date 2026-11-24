import type { Idioma } from "@/lib/formato";

import type { RetoPublicoVista } from "@/server/services/retos-publico";
import { textosRicos } from "@/textos/servidor";

import { TarjetaVertical } from "../retos/tarjeta-vertical";

/**
 * EL MURO DE RETOS de la portada (brief v2) — retos ABIERTOS reales, sin el del hero, en el orden de
 * `rejillaPortada`: primero los que cierran en menos de tres días (por premio), luego el resto (por
 * premio). Hasta P14 salía de `RETOS_SEED`, la maqueta. En móvil 2 columnas; desde sm, 3.
 *
 * Vacío honesto: si no queda ninguno abierto aparte del destacado, se dice y se enlaza a la lista.
 */
export async function RetosDestacados({
  retos,
  hayDestacado,
  idioma,
}: {
  retos: RetoPublicoVista[];
  hayDestacado: boolean;
  idioma: Idioma;
}) {
  if (retos.length === 0) {
    const tr = await textosRicos("inicio");
    return (
      <p className="rounded-sm border border-line bg-surface/60 px-4 py-6 text-center text-sm text-text-dim">
        {tr(hayDestacado ? "rejillaVacioConDestacado" : "rejillaVacio", {
          enlace: { href: "/retos", className: "text-text underline underline-offset-2" },
        })}
      </p>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      {retos.map((reto) => (
        <TarjetaVertical key={reto.publicCode} reto={reto} idioma={idioma} />
      ))}
    </div>
  );
}
