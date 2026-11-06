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

  // La columna «Detalle» solo si alguna fila de ESTA página dice algo: vacía, se comía el ancho de la
  // tabla con una cabecera sobre nada (visto en la captura a 1440).
  const hayDetalle = items.some((m) => referencia(m) !== null);

  return (
    <>
      {/* ESCRITORIO: TABLA. Fecha, concepto, de qué (el reto, a quién invitaste) y puntos, cada uno
          en su columna: bajar por la de los puntos se hace de un vistazo. Filas centradas en
          vertical: la cifra va en una pastilla con relleno y, alineada arriba, quedaba más baja
          que el texto de su fila. */}
      <div className={`mt-4 hidden overflow-x-auto md:block ${CAJA}`}>
        <table className="w-full border-collapse text-left text-sm">
          <thead className="border-b border-line">
            <tr>
              <th className={`pl-4 ${TH}`}>Fecha</th>
              <th className={TH}>Concepto</th>
              {hayDetalle ? <th className={TH}>Detalle</th> : null}
              <th className={`pr-4 text-right ${TH}`}>Puntos</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {items.map((m) => (
              <tr key={m.id} data-movimiento={m.id} className="align-middle">
                <td className="py-3 pr-4 pl-4 whitespace-nowrap text-text-dim tabular-nums">
                  {fecha(m.creadoEnMs)}
                </td>
                {/* El importe viaja con el motivo: un ajuste del equipo se lee distinto si suma o
                    si resta, y el usuario no tiene por qué deducirlo del número de al lado. */}
                <td className="py-3 pr-4 text-text">{razonHumanaPropia(m.razon, m.delta)}</td>
                {hayDetalle ? (
                  <td className="max-w-[20rem] py-3 pr-4 break-words text-text-dim">
                    {referencia(m) ?? ""}
                  </td>
                ) : null}
                <td className="py-3 pr-4 text-right">
                  <Delta delta={m.delta} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* MÓVIL: TARJETAS. El concepto arriba, la fecha y el detalle debajo, los puntos a la derecha. */}
      <ul className={`mt-4 divide-y divide-line overflow-hidden md:hidden ${CAJA}`}>
        {items.map((m) => {
          const ref = referencia(m);
          return (
            <li key={m.id} data-movimiento-movil={m.id} className="flex items-start gap-3 p-4">
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-text">
                  {razonHumanaPropia(m.razon, m.delta)}
                </span>
                <span className="block text-2xs break-words text-text-dim">
                  {fecha(m.creadoEnMs)}
                  {ref ? ` · ${ref}` : ""}
                </span>
              </span>
              <Delta delta={m.delta} />
            </li>
          );
        })}
      </ul>
    </>
  );
}

const CAJA =
  "rounded-sm border border-line bg-surface/60 shadow-[var(--df-shadow-sm)] backdrop-blur-md";
const TH =
  "py-3 pr-4 text-2xs font-semibold tracking-widest whitespace-nowrap text-text-dim uppercase";

/**
 * La referencia solo se enseña cuando dice algo: el servicio devuelve "—" cuando no hay a qué apuntar,
 * y arrastrar ese guion a cada fila sería ruido.
 */
function referencia(m: MovimientoPuntos): string | null {
  return m.referencia && m.referencia !== "—" ? m.referencia : null;
}

/** El signo siempre y en tono normal: sin verde ni rojo (ver el docblock de arriba). */
function Delta({ delta }: { delta: number }) {
  return (
    <span className="inline-block shrink-0 rounded-xs bg-raised px-2 py-1 text-sm font-semibold tabular-nums text-text">
      {delta > 0 ? `+${delta}` : delta}
    </span>
  );
}
