import { z } from "zod";

import {
  DEFAULT_CURRENCY,
  MSG_CREDITOS_PAGO_NO_DISPONIBLE,
  MSG_CREDITOS_SIN_VERIFICAR,
  PAQUETES_CREDITOS,
  PaqueteCreditosSchema,
  RATE_LIMITS,
} from "@/config/constants";
import { mutatingRoute } from "@/server/auth/mutating-route";
import { apiError, apiOk, rateLimitKey } from "@/server/http/api";

export const dynamic = "force-dynamic";

/** EL NAVEGADOR SOLO MANDA LA CLAVE DEL PAQUETE: el importe y los créditos los pone el catálogo. */
const CuerpoSchema = z.object({ packageId: PaqueteCreditosSchema });

/**
 * POST /api/empresa/creditos/checkout — abre el pago de un paquete de créditos de publicidad (P11).
 *
 * `mutatingRoute` (Origin / sesión / CSRF), y el ÁMBITO del chokepoint (`requireEmpresa`): la empresa
 * que compra es la de la sesión, nunca un id del cuerpo. Solo una empresa VERIFICADA compra (la misma
 * regla que la deja publicar).
 *
 * `cuentaEmpresa: "permite"`: quien compra créditos ES una cuenta de empresa, y el candado de
 * `mutatingRoute` cierra por defecto toda escritura a esas cuentas. Sin la opción, la ruta bloqueaba a
 * la única persona que debe usarla (pasó en producción: la empresa verificada recibía «puede mirarlo
 * todo, pero no participar»). Pagar su propia publicidad no es participar; las barreras de dentro
 * siguen: sin empresa, 404; sin verificar, 403.
 *
 * LA `metadata` ES EL PUENTE con el webhook: Stripe la devuelve al confirmar, y de ahí sale a quién
 * abonar y qué. NO ABONA NADA: abrir un pago no es haber cobrado.
 *
 * EL NÚMERO FISCAL SE PIDE EN EL CHECKOUT (`tax_id_collection`), con la dirección de facturación, para
 * que quede en el cliente de Stripe y en sus documentos; por eso también se crea siempre el cliente.
 */
export const POST = mutatingRoute(
  async (req, { env, prisma }) => {
    const { requireEmpresa, SinEmpresa } = await import("@/server/auth/empresa-actual");
    const { AuthError } = await import("@/server/auth/rbac");
    const { rateLimit } = await import("@/server/security/rate-limit");
    const { clienteStripe, PagosNoDisponibles } = await import("@/server/pagos/stripe");
    const { puedeOperarEmpresa } = await import("@/lib/empresa");

    let ambito;
    try {
      ambito = await requireEmpresa();
    } catch (e) {
      if (e instanceof SinEmpresa) return apiError("NOT_FOUND", "No encontrado.", 404);
      if (e instanceof AuthError && e.code === "EMAIL_NOT_VERIFIED") {
        return apiError("EMAIL_NOT_VERIFIED", "Confirma tu correo para comprar créditos.", 403);
      }
      throw e;
    }
    if (!puedeOperarEmpresa(ambito.estado)) {
      return apiError("EMPRESA_NO_VERIFICADA", MSG_CREDITOS_SIN_VERIFICAR, 403);
    }

    const cuerpo = CuerpoSchema.safeParse(await req.json().catch(() => null));
    if (!cuerpo.success) return apiError("VALIDATION", "Elige un paquete válido.", 400);
    const paquete = PAQUETES_CREDITOS[cuerpo.data.packageId];

    const rl = await rateLimit(prisma, {
      key: `creditos:checkout:${rateLimitKey(env.AUTH_SECRET, ambito.empresaId)}`,
      ...RATE_LIMITS.CREDITOS_CHECKOUT_PER_EMPRESA,
    });
    if (!rl.allowed)
      return apiError("RATE_LIMITED", "Demasiados intentos. Espera un momento.", 429);

    // El correo de la cuenta: rellena el Checkout y es adonde Stripe manda el recibo.
    const email =
      (await prisma.user.findUnique({ where: { id: ambito.user.userId }, select: { email: true } }))
        ?.email ?? null;

    try {
      const stripe = clienteStripe(env.STRIPE_SECRET_KEY);
      const sesion = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: DEFAULT_CURRENCY.toLowerCase(),
              // El importe NO sale del cliente: el precio del catálogo.
              unit_amount: paquete.precioCents,
              product_data: { name: `${paquete.creditos} créditos de publicidad` },
            },
          },
        ],
        metadata: { empresaId: ambito.empresaId, packageId: cuerpo.data.packageId },
        customer_creation: "always",
        ...(email ? { customer_email: email } : {}),
        billing_address_collection: "required",
        tax_id_collection: { enabled: true },
        // El recibo de Stripe se manda a su correo y queda descargable desde el portal.
        ...(email ? { payment_intent_data: { receipt_email: email } } : {}),
        success_url: `${env.APP_URL}/empresa/creditos?compra=ok`,
        cancel_url: `${env.APP_URL}/empresa/creditos?compra=cancelada`,
      });
      if (!sesion.url) {
        console.error(`[creditos] Stripe no devolvió URL para la sesión ${sesion.id}`);
        return apiError("PAGO_NO_DISPONIBLE", MSG_CREDITOS_PAGO_NO_DISPONIBLE, 503);
      }
      return apiOk({ url: sesion.url });
    } catch (e) {
      // Sin claves o Stripe caído: copy humano fuera, detalle al log (ni el nombre de la variable).
      const porConfig = e instanceof PagosNoDisponibles;
      console.error(
        `[creditos] abrir pago de ${ambito.empresaId}: ${e instanceof Error ? e.message : e}`,
      );
      return apiError(
        porConfig ? "PAGO_NO_CONFIGURADO" : "PAGO_NO_DISPONIBLE",
        MSG_CREDITOS_PAGO_NO_DISPONIBLE,
        503,
      );
    }
  },
  { cuentaEmpresa: "permite" },
);
