import "server-only";

import { PLAN_VIP } from "@/config/constants";
import type { PrismaClient } from "@/generated/prisma/client";
import { esVipActivo, resolverVip, type VipResuelto } from "@/lib/vip";
import type { Db } from "@/server/db/types";

/**
 * LA SUSCRIPCIÓN VIP, VISTA DESDE EL SERVIDOR — y el ÚNICO camino por el que un beneficio pregunta
 * si alguien es VIP.
 *
 * ┌─ UN SOLO CHOKEPOINT, Y POR QUÉ IMPORTA TANTO ────────────────────────────────────────────────┐
 * │ Son SIETE beneficios (sello, color, borde, boost semanal, toque, retos exclusivos…) y cada   │
 * │ uno es una oportunidad de preguntarlo a su manera. En cuanto dos sitios decidan "quién es    │
 * │ VIP" por su cuenta, uno de los dos se quedará mirando el estado en vez del periodo —y        │
 * │ entonces alguien que canceló hace tres meses conserva el sello en los comentarios mientras   │
 * │ el resto de la app ya no le da nada—. Un desacuerdo así no falla: se ve raro, y nadie sabe   │
 * │ cuál de los dos tiene razón.                                                                  │
 * │                                                                                               │
 * │ Todo pasa por aquí, y lo que decide es `esVipActivo`, que es puro y está probado solo.        │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * EL RELOJ SE INYECTA en todas: un beneficio que se mira "ahora" en una petición larga tiene que
 * poder mirarse en un instante fijo desde un test, y es la única forma de probar el día después.
 */

/** Lo mínimo para decidir: nada más sale de la tabla si nadie lo necesita. */
const CAMPOS = {
  estado: true,
  periodoFin: true,
  canceladaEn: true,
} as const;

/** ¿Es VIP esta persona, ahora? La pregunta de UNO. */
export async function esVipActivoDe(
  db: Db,
  userId: string,
  ahora: Date = new Date(),
): Promise<boolean> {
  const s = await db.subscription.findUnique({ where: { userId }, select: CAMPOS });
  return esVipActivo(s, ahora);
}

/** Lo mismo, con el detalle que necesita una pantalla (hasta cuándo, si se va a renovar). */
export async function vipDe(
  db: Db,
  userId: string,
  ahora: Date = new Date(),
): Promise<VipResuelto> {
  const s = await db.subscription.findUnique({ where: { userId }, select: CAMPOS });
  return resolverVip(s, ahora);
}

/**
 * QUIÉNES DE ESTOS SON VIP — en UNA consulta.
 *
 * Existe antes de que haga falta porque la alternativa se escribe sola: el feed, el ranking y los
 * comentarios pintan veinte personas por pantalla, y preguntar de una en una son veinte consultas
 * por render. La forma de que eso no pase es que exista esta y sea la cómoda.
 *
 * Devuelve un `Set` de ids, que es lo que una lista necesita: `vips.has(u.id)`.
 */
export async function vipsActivosEntre(
  db: Db,
  userIds: readonly string[],
  ahora: Date = new Date(),
): Promise<Set<string>> {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (ids.length === 0) return new Set();

  // El filtro por fecha va EN LA CONSULTA: traer las vencidas para descartarlas en memoria sería
  // pedir filas que no se van a usar. El estado se resuelve con la función pura, que es la que
  // manda, así que aquí se traen todas las del grupo y decide ella.
  const filas = await db.subscription.findMany({
    where: { userId: { in: ids }, periodoFin: { gt: ahora } },
    select: { userId: true, estado: true, periodoFin: true },
  });

  return new Set(filas.filter((f) => esVipActivo(f, ahora)).map((f) => f.userId));
}

/**
 * CREA O ACTUALIZA la suscripción de alguien con lo que dice Stripe.
 *
 * ┌─ `periodoFin` SE ESCRIBE EN ABSOLUTO, NUNCA SUMANDO UN MES ──────────────────────────────────┐
 * │ La fecha viene de Stripe (`current_period_end`), así que reprocesar el mismo evento deja la  │
 * │ MISMA fecha. Si en vez de eso se sumara un mes al valor guardado, cada reentrega del webhook │
 * │ —que Stripe hace cuando duda de nuestra respuesta— regalaría otro mes de VIP, y nadie lo     │
 * │ notaría hasta mirar por qué alguien lleva año y medio suscrito pagando tres meses. Es la      │
 * │ misma razón por la que los agregados del ranking se escriben con el valor recontado y no con │
 * │ `increment`: una escritura absoluta es idempotente por construcción.                          │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * UNA FILA POR PERSONA (`userId` es único): resuscribirse actualiza la que hay. Dos filas serían
 * dos verdades sobre el mismo acceso, y la consulta se quedaría con cualquiera de las dos.
 */
export async function registrarSuscripcion(
  db: PrismaClient,
  datos: {
    userId: string;
    estado: string;
    periodoFin: Date;
    canceladaEn?: Date | null;
    stripeCustomerId?: string | null;
    stripeSubscriptionId?: string | null;
  },
): Promise<void> {
  const comun = {
    plan: PLAN_VIP,
    estado: datos.estado,
    periodoFin: datos.periodoFin,
    canceladaEn: datos.canceladaEn ?? null,
    ...(datos.stripeCustomerId ? { stripeCustomerId: datos.stripeCustomerId } : {}),
    ...(datos.stripeSubscriptionId ? { stripeSubscriptionId: datos.stripeSubscriptionId } : {}),
  };
  await db.subscription.upsert({
    where: { userId: datos.userId },
    create: { userId: datos.userId, ...comun },
    update: comun,
  });
}
