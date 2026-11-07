import type Stripe from "stripe";

import { apiError, apiOk, depsRuta } from "@/server/http/api";

export const dynamic = "force-dynamic";

/**
 * POST /api/empresa/creditos/webhook — Stripe confirma la compra de un paquete de créditos de
 * publicidad (P11) y aquí se abona. El gemelo de `/api/boost/webhook`, con SU PROPIO SECRETO:
 * `STRIPE_WEBHOOK_SECRET_CREDITOS` (en Stripe cada endpoint se da de alta aparte y firma con el suyo;
 * verificar con el de otro webhook rechazaría todas las entregas —pasó con VIP—).
 *
 * NO PASA POR `mutatingRoute`: lo llama el servidor de Stripe, sin Origin, cookie ni CSRF. Su única
 * autenticación es la FIRMA sobre el cuerpo CRUDO (exenta en `tests/route-csrf.test.ts`, justificada).
 *
 * SIEMPRE 200 SALVO FIRMA INVÁLIDA (400) o fallo nuestro reintentable (5xx): un paquete desconocido,
 * otra moneda o un importe que no cuadra no mejoran al reenviarlos.
 */
const EVENTOS: ReadonlySet<string> = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
]);

export async function POST(req: Request) {
  const { env, prisma } = await depsRuta();
  const { clienteStripe, eventoVerificado, PagosNoDisponibles } =
    await import("@/server/pagos/stripe");
  const { acreditarCompraCreditosSinFallar } = await import("@/server/services/creditos-compra");

  // CRUDO. Antes de nada y sin tocarlo.
  const cuerpo = await req.text();

  let evento: Stripe.Event;
  try {
    const stripe = clienteStripe(env.STRIPE_SECRET_KEY);
    evento = eventoVerificado(
      stripe,
      cuerpo,
      req.headers.get("stripe-signature"),
      env.STRIPE_WEBHOOK_SECRET_CREDITOS,
      "STRIPE_WEBHOOK_SECRET_CREDITOS",
    );
  } catch (e) {
    if (e instanceof PagosNoDisponibles) {
      // Falta configuración NUESTRA: 503 para que Stripe reintente cuando esté puesta.
      console.error(`[creditos/webhook] ${e.message}`);
      return apiError("PAGO_NO_CONFIGURADO", "Pagos no disponibles.", 503);
    }
    console.error(`[creditos/webhook] firma inválida: ${e instanceof Error ? e.message : e}`);
    return apiError("FIRMA_INVALIDA", "Firma no válida.", 400);
  }

  if (!EVENTOS.has(evento.type)) return apiOk({ ignorado: evento.type });

  const sesion = evento.data.object as Stripe.Checkout.Session;
  // Un pago aún no cobrado (métodos diferidos) NO abona: ya llegará su evento.
  if (sesion.payment_status !== "paid") return apiOk({ ignorado: "no_pagado" });

  const empresaId = sesion.metadata?.["empresaId"];
  const packageId = sesion.metadata?.["packageId"];
  if (!empresaId || !packageId) {
    console.error(`[creditos/webhook] sesión ${sesion.id} sin metadata de compra`);
    return apiOk({ ignorado: "sin_metadata" });
  }

  const r = await acreditarCompraCreditosSinFallar(prisma, {
    empresaId,
    packageId,
    sessionId: sesion.id,
    // Se CONTRASTAN contra el catálogo en el servicio, no se usan. La moneda, de la SESIÓN: con una
    // constante nuestra aquí, el servicio compararía nuestra moneda consigo misma.
    pagadoCents: sesion.amount_total,
    moneda: sesion.currency,
  });

  if (r.estado === "error") return apiError("ERROR", "No se pudo procesar.", 500);
  return apiOk({ estado: r.estado });
}
