import { redirect } from "next/navigation";

import { ImportePremio } from "@/components/ui/importe-premio";
import { REDES_CRIPTO, RETIRADA_MINIMA_CENTS } from "@/config/constants";
import { importeConMoneda } from "@/lib/dinero";

import { HeroMonedero } from "./hero-monedero";
import { MetodosDeCobro } from "./metodos-de-cobro";
import { PedirCobro } from "./pedir-cobro";

export const metadata = { title: "Mi monedero · DareFlash" };
// Depende del SALDO, que cambia con cada cierre de reto. Nunca cacheada.
export const dynamic = "force-dynamic";

/** Lo que una solicitud está haciendo, dicho en castellano. Los códigos son de la BD, no del copy. */
const ESTADO_HUMANO: Record<string, string> = {
  PENDING: "En revisión",
  APPROVED: "Aceptada",
  PROCESSING: "En camino",
  PAID: "Pagada",
  REJECTED: "Rechazada",
};

/** Los estados que NO son finales: ese dinero ya salió del saldo y todavía no ha llegado. */
const EN_CURSO = ["PENDING", "APPROVED", "PROCESSING"] as const;

/**
 * MI MONEDERO — el saldo, dónde cobrar y las solicitudes.
 *
 * ┌─ POR QUÉ SE ENTRA POR EL PERFIL Y NO POR LA BARRA ────────────────────────────────────────────┐
 * │ Estuvo un rato como destino de la nav y era un sitio equivocado: la barra es para lo que se   │
 * │ hace a menudo, y cobrar no es eso —con suerte, una vez al mes—. Vive donde una persona busca  │
 * │ la configuración de su cuenta. Lo que no cambia es por qué NO está dentro de /puntos: puntos  │
 * │ y dinero son dos ledgers que no se convierten entre sí, y juntarlos invita a preguntar        │
 * │ cuántos puntos son un euro.                                                                   │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * LA PANTALLA SE ABRE POR CAPAS, y cada una aparece cuando sirve de algo:
 *   · el HERO con el saldo, siempre;
 *   · DÓNDE COBRAR, en cuanto hay dinero (`saldo > 0`): pedirle a alguien su IBAN con el monedero
 *     vacío es pedirle un dato para nada;
 *   · PEDIR EL COBRO, al llegar al mínimo, y solo si hay algún método guardado.
 * Enseñar las tres de golpe con el saldo a cero sería una pantalla llena de cosas que no se pueden
 * hacer, que es la forma más rápida de que alguien deje de leerlas.
 *
 * LA PUERTA DEL MÍNIMO ES DE VERDAD: por debajo no se pinta el formulario Y la ruta rechaza igual
 * (`RETIRADA_MINIMA_CENTS` en los dos sitios). Esconder un botón no es una regla.
 */
