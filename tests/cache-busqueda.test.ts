/**
 * `buscarConCache` — CON DIENTES: un MISS ejecuta la búsqueda y la cachea; un HIT NO vuelve a
 * ejecutarla (se verifica con un espía, NO se asume); una clave distinta es MISS; y un fallo de Redis
 * (get o set) NO rompe -> cae a la búsqueda / se sirve igual.
 */
import { describe, expect, it, vi } from "vitest";

import { buscarConCache, type CacheBusqueda } from "../src/server/cache/busqueda";

function cacheMemoria(): CacheBusqueda {
  const store = new Map<string, string>();
  return {
    async get(k) {
      return store.get(k) ?? null;
    },
    async set(k, v) {
      store.set(k, v);
    },
  };
}

describe("buscarConCache", () => {
  it("MISS ejecuta + cachea; HIT NO vuelve a consultar", async () => {
    const cache = cacheMemoria();
    const buscar = vi.fn(async () => ({ items: [1, 2], proximoCursor: null }));

    const r1 = await buscarConCache(cache, "k", 30, buscar);
    expect(buscar).toHaveBeenCalledTimes(1);
    expect(r1).toEqual({ items: [1, 2], proximoCursor: null });

    const r2 = await buscarConCache(cache, "k", 30, buscar);
    expect(buscar).toHaveBeenCalledTimes(1); // CACHE HIT: no re-consulta
    expect(r2).toEqual({ items: [1, 2], proximoCursor: null });
  });

  it("una clave distinta es MISS (re-ejecuta)", async () => {
    const cache = cacheMemoria();
    const buscar = vi.fn(async () => ({ ok: true }));
    await buscarConCache(cache, "a", 30, buscar);
    await buscarConCache(cache, "b", 30, buscar);
    expect(buscar).toHaveBeenCalledTimes(2);
  });

  it("un fallo de Redis (get o set) NO rompe: se cae a la búsqueda", async () => {
    const cacheRota: CacheBusqueda = {
      async get() {
        throw new Error("redis down");
      },
      async set() {
        throw new Error("redis down");
      },
    };
    const buscar = vi.fn(async () => ({ ok: 1 }));
    const r = await buscarConCache(cacheRota, "k", 30, buscar);
    expect(r).toEqual({ ok: 1 });
    expect(buscar).toHaveBeenCalledTimes(1);
  });
});
