import { ImportePremio } from "@/components/ui/importe-premio";
import { razonBoostPropia } from "@/lib/razones-boost";
import type { MovimientoBoost } from "@/server/services/boost-historial";

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
 * MI HISTORIAL DE BOOSTS — qué entró y qué salió, del más nuevo al más viejo.
 *
 * MISMO IDIOMA QUE EL HISTORIAL DE PUNTOS: lista sobria, filete entre filas, la cifra con su signo a
 * la derecha y sin color. Un verde/rojo aquí diría "bueno/malo" sobre un movimiento que solo es un
 * movimiento — gastar un Boost no es una mala noticia, es para lo que se compró.
 *
 * EL IMPORTE SOLO SALE DONDE EXISTE. Una compra lo tiene; un regalo del VIP y una activación no, y
 * pintar "0 $" en esas filas sería inventarse un precio. El `null` del DTO es la fuente.
 *
 * SIN IDS Y SIN NOMBRES: el servicio no trae ni `refType` ni `refId` (ver su cabecera), así que esta
 * vista no puede filtrar un cuid de Stripe ni el handle del admin que ajustó aunque se descuide.
 */
export function HistorialBoosts({ items }: { items: MovimientoBoost[] }) {
  if (items.length === 0) {
    return (
      <p className="mt-4 rounded-sm border border-line bg-surface/40 p-6 text-sm text-text-dim">
        Todavía no tienes movimientos. Cuando compres Boosts, aparecerán aquí.
      </p>
    );
  }

  return (
    <ul className="mt-4 divide-y divide-line overflow-hidden rounded-sm border border-line bg-surface/60 shadow-[var(--df-shadow-sm)] backdrop-blur-md">
      {items.map((m) => (
        <li
          key={m.id}
          data-movimiento={m.id}
          className="flex items-start gap-3 p-4 transition-colors duration-[var(--df-dur-fast)] ease-mechanical hover:bg-raised/60"
        >
          <span className="min-w-0 flex-1">
            {/* El importe viaja con el motivo porque el ajuste del equipo se lee distinto si suma o
                si resta, y el usuario no tiene por qué deducirlo del número de al lado. */}
            <span className="block text-sm text-text">{razonBoostPropia(m.razon, m.delta)}</span>
            <span className="flex flex-wrap items-center gap-x-1.5 text-2xs text-text-dim">
              {fecha(m.creadoEnMs)}
              {/* LOS DOS O NINGUNO. Una cifra de dinero sin su moneda no es un importe, y el
                  servicio devuelve `moneda: null` cuando el código de la fila no es ISO (ver su
                  DTO): ahí se calla, en vez de ponerle el símbolo que nos parezca. */}
              {m.importeCents !== null && m.moneda !== null ? (
                <>
                  <span aria-hidden>·</span>
                  <ImportePremio
                    cents={m.importeCents}
                    currency={m.moneda}
                    tamano="lista"
                    className="align-baseline"
                  />
                </>
              ) : null}
            </span>
          </span>
          <span className="shrink-0 rounded-xs bg-raised px-2 py-1 text-sm font-semibold tabular-nums text-text">
            {m.delta > 0 ? `+${m.delta}` : m.delta}
          </span>
        </li>
      ))}
    </ul>
  );
}
