/**
 * CACHÉ de la BÚSQUEDA (Redis). OPCIONAL y DEGRADABLE: si no hay `REDIS_URL`, o si Redis falla, la
 * búsqueda va directa a la BD (nunca se rompe por la caché). Descarga la BD en consultas calientes
 * (mismo q/tipo/cursor) con un TTL corto. Redis ya está montado en el compose.
 */
import "server-only";

import Redis from "ioredis";

import { env } from "@/config/env";

/** Interfaz mínima de caché (inyectable en tests con un doble en memoria). */
export interface CacheBusqueda {
  get(clave: string): Promise<string | null>;
  set(clave: string, valor: string, ttlSec: number): Promise<void>;
}

/** Caché NULA: cuando no hay Redis configurado, todo es miss (la búsqueda va a la BD). */
const cacheNula: CacheBusqueda = {
  async get() {
    return null;
  },
  async set() {
    /* no-op */
  },
};

let memo: CacheBusqueda | null = null;

/**
 * Devuelve la caché de búsqueda: Redis si `REDIS_URL` está configurada, o la caché NULA si no.
 * Memoiza (una conexión por proceso). `lazyConnect` + sin cola offline + 1 reintento: si Redis no está,
 * las operaciones fallan RÁPIDO y `buscarConCache` cae a la BD sin colgar la petición.
 */
export function getCacheBusqueda(): CacheBusqueda {
  if (memo) return memo;
  const url = env.REDIS_URL;
  if (!url) {
    memo = cacheNula;
    return memo;
  }
  const redis = new Redis(url, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
  });
  // Un error de conexión NO debe tumbar el proceso; las operaciones se capturan en `buscarConCache`.
  redis.on("error", () => {});
  memo = {
    get: (clave) => redis.get(clave),
    async set(clave, valor, ttlSec) {
      await redis.set(clave, valor, "EX", ttlSec);
    },
  };
  return memo;
}

/**
 * Sirve `clave` de la caché o, si es MISS (o Redis falla), ejecuta `buscar()` y cachea el resultado.
 * Un fallo de Redis (get o set) NO rompe la búsqueda: se cae a `buscar()` / se sirve igual. El valor se
 * guarda serializado (JSON); en un HIT se devuelve el objeto parseado (la respuesta HTTP es idéntica).
 */
export async function buscarConCache<T>(
  cache: CacheBusqueda,
  clave: string,
  ttlSec: number,
  buscar: () => Promise<T>,
): Promise<T> {
  try {
    const hit = await cache.get(clave);
    if (hit !== null) return JSON.parse(hit) as T;
  } catch {
    /* Redis caído en la lectura -> se ignora y se va a la BD */
  }
  const resultado = await buscar();
  try {
    await cache.set(clave, JSON.stringify(resultado), ttlSec);
  } catch {
    /* fallo al cachear -> se sirve el resultado igualmente */
  }
  return resultado;
}
