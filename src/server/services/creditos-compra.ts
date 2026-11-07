/**
 * COMPRA DE CRÉDITOS DE PUBLICIDAD (Fase 9 · P11) — abonar lo que Stripe confirma, exactamente una vez,
 * y dar a la empresa el RECIBO de su compra. Es el raíl de la compra de Boost (`boost-compra.ts`), con
 * la empresa en vez del usuario y el ledger de créditos en vez del de boosts.
 *
 * ┌─ EXACTAMENTE UNA VEZ, Y LA CLAVE ES LA COMPRA ────────────────────────────────────────────────┐
 * │ `idempotencyKey` sale del id de la SESIÓN de Checkout, que es lo que identifica la compra: ni  │
 * │ del id del evento (Stripe reentrega, y manda `completed` y `async_payment_succeeded` por la    │
 * │ misma compra) ni del PaymentIntent (dos identificadores para una compra serían dos claves).    │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * LOS CRÉDITOS Y EL IMPORTE SALEN DEL CATÁLOGO (`PAQUETES_CREDITOS`). Lo que Stripe dice que se cobró
 * solo se CONTRASTA: primero la MONEDA —`amount_total` es una cifra sin unidad: 500 son cinco dólares o
 * quinientos yenes, y una sesión en otra divisa con el mismo número pasaría el chequeo de importe—, y
 * después el importe. Un `null` en la moneda es rechazo: «no se sabe» no es «la de siempre».
 *
 * SE ABONA SOLO POR `aplicarCreditos`: hereda el `FOR UPDATE` de la Empresa (el primer escalón del orden
 * de `publicidad-cerrojos.ts`, y el único que toca), la fila de ledger en la misma transacción y la
 * idempotencia por clave. Un saldo movido sin su fila es un descuadre.
 */
import "server-only";

import {
  DEFAULT_CURRENCY,
  PAQUETES_CREDITOS,
  PaqueteCreditosSchema,
  REF_CREDITOS_STRIPE,
} from "@/config/constants";
import type { PrismaClient } from "@/generated/prisma/client";
import type { Db } from "@/server/db/types";
import { sanearError } from "@/server/observability/sanitize-error";

import { CreditosError, aplicarCreditos } from "./creditos";

export type ResultadoCompraCreditos =
  /** Se abonaron AHORA (primera vez que se procesa esta compra). */
  | { estado: "acreditado"; creditos: number; saldo: number }
  /** Ya estaba abonada: una reentrega de Stripe. No es un error. */
  | { estado: "repetida" }
  /**
   * No se abona nada. `PAQUETE` = falta o no existe; `MONEDA` = otra divisa (o ninguna); `IMPORTE` = lo
   * pagado no es el precio del catálogo; `EMPRESA` = la empresa de la metadata no existe. Anomalías: van
   * al log.
   */
  | { estado: "rechazada"; motivo: "PAQUETE" | "MONEDA" | "IMPORTE" | "EMPRESA" };

/** La clave de idempotencia de una compra. Fuente única: la usan el servicio y sus tests. */
export function claveCompraCreditos(sessionId: string): string {
  return `compra-creditos:${sessionId}`;
}

export interface CompraCreditosConfirmada {
  /** De la `metadata` que pusimos al abrir el pago (sale del chokepoint, nunca del navegador). */
  empresaId: string;
  packageId: string;
  /** Id de la sesión de Checkout: identifica la COMPRA y es la mitad de la clave. */
  sessionId: string;
  /** Lo que Stripe dice que se cobró, en céntimos. Se CONTRASTA, no se usa. */
  pagadoCents: number | null;
  /** La divisa en la que Stripe dice que se cobró (en minúsculas). Se CONTRASTA, ANTES que el importe. */
  moneda: string | null;
}

