import {
  MSG_VIP_CANCELADA_OK,
  MSG_VIP_NO_ERES,
  MSG_VIP_PAGO_NO_DISPONIBLE,
  MSG_VIP_YA_CANCELADA,
  RATE_LIMITS,
} from "@/config/constants";
import { mutatingRoute } from "@/server/auth/mutating-route";
import { apiError, apiOk, rateLimitKey } from "@/server/http/api";

export const dynamic = "force-dynamic";

/**
 * POST /api/vip/cancelar — pide la baja de la suscripción al final del periodo.
 *
 * ┌─ NO CORTA EL ACCESO, Y ESA ES TODA LA PIEZA ────────────────────────────────────────────────┐
 * │ Lo que se manda a Stripe es `cancel_at_period_end: true`, no un borrado. El mes está pagado │
 * │ y se disfruta entero: sin prorrateo y sin reembolso, que es lo prometido en la pantalla.     │
 * │ Quien lo traduce a nuestro estado es el WEBHOOK (`customer.subscription.updated` ->          │
 * │ `estadoDesdeStripe` ve `cancel_at_period_end` y escribe CANCELADA), y `esVipActivo` ya sabe  │
 * │ que una CANCELADA con el periodo por delante SIGUE dando acceso.                             │
 * │                                                                                               │
 * │ O sea que esta ruta NO escribe en nuestra base de datos. Escribir aquí "CANCELADA" por        │
 * │ nuestra cuenta sería adelantarse al webhook y crear una segunda verdad: si Stripe rechazara  │
 * │ la operación, tendríamos una suscripción marcada de baja que sigue cobrando.                 │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * SIN PORTAL DE STRIPE por ahora: un botón propio hace esta única cosa, y el portal abre una
 * superficie entera (cambiar tarjeta, ver facturas, reactivar) que todavía no está decidida.
 */
export const POST = mutatingRoute(async (_req, { user, env, prisma }) => {
  const { rateLimit } = await import("@/server/security/rate-limit");
  const { clienteStripe, PagosNoDisponibles } = await import("@/server/pagos/stripe");

  const rl = await rateLimit(prisma, {
    key: `vip:cancelar:${rateLimitKey(env.AUTH_SECRET, user.userId)}`,
    ...RATE_LIMITS.BOOST_CHECKOUT_PER_USER,
  });
  if (!rl.allowed) {
    return apiError("RATE_LIMITED", "Demasiados intentos. Espera un momento.", 429);
  }

  const sub = await prisma.subscription.findUnique({
    where: { userId: user.userId },
    select: { estado: true, periodoFin: true, stripeSubscriptionId: true },
  });

  // ¿HAY ALGO QUE CANCELAR? Lo decide el chokepoint, no el estado a mano: una suscripción vencida
  // no se cancela (ya se acabó), y una CORTADA tampoco (no da acceso). Un no-VIP que llame a esto
  // —el botón no se le enseña, pero el endpoint existe— recibe un no, no una llamada a Stripe.
  const { esVipActivo } = await import("@/lib/vip");
  if (!esVipActivo(sub, new Date())) return apiError("NO_ERES_VIP", MSG_VIP_NO_ERES, 409);

  // Ya pedida: es un no-op amable, no un error. Pulsar dos veces no es equivocarse.
  if (sub?.estado === "CANCELADA")
    return apiOk({ estado: "ya-cancelada", mensaje: MSG_VIP_YA_CANCELADA });

  // Sin el id de Stripe no hay a quién pedirle la baja. Pasa si la fila se creó a mano (un ajuste
  // del equipo): se dice que no se puede, en vez de fingir que se ha hecho.
  if (!sub?.stripeSubscriptionId) {
    console.error(`[vip] cancelar sin stripeSubscriptionId: ${user.userId}`);
    return apiError("PAGO_NO_DISPONIBLE", MSG_VIP_PAGO_NO_DISPONIBLE, 503);
  }

  try {
    const stripe = clienteStripe(env.STRIPE_SECRET_KEY);
    await stripe.subscriptions.update(sub.stripeSubscriptionId, { cancel_at_period_end: true });
    // NO se escribe nada aquí: lo hace el webhook. Ver la cabecera.
    return apiOk({ estado: "cancelada", mensaje: MSG_VIP_CANCELADA_OK });
  } catch (e) {
    const porConfig = e instanceof PagosNoDisponibles;
    console.error(`[vip] cancelar ${user.userId}: ${e instanceof Error ? e.message : e}`);
    return apiError(
      porConfig ? "PAGO_NO_CONFIGURADO" : "PAGO_NO_DISPONIBLE",
      MSG_VIP_PAGO_NO_DISPONIBLE,
      503,
    );
  }
});
