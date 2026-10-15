import {
  DEFAULT_CURRENCY,
  MSG_VIP_PAGO_NO_DISPONIBLE,
  MSG_VIP_SIN_VERIFICAR,
  MSG_VIP_YA_ACTIVO,
  PLAN_VIP,
  RATE_LIMITS,
  VIP_PRECIO_CENTS,
} from "@/config/constants";
import { mutatingRoute } from "@/server/auth/mutating-route";
import { apiError, apiOk, rateLimitKey } from "@/server/http/api";

export const dynamic = "force-dynamic";

/**
 * POST /api/vip/checkout — abre el pago de la suscripción VIP Mythic.
 *
 * CALCA EL CHECKOUT DE BOOST, con una diferencia: `mode: "subscription"`. El precio NO viaja desde
 * el navegador —se resuelve aquí contra `VIP_PRECIO_CENTS`—, así que no hay forma de colar "el VIP
 * por un dólar": el importe no es un dato de entrada, es una consecuencia.
 *
 * EMAIL VERIFICADO, la misma barrera antifraude que comprar boosts, votar o denunciar.
 *
 * NO ACTIVA NADA. Abrir un pago no es haber cobrado: el VIP lo da el webhook cuando Stripe confirma.
 * Activar aquí sería regalar la suscripción a quien abre el formulario y lo cierra.
 *
 * Y NO SE ABRE UN SEGUNDO PAGO A QUIEN YA ES VIP: cobraría dos veces por lo mismo. La comprobación
 * pasa por el chokepoint (`esVipActivoDe`), no por mirar el estado a mano.
 */
export const POST = mutatingRoute(async (_req, { user, env, prisma }) => {
  const { rateLimit } = await import("@/server/security/rate-limit");
  const { clienteStripe, PagosNoDisponibles } = await import("@/server/pagos/stripe");
  const { esVipActivoDe } = await import("@/server/services/vip");

  if (user.emailVerified === null) {
    return apiError("EMAIL_SIN_VERIFICAR", MSG_VIP_SIN_VERIFICAR, 403);
  }

  if (await esVipActivoDe(prisma, user.userId)) {
    return apiError("YA_ACTIVO", MSG_VIP_YA_ACTIVO, 409);
  }

  const rl = await rateLimit(prisma, {
    key: `vip:checkout:${rateLimitKey(env.AUTH_SECRET, user.userId)}`,
    ...RATE_LIMITS.BOOST_CHECKOUT_PER_USER,
  });
  if (!rl.allowed) {
    return apiError("RATE_LIMITED", "Demasiados intentos. Espera un momento.", 429);
  }

  try {
    const stripe = clienteStripe(env.STRIPE_SECRET_KEY);
    const sesion = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: DEFAULT_CURRENCY.toLowerCase(),
            unit_amount: VIP_PRECIO_CENTS,
            recurring: { interval: "month" },
            product_data: { name: "VIP Mythic" },
          },
        },
      ],
      // El puente con el webhook. En la SESIÓN y además en la SUSCRIPCIÓN: los eventos de
      // renovación y de baja llegan con el objeto `subscription`, no con la sesión, así que sin
      // esto no se sabría de quién es la renovación del mes que viene.
      metadata: { userId: user.userId, plan: PLAN_VIP },
      subscription_data: { metadata: { userId: user.userId, plan: PLAN_VIP } },
      success_url: `${env.APP_URL}/vip?suscripcion=ok`,
      cancel_url: `${env.APP_URL}/vip?suscripcion=cancelada`,
    });

    if (!sesion.url) {
      console.error(`[vip] Stripe no devolvió URL para la sesión ${sesion.id}`);
      return apiError("PAGO_NO_DISPONIBLE", MSG_VIP_PAGO_NO_DISPONIBLE, 503);
    }
    return apiOk({ url: sesion.url });
  } catch (e) {
    // Copy humano fuera, detalle al log: en pantalla no aparece ni "STRIPE_SECRET_KEY" ni el error
    // del SDK. Sin claves —que es el estado de hoy— esto es un 503 limpio, no una página rota.
    const porConfig = e instanceof PagosNoDisponibles;
    console.error(`[vip] abrir pago de ${user.userId}: ${e instanceof Error ? e.message : e}`);
    return apiError(
      porConfig ? "PAGO_NO_CONFIGURADO" : "PAGO_NO_DISPONIBLE",
      MSG_VIP_PAGO_NO_DISPONIBLE,
      503,
    );
  }
});
