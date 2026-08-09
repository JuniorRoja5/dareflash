import type { ReactNode } from "react";

import { tokenPuesto } from "./logic";

/**
 * FILA DE PUESTO (ranking) — --df-rank (oro) SOLO en los puestos 1, 2 y 3; el resto en neutro. El
 * oro NUNCA es decorativo (la eleccion vive en `tokenPuesto`, testeada). `tabular-nums` en el puesto
 * y en la cifra. Los PUNTOS van en NEUTRO, nunca en lima: la lima es solo dinero, y los puntos no
 * son dinero.
 *
 * `insignia` es un slot OPCIONAL (aditivo): cuando se pasa, se pinta entre el nombre y los puntos
 * (p. ej. la insignia de nivel del ranking). Sin pasarlo, la fila queda EXACTAMENTE como antes: el
 * rail del TopRanking de la portada no lo pasa y no cambia.
 */
export function FilaPuesto({
  puesto,
  username,
  puntos,
  activo = false,
  insignia,
}: {
  puesto: number;
  username: string;
  puntos: number;
  activo?: boolean;
  insignia?: ReactNode;
}) {
  const esPodio = tokenPuesto(puesto) === "rank";
  return (
    <div
      className={`flex items-center gap-3 border-b border-line py-2.5 last:border-b-0 ${activo ? "bg-raised" : ""}`}
    >
      <span
        className="w-7 shrink-0 text-right text-lg font-semibold tabular-nums"
        style={{ color: esPodio ? "var(--color-rank)" : "var(--color-text-dim)" }}
      >
        {puesto}
      </span>
      <span className="h-8 w-8 shrink-0 rounded-full bg-raised" aria-hidden />
      <span className="min-w-0 flex-1 truncate font-medium">@{username}</span>
      {insignia ? <span className="shrink-0">{insignia}</span> : null}
      {/* puntos: NEUTRO, jamas --df-money (los puntos no son dinero) */}
      <span className="shrink-0 text-sm tabular-nums text-text-dim">
        {puntos.toLocaleString("en-US")} pts
      </span>
    </div>
  );
}