/** Abona una compra confirmada. Idempotente. No lanza por los casos esperables: los devuelve. */
export async function acreditarCompraCreditos(
  db: PrismaClient,
  compra: CompraCreditosConfirmada,
): Promise<ResultadoCompraCreditos> {
  const clave = PaqueteCreditosSchema.safeParse(compra.packageId);
  if (!clave.success) {
    console.error(`[creditos] paquete desconocido en ${compra.sessionId}: ${compra.packageId}`);
    return { estado: "rechazada", motivo: "PAQUETE" };
  }
  const paquete = PAQUETES_CREDITOS[clave.data];

  // LA MONEDA, ANTES QUE EL IMPORTE (ver la cabecera). Las dos puntas, normalizadas.
  if (compra.moneda?.toUpperCase() !== DEFAULT_CURRENCY.toUpperCase()) {
    console.error(
      `[creditos] moneda que no es la nuestra en ${compra.sessionId}: cobrado en ${compra.moneda}, catálogo ${DEFAULT_CURRENCY}`,
    );
    return { estado: "rechazada", motivo: "MONEDA" };
  }
  if (compra.pagadoCents !== paquete.precioCents) {
    console.error(
      `[creditos] importe que no cuadra en ${compra.sessionId}: pagado ${compra.pagadoCents}, catálogo ${paquete.precioCents}`,
    );
    return { estado: "rechazada", motivo: "IMPORTE" };
  }

  try {
    const r = await aplicarCreditos(db, {
      empresaId: compra.empresaId,
      delta: paquete.creditos,
      reason: "COMPRA",
      refType: REF_CREDITOS_STRIPE,
      refId: compra.sessionId,
      idempotencyKey: claveCompraCreditos(compra.sessionId),
    });
    return r.aplicado
      ? { estado: "acreditado", creditos: paquete.creditos, saldo: r.saldo }
      : { estado: "repetida" };
  } catch (e) {
    if (e instanceof CreditosError && e.code === "EMPRESA_NO_EXISTE") {
      console.error(`[creditos] la empresa de ${compra.sessionId} no existe: ${compra.empresaId}`);
      return { estado: "rechazada", motivo: "EMPRESA" };
    }
    throw e;
  }
}

/** Lo mismo, sin poder tumbar al webhook (que tiene que responder 200 salvo fallo reintentable). */
export async function acreditarCompraCreditosSinFallar(
  db: PrismaClient,
  compra: CompraCreditosConfirmada,
): Promise<ResultadoCompraCreditos | { estado: "error" }> {
  try {
    return await acreditarCompraCreditos(db, compra);
  } catch (e) {
    console.error(`[creditos] abonar ${compra.sessionId}: ${sanearError(e)}`);
    return { estado: "error" };
  }
}

// ---------------------------------------------------------------------------------------------------
// El recibo
// ---------------------------------------------------------------------------------------------------

/** Lo mínimo de Stripe para encontrar el recibo de una sesión (inyectable en los tests). */
export interface StripeRecibos {
  checkout: {
    sessions: {
      retrieve(
        id: string,
        opciones: { expand: string[] },
      ): Promise<{
        payment_intent:
          null | string | { latest_charge: null | string | { receipt_url: string | null } };
      }>;
    };
  };
}

/**
 * EL MOVIMIENTO DE COMPRA de SU empresa, o `null`. EL ÁMBITO VA DENTRO del where: el movimiento de otra
 * empresa es lo mismo que uno que no existe, y la ruta lo traduce a 404 sin preguntar nada a Stripe.
 */
export async function compraDeMiEmpresa(
  db: Db,
  empresaId: string,
  movimientoId: string,
): Promise<{ sessionId: string } | null> {
  const m = await db.creditoLedger.findFirst({
    where: { id: movimientoId, empresaId, reason: "COMPRA", refType: REF_CREDITOS_STRIPE },
    select: { refId: true },
  });
  return m?.refId ? { sessionId: m.refId } : null;
}

/**
 * EL RECIBO DE STRIPE de una compra de SU empresa: la dirección de la página de recibo del cobro (desde
 * la que se descarga en PDF), o `null` si no es suya o Stripe aún no lo tiene. Se llama «Recibo» en
 * todas partes, nunca «Factura»: la factura es otra pieza (P13), con otras obligaciones.
 */
export async function reciboDeMiCompra(
  db: Db,
  stripe: StripeRecibos,
  empresaId: string,
  movimientoId: string,
): Promise<string | null> {
  const compra = await compraDeMiEmpresa(db, empresaId, movimientoId);
  if (!compra) return null;
  const sesion = await stripe.checkout.sessions.retrieve(compra.sessionId, {
    expand: ["payment_intent.latest_charge"],
  });
  const pago = sesion.payment_intent;
  if (!pago || typeof pago === "string") return null;
  const cargo = pago.latest_charge;
  if (!cargo || typeof cargo === "string") return null;
  return cargo.receipt_url ?? null;
}
