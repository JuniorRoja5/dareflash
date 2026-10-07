/**
 * COMPRA DE BOOSTS — acreditar lo que Stripe confirma, exactamente una vez.
 *
 * ┌─ EXACTAMENTE UNA VEZ, Y LA CLAVE ES LA COMPRA ────────────────────────────────────────────────┐
 * │ `idempotencyKey` sale del id de la SESIÓN DE PAGO, que es lo que identifica la compra. NO del │
 * │ id de entrega del evento: Stripe reentrega webhooks cuando duda de nuestra respuesta, y manda │
 * │ más de un TIPO de evento por la misma compra. Con la clave por evento, cada reentrega sería   │
 * │ un regalo de boosts; con la clave por compra, la segunda inserción choca con el UNIQUE del    │
 * │ ledger y es un no-op.                                                                         │
 * │                                                                                                │
 * │ La sesión y no el PaymentIntent porque es la sesión la que lleva NUESTROS datos (`metadata`   │
 * │ con el usuario y el paquete). Elegir una sola de las dos es parte del punto: dos                │
 * │ identificadores posibles para una compra serían dos claves, y dos claves son dos créditos.    │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * EL IMPORTE Y LOS BOOSTS SALEN DEL CATÁLOGO, nunca del cliente ni del evento. Lo que Stripe dice
 * que se pagó solo se usa para COMPARARLO con el catálogo: si no cuadra, no se acredita nada. Es
 * defensa en profundidad — el precio ya se fijó en servidor al abrir el pago, así que un desajuste
 * aquí significa que algo no es lo que creemos, y ante eso no se regalan créditos.
 *
 * SE ACREDITA SOLO CON `applyBoostCredits`, nunca con un UPDATE de `boostBalance`: así se hereda el
 * `FOR UPDATE` sobre la fila del `User`, la inserción del movimiento en la misma transacción y la
 * idempotencia por clave. Un saldo movido sin su fila de ledger es un descuadre, no un atajo.
 */
import "server-only";

import {
  DEFAULT_CURRENCY,
  PAQUETES_BOOST,
  PaqueteBoostSchema,
  RAZON_BOOST_COMPRA,
  REF_BOOST_STRIPE,
} from "@/config/constants";
import type { PrismaClient } from "@/generated/prisma/client";
import { sanearError } from "@/server/observability/sanitize-error";

import { applyBoostCredits } from "./ledger";

export type ResultadoCompra =
  /** Se acreditaron los boosts AHORA (primera vez que se procesa esta compra). */
  | { estado: "acreditado"; boosts: number; saldo: number }
  /** Esta compra ya estaba acreditada. No es un error: es una reentrega de Stripe. */
  | { estado: "repetida" }
  /**
   * No se acredita nada. `PAQUETE` = el `packageId` falta o no existe; `IMPORTE` = lo pagado no
   * coincide con el catálogo. Los dos son anomalías, no casos de uso: van al log.
   */
  | { estado: "rechazada"; motivo: "PAQUETE" | "IMPORTE" };

/** La clave de idempotencia de una compra. Fuente única: la usan el servicio y sus tests. */
export function claveCompraBoost(sessionId: string): string {
  return `boost:${sessionId}`;
}

export interface CompraConfirmada {
  /** De la `metadata` que pusimos al abrir el pago. */
  userId: string;
  packageId: string;
  /** Id de la sesión de pago: identifica la COMPRA y es la mitad de la clave. */
  sessionId: string;
  /** Lo que Stripe dice que se cobró, en céntimos. Se CONTRASTA, no se usa. */
  pagadoCents: number | null;
}

/**
 * Acredita una compra confirmada. Idempotente: llamarla mil veces acredita una.
 *
 * No lanza por los casos esperables —paquete inválido, importe que no cuadra, compra repetida—:
 * los devuelve. Quien llama (el webhook) tiene que responder 200 incluso cuando no acredita, o
 * Stripe reintentará en bucle una entrega que nunca va a ir mejor.
 */
export async function acreditarCompraBoost(
  db: PrismaClient,
  compra: CompraConfirmada,
): Promise<ResultadoCompra> {
  const clave = PaqueteBoostSchema.safeParse(compra.packageId);
  if (!clave.success) {
    console.error(`[boost] paquete desconocido en ${compra.sessionId}: ${compra.packageId}`);
    return { estado: "rechazada", motivo: "PAQUETE" };
  }
  const paquete = PAQUETES_BOOST[clave.data];

  // DEFENSA EN PROFUNDIDAD. El precio lo fijó el servidor al abrir el pago, así que esto debería
  // cuadrar siempre; si no cuadra, lo que falla es una suposición nuestra y no se regalan boosts.
  if (compra.pagadoCents !== paquete.precioCents) {
    console.error(
      `[boost] importe que no cuadra en ${compra.sessionId}: pagado ${compra.pagadoCents}, catálogo ${paquete.precioCents}`,
    );
    return { estado: "rechazada", motivo: "IMPORTE" };
  }

  const r = await applyBoostCredits(db, {
    userId: compra.userId,
    delta: paquete.boosts,
    reason: RAZON_BOOST_COMPRA,
    amountCents: paquete.precioCents,
    currency: DEFAULT_CURRENCY,
    refType: REF_BOOST_STRIPE,
    refId: compra.sessionId,
    idempotencyKey: claveCompraBoost(compra.sessionId),
  });

  return r.applied
    ? { estado: "acreditado", boosts: paquete.boosts, saldo: r.balance }
    : { estado: "repetida" };
}

/** Lo mismo, sin poder tumbar a quien llama. El webhook lo usa: ver su cabecera. */
export async function acreditarCompraBoostSinFallar(
  db: PrismaClient,
  compra: CompraConfirmada,
): Promise<ResultadoCompra | { estado: "error" }> {
  try {
    return await acreditarCompraBoost(db, compra);
  } catch (e) {
    console.error(`[boost] acreditar ${compra.sessionId}: ${sanearError(e)}`);
    return { estado: "error" };
  }
}
