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
 *  - `"desconocido"` si trae un `tipo` que no es del catálogo: no es de nadie, nadie abona;
 *  - el tipo DEDUCIDO de la forma antigua, si no trae `tipo` (ver abajo);
 *  - `null` si no trae `tipo` ni tiene la forma de ninguna compra nuestra.
 *
 * ┌─ COMPATIBILIDAD: LAS SESIONES DE ANTES NO LLEVAN TIPO ────────────────────────────────────────┐
 * │ Para ellas se deduce de la forma que tenían, que es DISJUNTA entre productos:                 │
 * │   vip      → `plan` (sesión y suscripción)                                                    │
 * │   creditos → `empresaId` + `packageId`                                                        │
 * │   boost    → `userId` + `packageId`, y nada de lo anterior                                     │
 * │ Así una sesión pagada antes del cambio y aún sin abonar (un reenvío de Stripe, uno manual     │
 * │ desde el panel) SE ABONA, y no puede abonarse dos veces: la clave de idempotencia sigue siendo │
 * │ la de la sesión, que no ha cambiado. Un `tipo` escrito gana SIEMPRE a la forma.                │
 * │                                                                                               │
 * │ Se puede retirar cuando ya no quede nada sin tipo. En Checkout eso es pronto (una sesión      │
 * │ caduca en 24 h y Stripe reintenta 3 días); en VIP NO, porque la metadata de la SUSCRIPCIÓN se  │
 * │ fija al crearla y viaja en cada renovación: una suscripción de antes sigue llegando sin tipo.  │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export function tipoDePago(
  metadata: Record<string, string> | null | undefined,
): TipoPago | "desconocido" | null {
  const m = metadata ?? {};
  const escrito = m[METADATA_TIPO_PAGO];
  if (escrito !== undefined) return esUnoDe(VALORES_TIPO_PAGO, escrito) ? escrito : "desconocido";

  // Sin tipo: la forma antigua. El orden importa poco porque las formas son disjuntas, pero va de la
  // más específica a la menos: `userId` + `packageId` no basta para decir Boost si hay algo más.
  if (m["plan"]) return "vip";
  if (m["empresaId"] && m["packageId"]) return "creditos";
  if (m["userId"] && m["packageId"]) return "boost";
  return null;
}

/** La `metadata` con su tipo, para abrir un pago. Un solo sitio que escribe la clave. */
export function conTipo<T extends Record<string, string>>(
  tipo: TipoPago,
  metadata: T,
): T & Record<typeof METADATA_TIPO_PAGO, TipoPago> {
  return { ...metadata, [METADATA_TIPO_PAGO]: tipo } as T &
    Record<typeof METADATA_TIPO_PAGO, TipoPago>;
}
