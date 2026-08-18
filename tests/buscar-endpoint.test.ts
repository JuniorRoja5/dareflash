/**
 * GET /api/buscar — CON DIENTES: responde SIN sesión (búsqueda pública); el DTO NO filtra campos
 * privados (email); el rate-limit por IP corta; el keyset funciona A TRAVÉS del endpoint (paginar cubre
 * todo sin repetir). La caché va en modo NULO (sin REDIS_URL) -> aquí se ejercita la ruta contra la BD.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";

import { createTestPrisma, resetDb } from "./helpers/db";

const SECRET = "TEST-FIXTURE-buscar-endpoint-secret-largo-1";

const H = vi.hoisted(() => ({ prisma: null as unknown as PrismaClient }));
vi.mock("@/server/db/client", () => ({
  get prisma() {
    return H.prisma;
  },
}));
vi.mock("@/config/env", () => ({
  env: { AUTH_SECRET: SECRET, REDIS_URL: undefined },
}));

import { GET } from "../src/app/api/buscar/route";

let prisma: PrismaClient;

beforeAll(() => {
  prisma = createTestPrisma();
  H.prisma = prisma;
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
});

async function crearUsuario(o: {
  username: string;
  displayName?: string;
  email?: string;
  score?: number;
}): Promise<void> {
  await prisma.user.create({
    data: {
      username: o.username,
      displayName: o.displayName ?? null,
      email: o.email ?? null,
      scoreAutoridad: o.score ?? 0,
      passwordHash: "x",
    },
  });
}

function reqBuscar(params: Record<string, string>, ip = "203.0.113.9"): Request {
  const u = new URL("http://test.local/api/buscar");
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return new Request(u, { headers: { "X-Real-IP": ip } });
}

describe("GET /api/buscar", () => {
  it("responde SIN sesión (200) con resultados públicos", async () => {
    await crearUsuario({ username: "publicoana", displayName: "Ana" });
    const res = await GET(reqBuscar({ q: "ana", tipo: "usuarios" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: { username: string }[] };
    expect(body.items.map((u) => u.username)).toContain("publicoana");
  });

  it("valida: q < 2 o tipo inválido -> 400 con copy humano", async () => {
    expect((await GET(reqBuscar({ q: "a", tipo: "usuarios" }))).status).toBe(400);
    expect((await GET(reqBuscar({ q: "ana", tipo: "otro" }))).status).toBe(400);
  });

  it("limite (sugerencias): acota el nº de resultados; fuera de [1,20] -> 400", async () => {
    for (let i = 0; i < 4; i++) await crearUsuario({ username: `anauser${i}`, displayName: "Ana" });
    const res = await GET(reqBuscar({ q: "ana", tipo: "usuarios", limite: "2" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[] };
    expect(body.items.length).toBeLessThanOrEqual(2);
    // Un limite absurdo se rechaza (no se sirve más de lo permitido).
    expect((await GET(reqBuscar({ q: "ana", tipo: "usuarios", limite: "9999" }))).status).toBe(400);
  });

  it("el DTO NO filtra campos privados (email fuera)", async () => {
    await crearUsuario({ username: "publicoana", displayName: "Ana", email: "sec@test.com" });
    const res = await GET(reqBuscar({ q: "ana", tipo: "usuarios" }));
    const body = (await res.json()) as { items: Record<string, unknown>[] };
    expect(JSON.stringify(body)).not.toContain("sec@test.com");
    expect(Object.keys(body.items[0]!).sort()).toEqual(["displayName", "id", "image", "username"]);
  });

  it("rate-limit por IP: agotado el cubo -> 429", async () => {
    const ip = "198.51.100.7";
    const { clientIpKey } = await import("../src/server/http/api");
    const { rateLimit } = await import("../src/server/security/rate-limit");
    const { RATE_LIMITS } = await import("../src/config/constants");
    const key = `buscar:ip:${clientIpKey(reqBuscar({}, ip), SECRET)}`;
    for (let i = 0; i < RATE_LIMITS.BUSCAR_PER_IP.limit; i++) {
      await rateLimit(prisma, { key, ...RATE_LIMITS.BUSCAR_PER_IP });
    }
    const res = await GET(reqBuscar({ q: "ana", tipo: "usuarios" }, ip));
    expect(res.status).toBe(429);
  });

  it("keyset a través del endpoint: paginar cubre TODOS sin repetir", async () => {
    const total = 21; // > BUSCAR_LIMITE (20): fuerza una segunda página
    for (let i = 0; i < total; i++) {
      await crearUsuario({ username: `pref${String(i).padStart(2, "0")}`, score: i });
    }
    const vistos: string[] = [];
    let cursor: string | undefined;
    for (let p = 0; p < 5; p++) {
      const params: Record<string, string> = { q: "pref", tipo: "usuarios" };
      if (cursor) params.cursor = cursor;
      const res = await GET(reqBuscar(params, `10.0.0.${p}`)); // IP distinta por pagina: no toca el rate-limit
      const body = (await res.json()) as {
        items: { username: string }[];
        proximoCursor: string | null;
      };
      vistos.push(...body.items.map((u) => u.username));
      if (!body.proximoCursor) break;
      cursor = body.proximoCursor;
    }
    expect(vistos).toHaveLength(total);
    expect(new Set(vistos).size).toBe(total);
  });
});
