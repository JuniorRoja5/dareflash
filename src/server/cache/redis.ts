/**
 * CONEXIÓN a Redis, compartida por todo lo que la necesite (caché de búsqueda, marca de "visto"…).
 *
 * UNA SOLA por proceso: antes cada consumidor construía la suya, así que dos usos habrían abierto dos
 * conexiones a la misma instancia sin motivo. Se memoiza en el módulo.
 *
 * `null` cuando no hay `REDIS_URL`. Redis es OPCIONAL en este despliegue a propósito (ver env.ts y
 * CLAUDE.md: "Redis está montado pero sin usar para nada crítico; MariaDB es la fuente de verdad"), y
 * ese `null` es el contrato que obliga a cada consumidor a decidir CÓMO degrada sin Redis. No se lanza
 * una excepción: que falte Redis no puede tumbar nada.
 *
 * `lazyConnect` + sin cola offline + 1 reintento: si Redis no está, las operaciones fallan RÁPIDO en
 * vez de colgar la petición esperando una conexión que no va a llegar.
 */
import "server-only";

import Redis from "ioredis";

import { env } from "@/config/env";

let memo: Redis | null | undefined;

export function getRedis(): Redis | null {
  if (memo !== undefined) return memo;
  const url = env.REDIS_URL;
  if (!url) {
    memo = null;
    return memo;
  }
  const redis = new Redis(url, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
  });
  // Un error de conexión NO debe tumbar el proceso: cada consumidor captura sus propias operaciones.
  redis.on("error", () => {});
  memo = redis;
  return memo;
}

/**
 * ESPERA A QUE LA CONEXIÓN ESTÉ LISTA, con tope, y dice si lo está. Para quien va a usar Redis
 * NADA MÁS ARRANCAR (el worker, en su primera pasada).
 *
 * ┌─ POR QUÉ: LA PRIMERA ORDEN FALLABA SIEMPRE (reproducido, 19 nov) ──────────────────────────────┐
 * │ Con `lazyConnect` la conexión la abre la PRIMERA orden; y sin cola offline, esa misma orden se  │
 * │ rechaza al instante mientras el estado es `connecting` («Stream isn't writeable and            │
 * │ enableOfflineQueue options is false»). Medio segundo después funciona. El worker hace su       │
 * │ primera pasada justo al arrancar, así que el aforo y las cifras de publicidad fallaban EN CADA │
 * │ ARRANQUE, estuviera Redis listo o no, y el aforo no se reintentaba hasta una hora después.     │
 * │ No se resuelve activando la cola offline: entonces, con Redis caído, cada petición esperaría   │
 * │ una conexión que no llega, que es justo lo que estas opciones evitan.                          │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * `false` si no hay Redis, si no conecta en `topeMs`, o si falla: el que llama sigue igual que antes
 * (cada tarea ya sabe degradar sin Redis). Nunca lanza.
 */
export async function esperarRedisListo(topeMs = 5_000): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;
  if (redis.status === "ready") return true;
  try {
    const listo = new Promise<boolean>((resolve) => {
      redis.once("ready", () => resolve(true));
    });
    if (redis.status === "wait") void redis.connect().catch(() => undefined);
    const tope = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), topeMs));
    return await Promise.race([listo, tope]);
  } catch {
    return false;
  }
}
