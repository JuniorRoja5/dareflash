import { ESTADOS_SIN_ACCESO_VIP, type EstadoSuscripcion } from "@/config/constants";

/**
 * ¿ES VIP AHORA MISMO? — EL ÚNICO SITIO QUE LO DECIDE.
 *
 * ┌─ POR QUÉ SE CALCULA Y NUNCA SE GUARDA ───────────────────────────────────────────────────────┐
 * │ Un `esVip: true` en la fila del usuario se queda PEGADO. Alguien cancela, o Stripe deja de    │
 * │ cobrar, o un webhook se pierde —y ese booleano sigue regalando sello dorado, color de nombre  │
 * │ y un boost a la semana, indefinidamente y sin que nada falle—. Un flag no caduca; una FECHA   │
 * │ sí. Por eso lo que se guarda es hasta cuándo está pagado, y esto lo compara con el reloj.     │
 * │                                                                                               │
 * │ Es el mismo patrón que el resto del producto: si un reto está cerrado se resuelve mirando su  │
 * │ `expiresAt`, no un campo que alguien tuvo que acordarse de escribir.                          │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * CANCELAR NO ES CORTAR. Una suscripción `CANCELADA` sigue dando acceso hasta `periodoFin`: está
 * pagada hasta esa fecha y eso es lo prometido (sin prorrateo y sin reembolso). Lo único que quita
 * el acceso por sí mismo es `CORTADA` —devolución de cargo, fraude—, y esa lista se declara en
 * `constants` para que un estado nuevo obligue a DECIDIR si corta, en vez de heredar un "pasa".
 *
 * PURA Y CON EL RELOJ INYECTABLE: así se puede probar el día después de la fecha sin esperar un mes,
 * que es justo el caso que un booleano guardado no distingue.
 */
export interface SuscripcionVip {
  estado: string;
  periodoFin: Date;
}

export function esVipActivo(
  suscripcion: SuscripcionVip | null | undefined,
  ahora: Date = new Date(),
): boolean {
  if (!suscripcion) return false;
  if ((ESTADOS_SIN_ACCESO_VIP as readonly string[]).includes(suscripcion.estado)) return false;
  // ESTRICTAMENTE MAYOR: en el instante exacto del fin, el periodo ya se acabó. Un `>=` regalaría
  // el último milisegundo, que no importa, pero sobre todo haría ambiguo el borde en los tests.
  return suscripcion.periodoFin.getTime() > ahora.getTime();
}

/**
 * Lo que la pantalla necesita saber de una suscripción, ya resuelto. Se devuelve junto para que
 * nadie tenga que recomponerlo —y para que "activo" salga SIEMPRE de `esVipActivo`, no de mirar el
 * estado por su cuenta—.
 */
export interface VipResuelto {
  activo: boolean;
  /** `true` si está activo pero ya no se va a renovar: la pantalla puede decir hasta cuándo. */
  terminaAlFinal: boolean;
  /** Hasta cuándo hay acceso. `null` si nunca lo hubo. */
  hasta: Date | null;
  estado: EstadoSuscripcion | null;
}

/**
 * EL ESTADO DE STRIPE, TRADUCIDO AL NUESTRO. Puro: son cadenas.
 *
 * ┌─ `CORTADA` NO SE LLEGA DESDE AQUÍ, Y ES DELIBERADO ──────────────────────────────────────────┐
 * │ Cortar el acceso a alguien que pagó es una decisión humana —una devolución de cargo, un      │
 * │ fraude—, no un estado que Stripe nos mande. Si el webhook pudiera escribirlo, un `unpaid`    │
 * │ transitorio (una tarjeta que caducó y se reintenta) dejaría a alguien sin VIP a mitad de un  │
 * │ mes que ya pagó. Lo que hace Stripe es dejar de renovar; el acceso lo sigue mandando la      │
 * │ fecha.                                                                                        │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * `cancel_at_period_end` MANDA sobre el estado: una suscripción `active` con la baja pedida es
 * nuestra `CANCELADA` —sigue dando acceso hasta la fecha, pero no se va a renovar—, y eso es lo
 * que la pantalla tiene que poder decir.
 */
export function estadoDesdeStripe(
  estadoStripe: string,
  cancelaAlFinal: boolean,
): EstadoSuscripcion {
  if (cancelaAlFinal) return "CANCELADA";
  // Lo que ya no se va a renovar nunca. El resto —`active`, `trialing`, `past_due`, `incomplete`—
  // es "sigue viva": si de verdad se acabó, lo dirá la FECHA, no esta tabla.
  const TERMINADAS = ["canceled", "unpaid", "incomplete_expired"];
  return TERMINADAS.includes(estadoStripe) ? "CANCELADA" : "ACTIVA";
}

/**
 * EL FIN DE PERIODO que manda Stripe, en segundos, a `Date`. `null` si no viene o no es un número.
 *
 * LO DEVUELVE `null` EN VEZ DE UNA FECHA RARA, y ese es todo el motivo de que exista: desde que
 * `current_period_end` se mudó de la suscripción a sus LÍNEAS (cambio de versión de la API de
 * Stripe), leerlo del sitio de antes da `undefined` — y `new Date(undefined * 1000)` es un
 * `Invalid Date`, que se guarda tan ricamente en la columna y deja a alguien con un VIP que no se
 * sabe cuándo acaba. Mejor no escribir nada y que el webhook lo diga.
 */
export function finDePeriodo(segundos: unknown): Date | null {
  if (typeof segundos !== "number" || !Number.isFinite(segundos) || segundos <= 0) return null;
  const fecha = new Date(segundos * 1000);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

export function resolverVip(
  suscripcion: (SuscripcionVip & { canceladaEn?: Date | null }) | null | undefined,
  ahora: Date = new Date(),
): VipResuelto {
  const activo = esVipActivo(suscripcion, ahora);
  return {
    activo,
    // "Termina al final" solo tiene sentido mientras está activo: en una ya vencida no hay nada que
    // avisar, y decirlo sería contar un futuro que ya pasó.
    terminaAlFinal: activo && suscripcion?.estado === "CANCELADA",
    hasta: suscripcion?.periodoFin ?? null,
    estado: (suscripcion?.estado as EstadoSuscripcion | undefined) ?? null,
  };
}
