import type Stripe from "stripe";

import { apiError, apiOk, depsRuta } from "@/server/http/api";

export const dynamic = "force-dynamic";

/**
 * POST /api/boost/webhook — Stripe confirma un pago y aquí se acreditan los boosts.
 *
 * ┌─ POR QUÉ ESTA RUTA NO PASA POR `mutatingRoute` ──────────────────────────────────────────────┐
 * │ `mutatingRoute` comprueba Origin, sesión y CSRF. Esto lo llama el SERVIDOR de Stripe: no hay │
 * │ navegador, ni cabecera Origin, ni cookie, ni token al que atar nada. Con el envoltorio, TODOS │
 * │ los webhooks se rechazarían y los pagos se cobrarían sin acreditarse.                         │
 * │                                                                                               │
 * │ Su protección es la FIRMA (`STRIPE_WEBHOOK_SECRET`) sobre el cuerpo crudo, que es más fuerte  │
 * │ que el CSRF: demuestra que el mensaje viene de Stripe y que nadie lo ha tocado. Por eso está  │
 * │ en la lista de exentas de `tests/route-csrf.test.ts`, con esta justificación escrita.         │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * EL CUERPO SE LEE CRUDO Y NO SE PARSEA ANTES. La firma se calcula sobre esos bytes exactos; pasar
 * por `req.json()` y volver a serializar cambia espacios y orden, y la firma deja de cuadrar — con
 * el agravante de que parecería que Stripe manda firmas malas.
 *
 * SIEMPRE 200 SALVO FIRMA INVÁLIDA. Un evento que no nos interesa, un paquete desconocido o un
 * importe que no cuadra se responden 200: no hay nada que reintentar, y un 4xx/5xx haría que Stripe
 * reenviara en bucle algo que nunca va a ir mejor. Lo que sí es 400 es una firma mala: ahí el
 * mensaje no es de quien dice ser.
 *
 * DOS TIPOS DE EVENTO, UNA SOLA COMPRA. `completed` llega en el pago normal y
 * `async_payment_succeeded` en los métodos diferidos. Los dos traen la MISMA sesión, así que los
 * dos derivan la misma clave de idempotencia y acreditan una sola vez (ver `boost-compra`).
 */
const EVENTOS: ReadonlySet<string> = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
]);

export async function POST(req: Request) {
  const { env, prisma } = await depsRuta();
  const { clienteStripe, eventoVerificado, PagosNoDisponibles } =
    await import("@/server/pagos/stripe");
  const { acreditarCompraBoostSinFallar } = await import("@/server/services/boost-compra");

  // CRUDO. Antes de nada y sin tocarlo.
  const cuerpo = await req.text();

  let evento: Stripe.Event;
  try {
    const stripe = clienteStripe(env.STRIPE_SECRET_KEY);
    evento = eventoVerificado(
      stripe,
      cuerpo,
      req.headers.get("stripe-signature"),
      env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (e) {
    if (e instanceof PagosNoDisponibles) {
      // Falta configuración NUESTRA: 503 para que Stripe reintente cuando esté puesta.
      console.error(`[boost/webhook] ${e.message}`);
      return apiError("PAGO_NO_CONFIGURADO", "Pagos no disponibles.", 503);
    }
    console.error(`[boost/webhook] firma inválida: ${e instanceof Error ? e.message : e}`);
    return apiError("FIRMA_INVALIDA", "Firma no válida.", 400);
  }

  if (!EVENTOS.has(evento.type)) return apiOk({ ignorado: evento.type });

  const sesion = evento.data.object as Stripe.Checkout.Session;
  // Un pago que aún no está cobrado (métodos diferidos) NO acredita: ya llegará su evento.
  if (sesion.payment_status !== "paid") return apiOk({ ignorado: "no_pagado" });

  const userId = sesion.metadata?.["userId"];
  const packageId = sesion.metadata?.["packageId"];
  if (!userId || !packageId) {
    // Sin nuestra metadata no se sabe a quién acreditar. Es una anomalía, no un caso de uso.
    console.error(`[boost/webhook] sesión ${sesion.id} sin metadata de compra`);
    return apiOk({ ignorado: "sin_metadata" });
  }

  const r = await acreditarCompraBoostSinFallar(prisma, {
    userId,
    packageId,
    sessionId: sesion.id,
    pagadoCents: sesion.amount_total,
  });

  // 200 también cuando se rechaza o ya estaba: el detalle ya fue al log, y reintentar no arregla
  // un importe que no cuadra. El ÚNICO 5xx es un fallo nuestro que sí puede ir mejor al reintentar.
  if (r.estado === "error") return apiError("ERROR", "No se pudo procesar.", 500);
  return apiOk({ estado: r.estado });
}
