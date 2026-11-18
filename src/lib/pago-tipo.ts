import { METADATA_TIPO_PAGO, type TipoPago, VALORES_TIPO_PAGO } from "@/config/constants";
import { esUnoDe } from "@/lib/valores";

/**
 * DE QUÉ PRODUCTO ES UN PAGO, leído de la `metadata` que pusimos al abrirlo (Fase 11 · PW).
 *
 * ┌─ POR QUÉ HACE FALTA ──────────────────────────────────────────────────────────────────────────┐
 * │ Stripe manda a CADA endpoint todos los eventos del tipo al que está suscrito, sean de la      │
 * │ compra que sean: el `checkout.session.completed` de una compra de créditos llega también al   │
 * │ webhook de Boost (el 13 nov escribió «sin metadata de compra» por eso), y el de un alta de VIP │
 * │ llega a los dos. Antes, cada webhook reconocía lo suyo porque los NOMBRES de los campos no     │
 * │ coincidían (`userId` frente a `empresaId`): una convención, no una protección. El día que una │
 * │ compra de créditos llevara también `userId` —quién de la empresa pagó, por ejemplo—, Boost la  │
 * │ habría intentado abonar. Ahora el tipo va escrito y manda él.                                 │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Devuelve:
 *  - el TIPO, si la metadata lo trae y es del catálogo;
 *  - `"desconocido"` si trae un `tipo` que no es del catálogo;
 *  - `null` si no trae `tipo`.
 * En los dos últimos casos el pago no es de NADIE: ningún webhook abona y ninguno escribe en el log.
 *
 * ┌─ SIN TIPO NO SE DEDUCE NADA DE LA FORMA, a propósito ─────────────────────────────────────────┐
 * │ Se podría adivinar por los campos (`plan` → VIP, `empresaId` → créditos, `userId` → Boost),   │
 * │ pero eso ES la convención que esta pieza retira: decidir de quién es un pago por cómo se      │
 * │ llaman sus campos. Las sesiones y suscripciones de antes, sin tipo, eran todas de prueba      │
 * │ (confirmado en Stripe el 18 nov) y las suscripciones VIP de prueba se cancelan a mano: no     │
 * │ queda nada real en vuelo que haya que reconocer. Un pago nuevo sin tipo es un fallo nuestro   │
 * │ al abrirlo, y `conTipo` es el único sitio que lo escribe.                                     │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export function tipoDePago(
  metadata: Record<string, string> | null | undefined,
): TipoPago | "desconocido" | null {
  const escrito = metadata?.[METADATA_TIPO_PAGO];
  if (escrito === undefined) return null;
  return esUnoDe(VALORES_TIPO_PAGO, escrito) ? escrito : "desconocido";
}

/** La `metadata` con su tipo, para abrir un pago. Un solo sitio que escribe la clave. */
export function conTipo<T extends Record<string, string>>(
  tipo: TipoPago,
  metadata: T,
): T & Record<typeof METADATA_TIPO_PAGO, TipoPago> {
  return { ...metadata, [METADATA_TIPO_PAGO]: tipo } as T &
    Record<typeof METADATA_TIPO_PAGO, TipoPago>;
}
