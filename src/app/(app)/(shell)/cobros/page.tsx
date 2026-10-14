import { redirect } from "next/navigation";

import { MSG_RETIRADA_SIN_MINIMO, REDES_CRIPTO, RETIRADA_MINIMA_CENTS } from "@/config/constants";
import { ImportePremio } from "@/components/ui/importe-premio";
import { importeConMoneda } from "@/lib/dinero";

import { FormularioCobro } from "./formulario-cobro";

export const metadata = { title: "Cobros · DareFlash" };
// Depende del SALDO, que cambia con cada cierre de reto. Nunca cacheada.
export const dynamic = "force-dynamic";

/**
 * COBROS — el monedero de la persona y sus solicitudes de retirada.
 *
 * ┌─ POR QUÉ NO ESTÁ DENTRO DE /puntos ───────────────────────────────────────────────────────────┐
 * │ Puntos y dinero son dos ledgers que NO se convierten entre sí, y meterlos en la misma         │
 * │ pantalla invita justo a esa confusión: "¿cuántos puntos son un euro?". Son dos cosas          │
 * │ distintas con dos pantallas distintas, y así no hay que explicarlo.                           │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * LA PUERTA DEL MÍNIMO ES DE VERDAD, no cosmética: por debajo no se pinta el formulario Y la ruta
 * rechaza igual. Esconder un botón no es una regla — la regla vive en el servidor, y esto solo
 * evita ofrecer algo que no se puede hacer.
 *
 * EL SALDO SE LEE AQUÍ Y NO POR `perfil.ts`, que a propósito NUNCA pide `walletBalanceCents`: el
 * dinero no viaja en el DTO del perfil, que es el que acaba en media aplicación.
 */
export default async function CobrosPage() {
  const { requireVerifiedUser, AuthError } = await import("@/server/auth/rbac");
  const { prisma } = await import("@/server/db/client");
  const { misRetiradas } = await import("@/server/services/retirada");

  let userId: string;
  try {
    userId = (await requireVerifiedUser()).userId;
  } catch (e) {
    if (e instanceof AuthError) redirect("/entrar?siguiente=/cobros");
    throw e;
  }

  const usuario = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { walletBalanceCents: true },
  });
  const saldo = usuario.walletBalanceCents;
  const llega = saldo >= RETIRADA_MINIMA_CENTS;
  const retiradas = await misRetiradas(prisma, userId);

  return (
    <div className="df-rise mx-auto w-full max-w-3xl px-4 py-8 lg:px-8 lg:py-12">
      <h1
        className="text-[clamp(1.75rem,5vw,2.5rem)] leading-tight text-text"
        style={{
          fontFamily: "var(--font-display)",
          fontVariationSettings: '"wght" 800, "wdth" 110',
        }}
      >
        Cobros
      </h1>

      <section
        aria-label="Tu saldo"
        className="mt-6 rounded-sm border border-line bg-surface/60 p-6 backdrop-blur-md"
      >
        <p className="text-2xs uppercase tracking-widest text-text-dim">Disponible</p>
        {/* LA PRIMITIVA DEL DINERO, no un estilo propio: el tratamiento del importe vive en un solo
            sitio (Archivo Expanded, --df-money, el entero mandando) y aquí se REUSA. Escribirlo a
            mano habría sido una segunda forma de pintar dinero, libre de divergir de la primera. */}
        <ImportePremio cents={saldo} tamano="tarjeta" className="mt-1 block" />
        {llega ? null : (
          <p className="mt-3 max-w-prose text-sm text-text-dim">
            {MSG_RETIRADA_SIN_MINIMO} Te faltan{" "}
            <span className="text-text">{importeConMoneda(RETIRADA_MINIMA_CENTS - saldo)}</span>{" "}
            para llegar al mínimo de {importeConMoneda(RETIRADA_MINIMA_CENTS)}.
          </p>
        )}
      </section>

      {llega ? <FormularioCobro saldoCents={saldo} /> : null}

      {/* EL COPY DE LAS COMISIONES, visible SIEMPRE y no escondido tras el formulario: quien mira
          esta pantalla antes de llegar al mínimo tiene derecho a saber ya cómo funciona el cobro. */}
      <section
        aria-label="Cómo funciona el cobro"
        className="mt-10 space-y-5 text-sm text-text-dim"
      >
        <div>
          <h2 className="font-medium text-text">Cómo funciona el cobro</h2>
          <p className="mt-1.5 max-w-prose leading-relaxed">
            Tu saldo se acumula con lo que ganas en los retos. Puedes solicitar un cobro cuando
            llegues a {importeConMoneda(RETIRADA_MINIMA_CENTS)}. Al solicitarlo, ese importe sale de
            tu saldo, el equipo lo revisa y te lo envía por el método que elijas. Puede tardar unos
            días.
          </p>
        </div>

        <div>
          <h2 className="font-medium text-text">Comisiones</h2>
          <p className="mt-1.5 max-w-prose leading-relaxed">
            Las comisiones de la red (cripto) o del banco corren por tu cuenta, no por la de
            DareFlash. Recibirás el importe solicitado menos esas comisiones: si pides{" "}
            {importeConMoneda(5000)}, pueden llegarte, por ejemplo, {importeConMoneda(4890)}.
            DareFlash no controla ni asume esas comisiones.
          </p>
        </div>

        {/* EL AVISO IRREVERSIBLE. Va en `--df-alarm` porque es exactamente para lo que existe ese
            token —peligro—, no para decorar: equivocarse de red es dinero que desaparece. */}
        <div className="rounded-sm border border-alarm/40 bg-alarm/5 p-4">
          <h2 className="font-medium text-alarm">Red de la cripto: léelo con cuidado</h2>
          <p className="mt-1.5 max-w-prose leading-relaxed">
            Solo enviamos USDC/USDT por las redes de la lista (
            {REDES_CRIPTO.map((r) => r.nombre).join(", ")}). Tu dirección tiene que ser de esa misma
            red. Si nos das una dirección de otra red,{" "}
            <span className="text-text">el dinero se pierde y no se puede recuperar</span>: los
            envíos de cripto son irreversibles. Comprueba la dirección dos veces.
          </p>
        </div>
      </section>

      <section aria-label="Tus solicitudes" className="mt-10">
        <h2 className="font-medium text-text">Tus solicitudes</h2>
        {retiradas.length === 0 ? (
          <p className="mt-2 text-sm text-text-dim">Todavía no has pedido ningún cobro.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line border-y border-line">
            {retiradas.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-4 py-3 text-sm">
                <span className="min-w-0">
                  <span className="tabular-nums text-text">{importeConMoneda(r.amountCents)}</span>
                  {/* LA PISTA, no el destino: cuatro caracteres bastan para reconocer la fila, y el
                      IBAN completo no tiene nada que hacer viajando hasta el navegador. */}
                  <span className="ml-2 text-text-dim">
                    {r.metodo === "BANK" ? "Banco" : `Cripto · ${r.red}`} ····{r.pista}
                  </span>
                </span>
                <span className="shrink-0 text-2xs uppercase tracking-widest text-text-dim">
                  {ESTADO_HUMANO[r.status] ?? r.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** El estado, en palabras. El código del estado no se le enseña a nadie. */
const ESTADO_HUMANO: Record<string, string> = {
  PENDING: "En revisión",
  APPROVED: "Aprobada",
  PROCESSING: "En camino",
  PAID: "Pagada",
  REJECTED: "Rechazada",
};
