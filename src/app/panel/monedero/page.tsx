import { importeConMoneda } from "@/lib/dinero";
import { nombreMostrado } from "@/lib/identidad";
import { ETIQUETA_ESTADO } from "@/lib/retirada";

import { requireSeccion } from "../panel-guard";

import { AccionesRetirada } from "./acciones-retirada";

export const metadata = { title: "Monedero y retiradas · Panel" };
export const dynamic = "force-dynamic";

const ESTILO_TITULO = {
  fontFamily: "var(--font-display)",
  fontVariationSettings: '"wght" 720, "wdth" 112',
} as const;

/**
 * El estado, en palabras. El código no se enseña ni aquí.
 *
 * SALE DE `ETIQUETA_ESTADO`, la misma tabla que usa el monedero del usuario: tuvo su copia hasta que
 * el monedero se rehizo, y entonces las dos pantallas decían cosas distintas del mismo estado —aquí
 * "Pendiente", allí "En revisión"—. Quien escribe a soporte cita una palabra que el admin no ve.
 */
const ESTADO_HUMANO = ETIQUETA_ESTADO;

function cuando(fecha: Date): string {
  return fecha.toLocaleString("es-ES", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * MONEDERO Y RETIRADAS (Fase 7) — la cola de cobros y su máquina de estados.
 *
 * ┌─ ES EL ÚNICO SITIO DONDE UN IBAN VUELVE A ESTAR EN CLARO ─────────────────────────────────────┐
 * │ Y es a propósito: sin verlo no se puede hacer la transferencia. Por eso esta pantalla es de   │
 * │ ADMIN —derivado de `secciones.ts`, no de un `requireRole` suelto— y por eso el dato no entra  │
 * │ en el `AuditLog`, ni en un log, ni en la respuesta de la ruta de transición.                  │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ EL DINERO YA SALIÓ ──────────────────────────────────────────────────────────────────────────┐
 * │ Aceptar, "en proceso" y finalizar NO mueven saldo: son anotaciones de lo que el admin hace    │
 * │ por fuera. La ÚNICA que mueve dinero es RECHAZAR, que lo devuelve entero. La pantalla lo dice │
 * │ en la confirmación, con el importe, porque es lo que de verdad importa de esa acción.         │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * LOS BOTONES SALEN DE LA MÁQUINA DE ESTADOS, no de un `if` por fila: `siguientes` viene del
 * servicio. Una retirada ya pagada o ya rechazada no ofrece NADA — son estados finales, y un botón
 * desactivado sugeriría que hay algo que hacer.
 */
export default async function Pagina() {
  await requireSeccion("/panel/monedero");
  const { prisma } = await import("@/server/db/client");
  const { listarRetiradas } = await import("@/server/services/retirada-admin");

  const retiradas = await listarRetiradas(prisma);
  const pendientes = retiradas.filter((r) => r.estado === "PENDING").length;

  return (
    <div className="space-y-8">
      <header>
        <h1 style={ESTILO_TITULO} className="text-2xl text-text">
          Monedero y retiradas
        </h1>
        <p className="mt-2 max-w-prose text-sm text-text-dim">
          El dinero sale del monedero cuando la persona lo pide, no cuando tú lo pagas. Aceptar y
          marcar el envío no mueven saldo:{" "}
          <span className="text-text">la única que mueve dinero es rechazar</span>, que lo devuelve
          entero.
        </p>
        {/* La cifra sale del RECUENTO, no de una maqueta: el panel no inventa números. */}
        <p className="mt-3 text-sm text-text-dim">
          {retiradas.length === 0
            ? "No hay ninguna solicitud todavía."
            : `${retiradas.length} solicitud${retiradas.length === 1 ? "" : "es"} · ${pendientes} pendiente${pendientes === 1 ? "" : "s"} de revisar`}
        </p>
      </header>

      {retiradas.length === 0 ? null : (
        <ul className="divide-y divide-line border-y border-line">
          {retiradas.map((r) => (
            <li key={r.id} className="space-y-3 py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <span className="min-w-0">
                  <span className="text-base font-medium text-text">
                    {importeConMoneda(r.amountCents, r.currency)}
                  </span>
                  <span className="ml-2 text-sm text-text-dim">
                    {nombreMostrado(r.displayName, r.username)} · @{r.username}
                  </span>
                </span>
                <span className="text-2xs uppercase tracking-widest text-text-dim">
                  {ESTADO_HUMANO[r.estado] ?? r.estado} · {cuando(r.createdAt)} UTC
                </span>
              </div>

              {/* EL DESTINO DEL PAGO, descifrado y solo aquí. En `font-mono` porque se va a copiar a
                  mano a un banco o a una cartera, y un IBAN mal leído es dinero perdido. */}
              <dl className="rounded-sm border border-line bg-raised/40 p-3 text-xs">
                <div className="flex gap-2">
                  <dt className="shrink-0 text-text-dim">Método</dt>
                  <dd className="text-text">
                    {r.metodo === "BANK" ? "Banco" : `Cripto · ${r.red}`}
                  </dd>
                </div>
                {Object.entries(r.destino).map(([clave, valor]) => (
                  <div key={clave} className="mt-1 flex gap-2">
                    <dt className="shrink-0 text-text-dim">{clave}</dt>
                    <dd className="font-mono break-all text-text">{valor}</dd>
                  </div>
                ))}
              </dl>

              <AccionesRetirada
                retiradaId={r.id}
                siguientes={r.siguientes}
                importe={importeConMoneda(r.amountCents, r.currency)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
