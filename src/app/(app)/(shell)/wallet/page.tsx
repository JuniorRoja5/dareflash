import { redirect } from "next/navigation";

import { ESTADOS_RETIRADA_EN_CURSO, puedePedirCobro } from "@/lib/retirada";

import { HeroMonedero } from "./hero-monedero";
import { HistorialRetiradas } from "./historial-retiradas";
import { InformacionCobro } from "./informacion-cobro";
import { MetodosDeCobro } from "./metodos-de-cobro";
import { PedirCobro } from "./pedir-cobro";

export const metadata = { title: "Mi monedero · DareFlash" };
// Depende del SALDO, que cambia con cada cierre de reto. Nunca cacheada.
export const dynamic = "force-dynamic";

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
 * ┌─ HAY UNA SOLA PUERTA, Y ES LA DE PEDIR EL COBRO ──────────────────────────────────────────────┐
 * │ DÓNDE COBRAR se enseña SIEMPRE, también con el saldo a cero. La primera versión lo escondía   │
 * │ tras `saldo > 0` razonando que "pedirle el IBAN a quien no tiene dinero es pedirle un dato    │
 * │ para nada", y el razonamiento estaba del revés: guardar un método NO mueve dinero, así que    │
 * │ esconderlo solo consigue que la primera vez que alguien gana se encuentre con DOS pasos —     │
 * │ configurar y pedir— justo en el momento en que quiere cobrar. Dejarlo listo antes es          │
 * │ exactamente lo que una persona con saldo cero puede hacer de útil en esta pantalla.           │
 * │                                                                                               │
 * │ Lo que sí es una puerta es PEDIR EL COBRO: hace falta llegar al mínimo Y tener algún método   │
 * │ guardado (sin método, el formulario diría "elige uno" sobre una lista vacía).                 │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * LA PUERTA DEL MÍNIMO ES DE VERDAD: por debajo no se pinta el formulario Y la ruta rechaza igual
 * —las dos leen `RETIRADA_MINIMA_CENTS`, la vista a través de `puedePedirCobro`—. Esconder un botón
 * no es una regla.
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

  const [metodos, historial, porEstado] = await Promise.all([
    misMetodosPago(prisma, userId),
    // La PRIMERA página del histórico, ya pintada por el servidor; el "Ver más" sigue desde su
    // cursor. Lo que no se hace es traerlo entero: un histórico largo es una pantalla lenta.
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

  // LA MISMA FUNCIÓN PURA QUE DEFINE LA REGLA, no una comparación escrita otra vez aquí: así la
  // vista y el servidor no pueden discrepar sobre dónde está el mínimo.
  const llegaAlMinimo = puedePedirCobro(saldo);

  return (
    <div className="df-rise mx-auto w-full max-w-3xl px-4 py-8 lg:px-8 lg:py-12">
      <HeroMonedero
        saldoCents={saldo}
        // DERIVADO de la máquina de estados (`en curso` = lo que no es final), no una lista escrita
        // aquí: una segunda lista de estados es una lista libre de discrepar, y lo que contaría mal
        // es dinero.
        enRevisionCents={sumaDe(ESTADOS_RETIRADA_EN_CURSO)}
        cobradoCents={sumaDe(["PAID"])}
      />

      {/* DÓNDE COBRAR: SIEMPRE, saldo o no. Guardar un método no mueve dinero y dejarlo listo de
          antemano es lo único útil que se puede hacer aquí con el monedero vacío. */}
      <MetodosDeCobro metodos={metodos} saldoCents={saldo} />

      {/* PEDIR EL COBRO: al llegar al mínimo Y con algún método guardado. Sin método no hay a dónde
          mandarlo, así que el formulario diría "elige uno" sobre una lista vacía. */}
      {llegaAlMinimo && metodos.length > 0 ? (
        <PedirCobro saldoCents={saldo} metodos={metodos} />
      ) : null}

      <section aria-labelledby="tus-solicitudes" className="mt-10">
        <h2 id="tus-solicitudes" className="font-medium text-text">
          Tus solicitudes
        </h2>
        {/* La lista es CLIENTE porque el "Ver más" añade páginas sin recargar; la PRIMERA la trae
            el servidor ya pintada, así que no hay un salto en blanco al abrir. */}
        <HistorialRetiradas inicial={historial.items} cursorInicial={historial.nextCursor} />
      </section>

      <InformacionCobro />
    </div>
  );
}
