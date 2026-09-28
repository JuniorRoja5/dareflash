import type { MovimientoPuntos } from "@/server/services/dareup-admin";

import { razonHumanaPropia } from "@/lib/razones-puntos";

/** Fecha en UTC, como todo el producto (la zona horaria solo al presentar). */
function fecha(ms: number): string {
  return new Date(ms).toLocaleDateString("es-ES", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * MI HISTORIAL DE PUNTOS — de dónde salió cada punto, del más nuevo al más viejo.
 *
 * SIN IDS A LA VISTA. `referencia` llega ya en humano desde el servicio (el título del reto, el
 * @handle de a quién invitaste) y el DTO ni siquiera trae `refType`/`refId`: lo que no está no se
 * puede pintar por descuido.
 *
 * EL SIGNO SE LEE, NO SE DEDUCE. Un ajuste puede ser negativo, así que el importe lleva su signo
 * siempre y en tono normal —sin verde ni rojo—: un color aquí diría "bueno/malo" sobre una cifra que
 * solo es un movimiento. El único color de esta pantalla es el del nivel, arriba.
 */
export function HistorialMisPuntos({ items }: { items: MovimientoPuntos[] }) {
  if (items.length === 0) {
    return (
      <p className="mt-4 rounded-sm border border-line bg-surface/40 p-6 text-sm text-text-dim">
        Todavía no tienes movimientos. Gana un reto o invita a alguien y aparecerán aquí.
      </p>
    );
  }

  return (
    <ul className="mt-4 divide-y divide-line rounded-sm border border-line bg-surface">
      {items.map((m) => (
        <li key={m.id} data-movimiento={m.id} className="flex items-start gap-3 p-4">
          <span className="min-w-0 flex-1">
            <span className="block text-sm text-text">{razonHumanaPropia(m.razon)}</span>
            <span className="block text-2xs text-text-dim">
              {fecha(m.creadoEnMs)}
              {/* La referencia solo se añade cuando dice algo: el servicio devuelve "—" cuando no
                  hay a qué apuntar, y arrastrar ese guion a cada fila sería ruido. */}
              {m.referencia && m.referencia !== "—" ? ` · ${m.referencia}` : ""}
            </span>
          </span>
          <span className="shrink-0 text-sm font-semibold tabular-nums text-text">
            {m.delta > 0 ? `+${m.delta}` : m.delta}
          </span>
        </li>
      ))}
    </ul>
  );
}
