import type { MovimientoCreditoEmpresa } from "@/server/services/creditos";

const FECHA = { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" } as const;
const CABECERA = "text-2xs font-semibold tracking-widest text-text-dim uppercase";

const cantidad = (delta: number) => `${delta > 0 ? "+" : ""}${delta.toLocaleString("es-ES")}`;

/**
 * LOS MOVIMIENTOS DE CRÉDITOS DE PUBLICIDAD QUE VE LA EMPRESA. Cada uno por su CONCEPTO: la nota de un
 * ajuste es del equipo y no viaja aquí (el DTO `MovimientoCreditoEmpresa` no la trae).
 *
 * TABLA EN ESCRITORIO (fecha · concepto · créditos, la cifra alineada a la derecha para que se lean
 * en columna) y FILAS APILADAS EN MÓVIL, donde tres columnas no caben con el concepto entero.
 */
export function MovimientosCreditos({ movimientos }: { movimientos: MovimientoCreditoEmpresa[] }) {
  if (movimientos.length === 0) {
    return (
      <p className="text-sm text-text-dim">
        Todavía no tienes movimientos. Aquí verás cada crédito de publicidad que recibas.
      </p>
    );
  }
  return (
    <>
      <table className="hidden w-full border-collapse text-left text-sm md:table">
        <thead className="border-b border-line">
          <tr>
            <th className={`py-2 pr-4 ${CABECERA}`}>Fecha (UTC)</th>
            <th className={`py-2 pr-4 ${CABECERA}`}>Concepto</th>
            <th className={`py-2 text-right ${CABECERA}`}>Créditos</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {movimientos.map((m) => (
            <tr key={m.id}>
              <td className="py-2.5 pr-4 whitespace-nowrap text-text-dim tabular-nums">
                {new Date(m.creadoMs).toLocaleDateString("es-ES", FECHA)}
              </td>
              <td className="py-2.5 pr-4 text-text">{m.concepto}</td>
              <td className="py-2.5 text-right font-semibold whitespace-nowrap text-text tabular-nums">
                {cantidad(m.delta)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="divide-y divide-line md:hidden">
        {movimientos.map((m) => (
          <li key={m.id} className="flex items-baseline justify-between gap-3 py-3">
            <span className="min-w-0">
              <span className="block text-sm text-text">{m.concepto}</span>
              <span className="block text-2xs text-text-dim tabular-nums">
                {new Date(m.creadoMs).toLocaleDateString("es-ES", FECHA)} (UTC)
              </span>
            </span>
            <span className="shrink-0 text-sm font-semibold text-text tabular-nums">
              {cantidad(m.delta)}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
