/**
 * CONTAR UNA VISITA AL FEED EN EL AFORO (Fase 9 · P5). La pieza que une ubicación y aforo, y la ÚNICA que
 * toca el camino del feed: por eso NO SE ESPERA y NUNCA LANZA — quien la llama hace `void` y sigue
 * pintando —.
 *
 * QUIÉN ES LA PERSONA, para deduplicar: el `userId` si hay sesión (la misma persona en dos dispositivos
 * cuenta una), o la IP HASHEADA con HMAC si es un invitado. Nunca un dato en claro, y el HyperLogLog
 * tampoco lo guarda: solo sirve para no contar dos veces.
 *
 * DÓNDE ESTÁ: con sesión, lo que se guardó en la fila al entrar (sale gratis de la consulta que valida la
 * sesión); de invitado, resuelto y memoizado por IP hasheada (`ubicacionDeInvitado`).
 *
 * LOS VIP NO CUENTAN. El aforo es el PÚBLICO DE LA PUBLICIDAD de una zona, y un VIP no ve publicidad: si
 * contara, la estimación que se le enseña a una empresa antes de pagar (P6) prometería ojos que el
 * anuncio no va a tener. Se excluyen AL CONTAR, no al estimar, para que el dato GUARDADO ya sea el bueno
 * y ninguna lectura futura tenga que acordarse de restarlos. Lo decide el chokepoint (`esVipActivoDe`),
 * no un campo guardado. Un invitado no puede ser VIP: sin sesión no hay suscripción que mirar.
 */
import "server-only";

import type { Ubicacion } from "@/lib/geo";
import type { Db } from "@/server/db/types";
import type { RedisAforo } from "@/server/services/aforo";

import type { RedisMemo } from "./ubicacion";

export async function contarVisitaEnAforo(
  db: Db,
  quien: { userId: string; ubicacion: Ubicacion } | { ip: string },
  /** Inyectables para los tests. `redis` ausente = el del proceso; `null` = sin Redis. */
  deps: { redis?: (RedisAforo & RedisMemo) | null; ahora?: Date } = {},
): Promise<void> {
  try {
    const redis =
      deps.redis !== undefined ? deps.redis : (await import("@/server/cache/redis")).getRedis();
    // Sin Redis no hay dónde contar: ni siquiera se resuelve la ubicación (sería trabajo para nada).
    if (!redis) return;
    const ahora = deps.ahora ?? new Date();
    const { contarEnAforo } = await import("@/server/services/aforo");
    if ("userId" in quien) {
      const { esVipActivoDe } = await import("@/server/services/vip");
      if (await esVipActivoDe(db, quien.userId, ahora)) return;
      await contarEnAforo(redis, { quien: `u:${quien.userId}`, ubicacion: quien.ubicacion, ahora });
      return;
    }
    const { env } = await import("@/config/env");
    const { rateLimitKey } = await import("@/server/http/api");
    const { lectorIp } = await import("./lector-ip");
    const { ubicacionDeInvitado } = await import("./ubicacion");
    const ipHash = rateLimitKey(env.AUTH_SECRET, quien.ip);
    const ubicacion = await ubicacionDeInvitado(
      db,
      { ip: quien.ip, ipHash },
      { lector: await lectorIp(), redis },
    );
    await contarEnAforo(redis, { quien: `i:${ipHash}`, ubicacion, ahora });
  } catch {
    // Se pierde esta visita del aforo. Nada más.
  }
}
