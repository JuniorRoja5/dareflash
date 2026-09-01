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
