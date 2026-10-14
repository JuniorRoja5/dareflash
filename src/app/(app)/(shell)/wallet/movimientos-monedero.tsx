import { CONCEPTO_MOVIMIENTO, CONCEPTO_MOVIMIENTO_OTRO } from "@/config/constants";
import { importeConMoneda } from "@/lib/dinero";
import type { MovimientoMonedero } from "@/server/services/retirada";

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
export function MovimientosMonedero({ movimientos }: { movimientos: MovimientoMonedero[] }) {
  if (movimientos.length === 0) return null;

  return (
    <section aria-labelledby="movimientos" className="mt-10">
      <h2 id="movimientos" className="font-medium text-text">
        Últimos movimientos
      </h2>
      <ul className="mt-3 divide-y divide-line border-y border-line">
        {movimientos.map((m) => {
          const entra = m.amountCents > 0;
          return (
            <li key={m.id} className="flex items-baseline justify-between gap-4 py-3 text-sm">
              <span className="min-w-0">
                <span className="text-text">
                  {(m.concepto && CONCEPTO_MOVIMIENTO[m.concepto]) ?? CONCEPTO_MOVIMIENTO_OTRO}
                </span>
                <span className="ml-2 text-2xs text-text-dim">
                  {m.createdAt.toLocaleDateString("es-ES", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              </span>
              {/* EL SIGNO SIEMPRE, también en lo que entra: en una lista donde hay de los dos, un
                  importe sin signo obliga a deducir la dirección por el concepto. */}
              <span className={`shrink-0 tabular-nums ${entra ? "text-money" : "text-text-dim"}`}>
                {entra ? "+" : "−"}
                {importeConMoneda(Math.abs(m.amountCents), m.currency)}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
