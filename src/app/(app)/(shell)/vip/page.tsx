import { redirect } from "next/navigation";

import { MSG_VIP_PAGO_NO_DISPONIBLE, MSG_VIP_SIN_VERIFICAR } from "@/config/constants";

import { AvisoSuscripcion, type EstadoVuelta } from "./aviso-suscripcion";
import { BeneficiosVip } from "./beneficios-vip";
import { CtaVip } from "./cta-vip";
import { HeroVip } from "./hero-vip";
import { TarjetaEresVip } from "./tarjeta-eres-vip";

export const metadata = { title: "VIP Mythic · DareFlash" };
// Lee la sesión y la suscripción: por petición, nunca cacheada.
export const dynamic = "force-dynamic";

/**
 * /vip — QUÉ ES MYTHIC, QUÉ CUESTA Y CÓMO SE ENTRA (o cómo se sale).
 *
 * ┌─ A ANCHO COMPLETO, SIN COLUMNA CENTRADA ─────────────────────────────────────────────────────┐
 * │ Las pantallas de "mi cuenta" (/puntos, /referidos, /boosts) van en una columna de 5xl        │
 * │ centrada porque son listas largas que se leen renglón a renglón. Esta no: es una pantalla de │
 * │ producto, y los beneficios se reparten en rejilla —a 1280 px caben tres por fila en vez de    │
 * │ dos y media—. La maqueta llevaba un `max-width: 860px` que aquí NO se copia: con la barra     │
 * │ lateral ya quitándole 232 px, esa caja deja medio escritorio vacío a la derecha.              │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ QUIÉN DICE QUE ALGUIEN ES VIP ──────────────────────────────────────────────────────────────┐
 * │ `vipDe` -> `esVipActivo`, el chokepoint, y SOLO él. El `?suscripcion=ok` con el que vuelve    │
 * │ Stripe es texto en una barra de direcciones: pinta un MENSAJE y no decide nada. Elegir la     │
 * │ tarjeta de "eres Mythic" con ese parámetro le daría el estado de pago a cualquiera que        │
 * │ tecleara la URL —y, peor, se lo quitaría a un VIP de verdad que llegara sin él—.              │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * LAS DOS PUERTAS DE PAGO SON LAS MISMAS QUE LAS DE BOOST, literalmente: pagos configurados y
 * correo verificado, en ese orden (si no hay claves, da igual el correo: no hay nada que intentar).
 * `tests/vip-pagina` compara las dos expresiones carácter a carácter contra `/boosts`, así que si
 * una de las dos pantallas cambia de criterio, la otra cae en rojo en vez de divergir en silencio.
 * Es UX: la barrera de verdad la vuelve a poner `/api/vip/checkout`.
 *
 * EXIGE SESIÓN, resuelta en el servidor: sin un "mí" no se sabe si enseñar el botón de suscribirse
 * o el de darse de baja. Quien llega sin sesión vuelve aquí después de entrar.
 *
 * `env` Y `prisma` SE LEEN DENTRO DE LA FUNCIÓN, nunca en ámbito de módulo: el build corre SIN
 * variables y leerlos arriba tumbaría el despliegue (ver CLAUDE.md).
 */
export default async function VipPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { getCurrentUser } = await import("@/server/auth/current-user");
  const sesion = await getCurrentUser();
  if (!sesion) redirect("/entrar?siguiente=%2Fvip");

  const sp = await searchParams;
  // Solo los dos valores que escribe la ruta de checkout. Cualquier otra cosa en `?suscripcion=`
  // no pinta nada: es un parámetro de la URL, o sea entrada del usuario.
  const vuelta: EstadoVuelta | null =
    sp["suscripcion"] === "ok" ? "ok" : sp["suscripcion"] === "cancelada" ? "cancelada" : null;

  const { prisma } = await import("@/server/db/client");
  const { env } = await import("@/config/env");
  const { vipDe } = await import("@/server/services/vip");

  const vip = await vipDe(prisma, sesion.userId);

  const pagosConfigurados = Boolean(env.STRIPE_SECRET_KEY);
  const correoVerificado = sesion.emailVerified !== null;
  const puedeSuscribirse = pagosConfigurados && correoVerificado;
  // EL ORDEN IMPORTA: si los pagos no están puestos, da igual el correo — no hay nada que intentar.
  const motivoBloqueo = !pagosConfigurados
    ? MSG_VIP_PAGO_NO_DISPONIBLE
    : !correoVerificado
      ? MSG_VIP_SIN_VERIFICAR
      : null;

  return (
    <div className="df-rise w-full px-4 py-8 lg:px-8 lg:py-12">
      {/* LA VUELTA DE STRIPE, ARRIBA DE TODO: es la respuesta a "¿se ha cobrado?", y esa pregunta
          va antes que cualquier otra cosa de la pantalla. */}
      {vuelta ? (
        <div className="mb-6">
          <AvisoSuscripcion estado={vuelta} />
        </div>
      ) : null}

      <HeroVip />

      <BeneficiosVip />

      {/* LA ÚNICA DECISIÓN DE ESTADO DE LA PÁGINA, y la toma el chokepoint. Ver la cabecera. */}
      {vip.activo ? (
        <TarjetaEresVip vip={vip} />
      ) : (
        <CtaVip puedeSuscribirse={puedeSuscribirse} motivoBloqueo={motivoBloqueo} />
      )}
    </div>
  );
}
