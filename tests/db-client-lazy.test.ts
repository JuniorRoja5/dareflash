import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Invariante que JUSTIFICA todo el Proxy: importar src/server/db/client.ts NO debe
 * construir el cliente ni leer `env`; el primer acceso a una propiedad SI. Si esto no
 * estuviera probado, la proxima refactorizacion podria volver a construir el cliente en
 * ambito de modulo (leyendo env.DATABASE_URL al importar) y romperia el build sin que
 * nadie se entere. `vi.resetModules()` da un `env` y un `client.ts` frescos por test.
 */
const savedEnv = { ...process.env };

function limpiarSingleton() {
  delete (globalThis as unknown as { prisma?: unknown }).prisma;
}

describe("prisma Proxy: pereza", () => {
  beforeEach(() => {
    vi.resetModules(); // reevalua env.ts y client.ts (cache de env limpia)
    limpiarSingleton(); // el singleton vive en globalThis, que resetModules NO limpia
  });
  afterEach(() => {
    process.env = { ...savedEnv };
    limpiarSingleton();
    vi.resetModules();
  });

  it("importar SIN DATABASE_URL no lanza; el primer acceso a una propiedad SI", async () => {
    process.env["APP_URL"] = "https://x.test";
    process.env["AUTH_SECRET"] = "x".repeat(32);
    delete process.env["DATABASE_URL"];

    // Importar NO construye el cliente ni lee env -> no lanza aunque falte DATABASE_URL.
    const mod = await import("../src/server/db/client");
    expect(mod.prisma).toBeDefined();

    // El primer acceso REAL materializa el cliente, que lee env.DATABASE_URL -> lanza.
    expect(() => mod.prisma.$queryRaw).toThrow(/DATABASE_URL/);
  });
});
