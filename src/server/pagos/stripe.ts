import "server-only";

import Stripe from "stripe";

/**
 * EL CLIENTE DE STRIPE, construido POR PETICIÓN.
 *
 * ┌─ POR QUÉ PEREZOSO Y NUNCA EN ÁMBITO DE MÓDULO ───────────────────────────────────────────────┐
 * │ `next build` corre SIN ninguna variable de entorno. Un cliente creado al importar leería      │
 * │ `env.STRIPE_SECRET_KEY` durante el build y tumbaría el despliegue. Es la misma regla que ya   │
 * │ obliga a `prisma` a construirse al primer uso y a que nadie lea `env` fuera de una petición.  │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * LAS CLAVES SIGUEN OPCIONALES en `env.ts` a propósito. Promoverlas a obligatorias haría que la app
 * entera —login, feed, todo— no arrancara sin Stripe configurado, y hoy esto está en TEST y tras el
 * pestillo. Se promoverán cuando Boost cobre de verdad. Mientras tanto, faltar una clave se trata
 * AQUÍ: es un fallo de configuración de UNA función, no del producto.
 */
export class PagosNoDisponibles extends Error {
  constructor(quéFalta: string) {
    super(`Falta ${quéFalta} en el entorno.`);
    this.name = "PagosNoDisponibles";
  }
}

/** El cliente, o `PagosNoDisponibles` si no hay clave. Quien llama lo traduce a copy humano. */
export function clienteStripe(secretKey: string | undefined): Stripe {
  if (!secretKey) throw new PagosNoDisponibles("STRIPE_SECRET_KEY");
  // Sin fijar `apiVersion`: se usa la que el SDK trae por defecto, que es la que su tipado conoce.
  // Clavar aquí una cadena de versión que el SDK no espere es un error de compilación en cada
  // actualización, y la versión real de la cuenta se fija en el panel de Stripe, no en el código.
  return new Stripe(secretKey);
}

/**
 * Comprueba la firma de Stripe sobre el cuerpo CRUDO y devuelve el evento.
 *
 * EL CUERPO TIENE QUE SER EL TEXTO TAL CUAL LLEGÓ. La firma se calcula sobre esos bytes exactos:
 * parsearlo a JSON y volver a serializarlo cambia espacios y orden, y la firma deja de cuadrar —
 * con el agravante de que el fallo parecería "Stripe manda firmas malas" en vez de "lo tocamos".
 *
 * ESTA ES LA ÚNICA AUTENTICACIÓN DEL WEBHOOK. No hay sesión, ni Origin, ni CSRF: lo llama Stripe,
 * no un navegador. Si esto se salta, cualquiera puede regalarse boosts con un `curl`.
 *
 * ┌─ EL SECRETO LLEGA POR PARÁMETRO, Y SU NOMBRE TAMBIÉN ───────────────────────────────────────┐
 * │ Hay UNO POR ENDPOINT: cada webhook se da de alta aparte en Stripe y cada uno firma con el   │
 * │ suyo. Esta función no puede elegirlo —no sabe quién la llama—, así que lo recibe; y recibe  │
 * │ además CÓMO SE LLAMA, porque si falta, el log de "falta configuración" tiene que nombrar la │
 * │ variable que de verdad falta. Con el nombre clavado aquí, al añadir el segundo secreto el   │
 * │ error habría mandado a mirar el de Boost, que estaba perfectamente puesto.                   │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export function eventoVerificado(
  stripe: Stripe,
  cuerpoCrudo: string,
  firma: string | null,
  secretoWebhook: string | undefined,
  /** Nombre de la variable de entorno, SOLO para el mensaje de error. */
  nombreSecreto = "STRIPE_WEBHOOK_SECRET",
): Stripe.Event {
  if (!secretoWebhook) throw new PagosNoDisponibles(nombreSecreto);
  // Sin cabecera de firma se lanza un Error normal y no el del SDK: quien llama trata TODO lo que
  // no sea falta de configuración como firma inválida, así que construir el error tipado de Stripe
  // solo ataría este fichero a la forma de su constructor, que cambia entre versiones mayores.
  if (!firma) throw new Error("Falta la cabecera de firma de Stripe.");
  return stripe.webhooks.constructEvent(cuerpoCrudo, firma, secretoWebhook);
}
