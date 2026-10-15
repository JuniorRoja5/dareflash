import type Stripe from "stripe";

import { apiError, apiOk, depsRuta } from "@/server/http/api";

export const dynamic = "force-dynamic";

/**
 * POST /api/vip/webhook — Stripe cuenta qué pasa con la suscripción y aquí se refleja.
 *
 * ┌─ POR QUÉ ESTA RUTA NO PASA POR `mutatingRoute` ──────────────────────────────────────────────┐
 * │ Lo llama el SERVIDOR de Stripe: no hay navegador, ni Origin, ni cookie, ni token al que atar │
 * │ nada. Con el envoltorio, TODOS los webhooks se rechazarían y se cobrarían suscripciones sin  │
 * │ activarlas. Su protección es la FIRMA sobre el cuerpo crudo, que es más fuerte que el CSRF:  │
 * │ demuestra que el mensaje viene de Stripe y que nadie lo ha tocado. Va a la lista de exentas  │
 * │ de `route-csrf`, con esta justificación, igual que el webhook de Boost.                       │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * SE ESCUCHAN LOS EVENTOS DE LA SUSCRIPCIÓN, no el de la sesión de pago. La sesión dice "alguien
 * pagó" pero NO trae hasta cuándo; los de la suscripción traen el estado, la baja pedida y el fin
 * de periodo, que es lo único que de verdad decide el acceso. Y llegan también en las RENOVACIONES,
 * que la sesión no cubre: sin ellos, un VIP se caería al mes de suscribirse.
 *
 * TODO ES IDEMPOTENTE POR CONSTRUCCIÓN: lo que se escribe es un `upsert` con la fecha ABSOLUTA que
 * manda Stripe. Reprocesar el mismo evento —que Stripe reentrega cuando duda de nuestra respuesta—
 * deja exactamente la misma fila. No hace falta clave de idempotencia porque no hay nada que sumar.
 *
 * SIEMPRE 200 SALVO FIRMA INVÁLIDA o fallo nuestro. Un evento que no nos interesa, una suscripción
 * sin metadata o sin fin de periodo se responden 200: no hay nada que reintentar, y un 4xx haría
 * que Stripe reenviara en bucle algo que nunca va a ir mejor.
 */
const EVENTOS: ReadonlySet<string> = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

export async function POST(req: Request) {
  const { env, prisma } = await depsRuta();
  const { clienteStripe, eventoVerificado, PagosNoDisponibles } =
    await import("@/server/pagos/stripe");
  const { estadoDesdeStripe, finDePeriodo } = await import("@/lib/vip");
  const { registrarSuscripcion } = await import("@/server/services/vip");

  // CRUDO. Antes de nada y sin tocarlo: la firma se calcula sobre estos bytes exactos.
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
      // Falta configuración NUESTRA: 503 para que Stripe reintente cuando esté puesta. Es el estado
      // de hoy —el raíl está inerte— y por eso no se acepta nada: sin clave no se verifica nada.
      console.error(`[vip/webhook] ${e.message}`);
      return apiError("PAGO_NO_CONFIGURADO", "Pagos no disponibles.", 503);
    }
    console.error(`[vip/webhook] firma inválida: ${e instanceof Error ? e.message : e}`);
    return apiError("FIRMA_INVALIDA", "Firma no válida.", 400);
  }

  if (!EVENTOS.has(evento.type)) return apiOk({ ignorado: evento.type });

  const sub = evento.data.object as Stripe.Subscription;
  const userId = sub.metadata?.["userId"];
  if (!userId) {
    // Sin nuestra metadata no se sabe de quién es. Es una anomalía, no un caso de uso.
    console.error(`[vip/webhook] suscripción ${sub.id} sin metadata de usuario`);
    return apiOk({ ignorado: "sin_metadata" });
  }

  // EL FIN DE PERIODO VIVE EN LA LÍNEA, no en la suscripción: Stripe lo movió ahí. Leerlo del sitio
  // de antes daría `undefined` y una fecha inválida — ver `finDePeriodo`, que por eso devuelve
  // `null` en vez de inventarse una.
  const hasta = finDePeriodo(sub.items?.data?.[0]?.current_period_end);
  if (!hasta) {
    console.error(`[vip/webhook] suscripción ${sub.id} sin fin de periodo legible`);
    return apiOk({ ignorado: "sin_periodo" });
  }

  try {
    await registrarSuscripcion(prisma, {
      userId,
      estado: estadoDesdeStripe(sub.status, sub.cancel_at_period_end === true),
      periodoFin: hasta,
      canceladaEn: sub.canceled_at ? new Date(sub.canceled_at * 1000) : null,
      stripeCustomerId: typeof sub.customer === "string" ? sub.customer : sub.customer?.id,
      stripeSubscriptionId: sub.id,
    });
  } catch (e) {
    // El ÚNICO 5xx: un fallo nuestro que sí puede ir mejor al reintentar.
    console.error(`[vip/webhook] registrar ${sub.id}: ${e instanceof Error ? e.message : e}`);
    return apiError("ERROR", "No se pudo procesar.", 500);
  }

  return apiOk({ estado: "registrada" });
}