export default async function WalletPage() {
  const { requireVerifiedUser, AuthError } = await import("@/server/auth/rbac");
  const { prisma } = await import("@/server/db/client");
  const { misRetiradas } = await import("@/server/services/retirada");
  const { misMetodosPago } = await import("@/server/services/metodos-pago");

  let userId: string;
  try {
    userId = (await requireVerifiedUser()).userId;
  } catch (e) {
    if (e instanceof AuthError) redirect("/entrar?siguiente=/wallet");
    throw e;
  }

  const usuario = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { walletBalanceCents: true },
  });
  const saldo = usuario.walletBalanceCents;

  const [metodos, retiradas, porEstado] = await Promise.all([
    misMetodosPago(prisma, userId),
    misRetiradas(prisma, userId),
    // LAS DOS CIFRAS DEL HERO, DE UNA CONSULTA Y SOBRE TODO EL HISTORIAL. Sumarlas en memoria a
    // partir de `misRetiradas` daría un número que parece total y solo cuenta las 20 últimas, que es
    // peor que no ponerlo: una cifra de dinero equivocada no se distingue de una correcta mirándola.
    prisma.withdrawal.groupBy({
      by: ["status"],
      where: { userId },
      _sum: { amountCents: true },
    }),
  ]);

  const sumaDe = (estados: readonly string[]): number =>
    porEstado
      .filter((g) => estados.includes(g.status))
      .reduce((t, g) => t + (g._sum.amountCents ?? 0), 0);

  const hayDinero = saldo > 0;
  const llegaAlMinimo = saldo >= RETIRADA_MINIMA_CENTS;

  return (
    <div className="df-rise mx-auto w-full max-w-3xl px-4 py-8 lg:px-8 lg:py-12">
      <HeroMonedero
        saldoCents={saldo}
        enRevisionCents={sumaDe(EN_CURSO)}
        cobradoCents={sumaDe(["PAID"])}
      />

      {/* DÓNDE COBRAR: en cuanto hay dinero. Antes no sirve de nada. */}
      {hayDinero ? <MetodosDeCobro metodos={metodos} /> : null}

      {/* PEDIR EL COBRO: al llegar al mínimo Y con algún método guardado. Sin método no hay a dónde
          mandarlo, así que el formulario diría "elige uno" sobre una lista vacía. */}
      {llegaAlMinimo && metodos.length > 0 ? (
        <PedirCobro saldoCents={saldo} metodos={metodos} />
      ) : null}

      <section aria-label="Tus solicitudes" className="mt-10">
        <h2 className="font-medium text-text">Tus solicitudes</h2>
        {retiradas.length === 0 ? (
          <p className="mt-2 text-sm text-text-dim">Todavía no has pedido ningún cobro.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line border-y border-line">
            {retiradas.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-4 py-3 text-sm">
                <span className="min-w-0">
                  {/* La MISMA primitiva del hero, en su tamaño de lista: el dinero se trata igual en
                      toda la app o se trata de dos maneras. */}
                  <ImportePremio cents={r.amountCents} tamano="lista" />
                  {/* LA PISTA, no el destino: cuatro caracteres bastan para reconocer la fila, y el
                      IBAN completo no tiene nada que hacer viajando hasta el navegador. */}
                  <span className="ml-2 text-text-dim">
                    {r.metodo === "BANK" ? "Banco" : `Cripto · ${r.red}`} ····{r.pista}
                  </span>
                </span>
                <span className="shrink-0 text-2xs tracking-widest text-text-dim uppercase">
                  {ESTADO_HUMANO[r.status] ?? r.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        aria-label="Cómo funciona el cobro"
        className="mt-10 space-y-5 text-sm text-text-dim"
      >
        <div>
          <h2 className="font-medium text-text">Cómo funciona</h2>
          <p className="mt-1.5 max-w-prose leading-relaxed">
            Al pedir un cobro, ese importe sale de tu saldo al momento, el equipo lo revisa y te lo
            envía por el método que elijas. Puede tardar unos días. Si lo rechazamos, el dinero
            vuelve entero a tu monedero.
          </p>
        </div>

        <div>
          <h2 className="font-medium text-text">Comisiones</h2>
          <p className="mt-1.5 max-w-prose leading-relaxed">
            Las comisiones de la red (cripto) o del banco corren por tu cuenta, no por la de
            DareFlash. Recibirás el importe solicitado menos esas comisiones: si pides{" "}
            {importeConMoneda(5000)}, pueden llegarte, por ejemplo, {importeConMoneda(4890)}.
          </p>
        </div>

        {/* EL AVISO IRREVERSIBLE va en `--df-alarm`, que es exactamente para lo que existe ese token
            —peligro—, no para decorar: equivocarse de red es dinero que desaparece. */}
        <div className="rounded-sm border border-alarm/40 bg-alarm/5 p-4">
          <h2 className="font-medium text-alarm">Red de la cripto: léelo con cuidado</h2>
          <p className="mt-1.5 max-w-prose leading-relaxed">
            Solo enviamos USDC/USDT por {REDES_CRIPTO.map((r) => r.nombre).join(" y ")}. Tu
            dirección tiene que ser de esa misma red. Si nos das una de otra red,{" "}
            <span className="text-text">el dinero se pierde y no se puede recuperar</span>: los
            envíos de cripto son irreversibles.
          </p>
        </div>
      </section>
    </div>
  );
}
