import { CONCEPTO_MOVIMIENTO, CONCEPTO_MOVIMIENTO_OTRO } from "@/config/constants";
import { importeConMoneda } from "@/lib/dinero";
import type { MovimientoMonedero } from "@/server/services/retirada";
import { formatearFechaParaQuienMira, type Idioma, type ZonaHoraria } from "@/lib/formato";

/**
 * ÚLTIMOS MOVIMIENTOS — de dónde sale y a dónde va el saldo.
 *
 * ┌─ EXISTE PORQUE EL SALDO TENÍA QUE PODER EXPLICARSE ───────────────────────────────────────────┐
 * │ Desde que el equipo puede ajustar un monedero a mano, una cuenta puede ver su dinero cambiar  │
 * │ sin una sola línea que lo cuente. Un saldo que se mueve solo no se distingue de un error, y   │
 * │ la persona que lo nota escribe a soporte — o peor, no escribe y desconfía.                    │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * EL AJUSTE SE LLAMA "AJUSTE DEL EQUIPO", no "premio". Disfrazarlo sería mentir en el historial de
 * dinero de alguien. Lo que NO se enseña es el MOTIVO que escribió el admin ni QUIÉN lo firmó: eso
 * es traza interna y vive en el `AuditLog` —misma disciplina que la nota del ajuste de puntos—, y
 * por eso el DTO ni siquiera trae el `refId`, que en un ajuste es el id del admin.
 *
 * LA FRASE LA PONE EL COPY, NO LA FILA (`CONCEPTO_MOVIMIENTO`): la fila guarda el hecho —`refType`—
 * así que reescribir el texto reescribe también los movimientos viejos en vez de congelarlos. Y un
 * `refType` que ya no esté en el catálogo cae en un genérico honesto en lugar de dejar un hueco.
 *
 * ES UN TOPE, NO UNA PÁGINA, y el título lo dice. Ver `misMovimientosMonedero`.
 */
/** La caja de la lista: el mismo cristal que el resto de bloques de la pantalla. */
const CAJA =
  "rounded-sm border border-line bg-surface/60 shadow-[var(--df-shadow-sm)] backdrop-blur-md";
const TH =
  "py-3 pr-4 text-2xs font-semibold tracking-widest whitespace-nowrap text-text-dim uppercase";

const fecha = (d: Date, idioma: Idioma, zona: ZonaHoraria | null) =>
  formatearFechaParaQuienMira(d, idioma, zona, "diaMesAno");
const concepto = (m: MovimientoMonedero) =>
  (m.concepto && CONCEPTO_MOVIMIENTO[m.concepto]) ?? CONCEPTO_MOVIMIENTO_OTRO;

/**
 * EL SIGNO SIEMPRE, también en lo que entra: en una lista donde hay de los dos, un importe sin signo
 * obliga a deducir la dirección por el concepto.
 */
function Importe({ m, idioma }: { m: MovimientoMonedero; idioma: Idioma }) {
  const entra = m.amountCents > 0;
  return (
    <span className={`tabular-nums ${entra ? "text-money" : "text-text-dim"}`}>
      {entra ? "+" : "−"}
      {importeConMoneda(Math.abs(m.amountCents), idioma, m.currency)}
    </span>
  );
}

export function MovimientosMonedero({
  movimientos,
  idioma,
  zona,
}: {
  movimientos: MovimientoMonedero[];
  idioma: Idioma;
  zona: ZonaHoraria | null;
}) {
  return (
    <section aria-labelledby="movimientos">
      <h2 id="movimientos" className="font-medium text-text">
        Últimos movimientos
      </h2>
      {movimientos.length === 0 ? (
        <p className="mt-3 text-sm text-text-dim">
          Todavía no hay movimientos. Aquí verás cada entrada y salida de tu saldo.
        </p>
      ) : (
        <>
          {/* ESCRITORIO: TABLA. Fecha, concepto e importe en su columna, para bajar por la de los
              importes de un vistazo. */}
          <div className={`mt-3 hidden overflow-x-auto md:block ${CAJA}`}>
            <table className="w-full border-collapse text-left text-sm">
              <thead className="border-b border-line">
                <tr>
                  <th className={`pl-4 ${TH}`}>Fecha</th>
                  <th className={TH}>Concepto</th>
                  <th className={`text-right ${TH}`}>Importe</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {movimientos.map((m) => (
                  <tr key={m.id} data-movimiento={m.id}>
                    <td className="py-3 pr-4 pl-4 whitespace-nowrap text-text-dim tabular-nums">
                      {fecha(m.createdAt, idioma, zona)}
                    </td>
                    <td className="py-3 pr-4 text-text">{concepto(m)}</td>
                    <td className="py-3 pr-4 text-right whitespace-nowrap">
                      <Importe m={m} idioma={idioma} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* MÓVIL: una fila por movimiento, el importe a la derecha y la fecha bajo el concepto. */}
          <ul className={`mt-3 divide-y divide-line md:hidden ${CAJA}`}>
            {movimientos.map((m) => (
              <li
                key={m.id}
                data-movimiento-movil={m.id}
                className="flex items-baseline justify-between gap-4 px-4 py-3 text-sm"
              >
                <span className="min-w-0">
                  <span className="block text-text">{concepto(m)}</span>
                  <span className="block text-2xs text-text-dim">
                    {fecha(m.createdAt, idioma, zona)}
                  </span>
                </span>
                <span className="shrink-0">
                  <Importe m={m} idioma={idioma} />
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
