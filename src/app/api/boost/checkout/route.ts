import { z } from "zod";

import {
  MSG_BOOST_PAGO_NO_DISPONIBLE,
  MSG_BOOST_SIN_VERIFICAR,
  PAQUETES_BOOST,
  PaqueteBoostSchema,
  DEFAULT_CURRENCY,
  RATE_LIMITS,
} from "@/config/constants";
import { mutatingRoute } from "@/server/auth/mutating-route";
import { apiError, apiOk, rateLimitKey } from "@/server/http/api";

export const dynamic = "force-dynamic";

/**
 * EL CLIENTE SOLO MANDA LA CLAVE DEL PAQUETE. Ni el precio ni el número de boosts viajan desde el
 * navegador: se resuelven en servidor contra `PAQUETES_BOOST`. Por eso es imposible colar "el pack
 * de 10 por un dólar" — el importe no es un dato de entrada, es una consecuencia.
 */
const CuerpoSchema = z.object({ packageId: PaqueteBoostSchema });

/**
 * POST /api/boost/checkout — abre el pago de un paquete de boosts.
 *
 * Mutante normal: `mutatingRoute` (Origin / sesión / CSRF) y además EMAIL VERIFICADO, la misma
 * barrera antifraude que votar, comentar o denunciar. Comprar es una acción con efectos.
 *
 * LA `metadata` ES EL PUENTE con el webhook: Stripe nos la devuelve tal cual al confirmar, y es de
 * donde sale a quién acreditar y qué. Va en la SESIÓN porque la sesión es lo que identifica la
 * compra de nuestro lado (ver `boost-compra`).
 *
 * NO ACREDITA NADA. Abrir un pago no es haber cobrado: los boosts los da el webhook cuando Stripe
 * confirma. Acreditar aquí sería regalar créditos a quien abre el formulario y lo cierra.
 */
export const POST = mutatingRoute(async (req, { user, env, prisma }) => {
  const { rateLimit } = await import("@/server/security/rate-limit");
  const { clienteStripe, PagosNoDisponibles } = await import("@/server/pagos/stripe");

  if (user.emailVerified === null) {
    return apiError("EMAIL_SIN_VERIFICAR", MSG_BOOST_SIN_VERIFICAR, 403);
  }

  const cuerpo = CuerpoSchema.safeParse(await req.json().catch(() => null));
  if (!cuerpo.success) return apiError("VALIDATION", "Elige un paquete válido.", 400);
  const paquete = PAQUETES_BOOST[cuerpo.data.packageId];

  const rl = await rateLimit(prisma, {
    key: `boost:checkout:${rateLimitKey(env.AUTH_SECRET, user.userId)}`,
    ...RATE_LIMITS.BOOST_CHECKOUT_PER_USER,
  });
  if (!rl.allowed) {
    return apiError("RATE_LIMITED", "Demasiados intentos. Espera un momento.", 429);
  }

  try {
    const stripe = clienteStripe(env.STRIPE_SECRET_KEY);
    const sesion = await stripe.checkout.sessions.create({
      mode: "payment",
      // El importe NO sale del cliente: se construye aquí con el precio del catálogo.
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: DEFAULT_CURRENCY.toLowerCase(),
            unit_amount: paquete.precioCents,
            product_data: {
              name: `${paquete.boosts} Boost${paquete.boosts === 1 ? "" : "s"}`,
            },
          },
        },
      ],
      // Lo que el webhook necesita saber. Nada más: ni el precio (lo resuelve del catálogo) ni
      // datos personales que no hagan falta ahí.
      metadata: { userId: user.userId, packageId: cuerpo.data.packageId },
      success_url: `${env.APP_URL}/perfil?boost=ok`,
      cancel_url: `${env.APP_URL}/perfil?boost=cancelado`,
    });

    if (!sesion.url) {
      console.error(`[boost] Stripe no devolvió URL para la sesión ${sesion.id}`);
      return apiError("PAGO_NO_DISPONIBLE", MSG_BOOST_PAGO_NO_DISPONIBLE, 503);
    }
    return apiOk({ url: sesion.url });
  } catch (e) {
    // Falta de configuración o fallo de Stripe: copy humano fuera, detalle al log. En pantalla no
    // aparece ni "STRIPE_SECRET_KEY" ni el error del SDK.
    const porConfig = e instanceof PagosNoDisponibles;
    console.error(`[boost] abrir pago de ${user.userId}: ${e instanceof Error ? e.message : e}`);
    return apiError(
      porConfig ? "PAGO_NO_CONFIGURADO" : "PAGO_NO_DISPONIBLE",
      MSG_BOOST_PAGO_NO_DISPONIBLE,
      503,
    );
  }
});
