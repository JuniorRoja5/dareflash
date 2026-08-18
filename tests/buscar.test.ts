/**
 * BÚSQUEDA (A1 + P3: parciales de palabra) — usuarios y retos, CON DIENTES contra la BD real:
 *  - ORDEN: match exacto > prefijo > relevancia FULLTEXT > scoreAutoridad DESC > id (el score NO
 *    invierte la exactitud).
 *  - KEYSET: paginar cubre TODOS sin repetir ni saltar.
 *  - PARCIALES: prefijo indexado (username/displayName/title) + FULLTEXT BOOLEAN word-prefix (`sal*`).
 *  - Consulta CORTA (<3): prefijo indexado sobre username Y displayName (usuarios) y title (retos).
 *  - SEGURIDAD: operadores de BOOLEAN MODE tratados como literal (no inyectan).
 *  - SOLO PÚBLICOS: fuera borrados/baneados y retos no-PUBLISHED; el DTO no filtra privados.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { generarHandle } from "../src/server/auth/handle";
import type { PrismaClient } from "../src/generated/prisma/client";
import { buscarRetos, buscarUsuarios } from "../src/server/services/buscar";

import { createTestPrisma, resetDb } from "./helpers/db";

let prisma: PrismaClient;

beforeAll(() => {
  prisma = createTestPrisma();
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
});

async function crearUsuario(o: {
  username?: string;
  displayName?: string | null;
  score?: number;
  deletedAt?: Date | null;
  bannedAt?: Date | null;
  image?: string | null;
  email?: string | null;
}): Promise<string> {
  const u = await prisma.user.create({
    data: {
      username: o.username ?? generarHandle(),
      displayName: o.displayName ?? null,
      image: o.image ?? null,
      email: o.email ?? null,
      scoreAutoridad: o.score ?? 0,
      deletedAt: o.deletedAt ?? null,
      bannedAt: o.bannedAt ?? null,
      passwordHash: "x",
    },
    select: { id: true },
  });
  return u.id;
}

async function crearReto(
  creador: string,
  o: { title: string; status?: string; score?: number; prize?: number; deadline?: Date },
): Promise<string> {
  const r = await prisma.challenge.create({
    data: {
      title: o.title,
      category: "fitness",
      status: o.status ?? "PUBLISHED",
      prizeAmountCents: o.prize ?? 0,
      prizeCurrency: "EUR",
      startsAt: new Date("2026-01-01T00:00:00Z"),
      deadline: o.deadline ?? new Date("2026-12-01T00:00:00Z"),
      createdById: creador,
      scoreAutoridad: o.score ?? 0,
    },
    select: { id: true },
  });
  return r.id;
}

describe("buscarUsuarios", () => {
  it("orden: exacto > prefijo > fulltext, aunque el fulltext tenga MÁS score", async () => {
    await crearUsuario({ username: "ana", displayName: "Ana G", score: 0 }); // exacto
    await crearUsuario({ username: "anatomia", displayName: "sin match", score: 500 }); // prefijo
    await crearUsuario({ username: "zzz", displayName: "soy ana la crack", score: 999 }); // fulltext

    const { items } = await buscarUsuarios(prisma, "ana", null);
    expect(items.map((u) => u.username)).toEqual(["ana", "anatomia", "zzz"]);
  });

  it("mismo rango -> scoreAutoridad DESC decide", async () => {
    await crearUsuario({ username: "u1", displayName: "reto fitness", score: 10 });
    await crearUsuario({ username: "u2", displayName: "reto fitness", score: 50 });

    const { items } = await buscarUsuarios(prisma, "fitness", null);
    expect(items.map((u) => u.username)).toEqual(["u2", "u1"]);
  });

  it("keyset: paginar cubre TODOS sin repetir ni saltar", async () => {
    const total = 5;
    for (let i = 0; i < total; i++) await crearUsuario({ username: `pref${i}`, score: i });

    const vistos: string[] = [];
    let cursor: string | null = null;
    for (let p = 0; p < 10; p++) {
      const pagina = await buscarUsuarios(prisma, "pref", cursor, 2);
      expect(pagina.items.length).toBeLessThanOrEqual(2);
      vistos.push(...pagina.items.map((u) => u.username!));
      if (!pagina.proximoCursor) break;
      cursor = pagina.proximoCursor;
    }
    expect(vistos).toHaveLength(total);
    expect(new Set(vistos).size).toBe(total); // sin repetidos
  });

  it("keyset cruza fronteras de ORDEN distinta (exacto/prefijo/fulltext) sin repetir ni saltar", async () => {
    // Mezcla de rangos para "ana": exacto, prefijo y fulltext-only (por displayName). Con limite=1 cada
    // página cruza una frontera de `orden` (DOUBLE) DISTINTA -> fija explícitamente el caso del float.
    await crearUsuario({ username: "ana", displayName: "x", score: 0 }); // exacto (rango 2)
    await crearUsuario({ username: "anabel", displayName: "x", score: 0 }); // prefijo (rango 1)
    await crearUsuario({ username: "z1", displayName: "soy ana", score: 0 }); // fulltext (rango 0)
    await crearUsuario({ username: "z2", displayName: "hola ana", score: 0 }); // fulltext (rango 0)

    const vistos: string[] = [];
    let cursor: string | null = null;
    for (let p = 0; p < 10; p++) {
      const pagina = await buscarUsuarios(prisma, "ana", cursor, 1);
      expect(pagina.items.length).toBeLessThanOrEqual(1);
      vistos.push(...pagina.items.map((u) => u.username!));
      if (!pagina.proximoCursor) break;
      cursor = pagina.proximoCursor;
    }
    expect(vistos).toHaveLength(4);
    expect(new Set(vistos).size).toBe(4); // sin repetidos
    expect(vistos[0]).toBe("ana"); // exacto primero
    expect(vistos[1]).toBe("anabel"); // prefijo segundo
    expect(new Set(vistos.slice(2))).toEqual(new Set(["z1", "z2"])); // fulltext al final
  });

  it("consulta corta (<3): PREFIJO indexado sobre username Y displayName (P3)", async () => {
    await crearUsuario({ username: "an", score: 0 }); // prefijo username
    await crearUsuario({ username: "andres", score: 5 }); // prefijo username
    await crearUsuario({ username: "zzz", displayName: "an cosa", score: 99 }); // prefijo displayName
    await crearUsuario({ username: "xxx", displayName: "no coincide", score: 99 }); // ni uno ni otro

    const { items } = await buscarUsuarios(prisma, "an", null);
    const nombres = items.map((u) => u.username);
    expect(nombres).toEqual(expect.arrayContaining(["an", "andres", "zzz"]));
    expect(nombres).not.toContain("xxx"); // el prefijo NO es un full scan
  });

  it("P3: prefijo corto encuentra 'yuyu' por 'yu' (el caso real destapado)", async () => {
    await crearUsuario({ username: "yuyu", score: 0 });
    const { items } = await buscarUsuarios(prisma, "yu", null);
    expect(items.map((u) => u.username)).toContain("yuyu");
  });

  it("P3: word-prefix BOOLEAN encuentra por PARCIAL de palabra en displayName ('yuy' -> 'yuyu G')", async () => {
    await crearUsuario({ username: "u_a", displayName: "Yuyu Grande", score: 0 });
    const { items } = await buscarUsuarios(prisma, "yuy", null);
    expect(items.map((u) => u.username)).toContain("u_a");
  });

  it("P3 SEGURIDAD: los operadores de BOOLEAN MODE se tratan como LITERAL (no inyectan)", async () => {
    await crearUsuario({ username: "target1", displayName: "salto mortal", score: 0 });
    // El usuario mete operadores de fulltext: se neutralizan; el término es "salto" (word-prefix).
    for (const q of ["sal*", "+sal -x", 'sal")', "@sal"]) {
      const { items } = await buscarUsuarios(prisma, q, null);
      expect(items.map((u) => u.username)).toContain("target1"); // encuentra igual, sin reventar
    }
    // Un término SOLO de operadores no revienta ni devuelve basura.
    await expect(buscarUsuarios(prisma, "+++", null)).resolves.toBeDefined();
  });

  it("solo PÚBLICOS: fuera borrados/baneados; el DTO no lleva campos privados", async () => {
    // NOTA: el caso "sin username" ya no existe -> `username` es NOT NULL (P1), toda cuenta lleva
    // handle. Quedan las exclusiones que SÍ son posibles: borrado (deletedAt) y baneado (bannedAt).
    await crearUsuario({ username: "publico1", displayName: "Ana publica", score: 0 });
    await crearUsuario({
      username: "borrado1",
      displayName: "Ana borrada",
      email: "sec@test.com",
      deletedAt: new Date(),
      score: 100,
    });
    await crearUsuario({
      username: "baneado1",
      displayName: "Ana baneada",
      bannedAt: new Date(),
      score: 100,
    });

    const { items } = await buscarUsuarios(prisma, "ana", null);
    expect(items.map((u) => u.username)).toEqual(["publico1"]);
    expect(Object.keys(items[0]!).sort()).toEqual(["displayName", "id", "image", "username"]);
    expect(JSON.stringify(items)).not.toContain("sec@test.com");
  });
});

describe("buscarRetos", () => {
  it("solo PUBLISHED; orden exacto > fulltext", async () => {
    const creador = await crearUsuario({ username: "creador1" });
    await crearReto(creador, { title: "Reto de baile", status: "PUBLISHED", score: 0 });
    await crearReto(creador, { title: "baile", status: "PUBLISHED", score: 999 });
    await crearReto(creador, { title: "baile secreto", status: "DRAFT", score: 999 });

    const { items } = await buscarRetos(prisma, "baile", null);
    expect(items.map((r) => r.title)).toEqual(["baile", "Reto de baile"]);
  });

  it("consulta corta (<3): PREFIJO indexado sobre title (P3: ya NO vacío)", async () => {
    const creador = await crearUsuario({ username: "creador2" });
    await crearReto(creador, { title: "ab reto" }); // prefijo "ab"
    await crearReto(creador, { title: "otro reto" }); // no coincide

    const { items } = await buscarRetos(prisma, "ab", null);
    expect(items.map((r) => r.title)).toEqual(["ab reto"]);
  });

  it("P3: word-prefix BOOLEAN encuentra 'sal' -> '…salto…' (parcial de palabra en el título)", async () => {
    const creador = await crearUsuario({ username: "creador3" });
    await crearReto(creador, { title: "Tu mejor salto en caja", score: 0 });
    await crearReto(creador, { title: "Receta en 60 segundos", score: 999 }); // no empieza por sal

    const { items } = await buscarRetos(prisma, "sal", null);
    const titulos = items.map((r) => r.title);
    expect(titulos).toContain("Tu mejor salto en caja");
    expect(titulos).not.toContain("Receta en 60 segundos");
  });

  it("P3: exacto rankea por ENCIMA del word-prefix (salto exacto > '…salto…')", async () => {
    const creador = await crearUsuario({ username: "creador4" });
    await crearReto(creador, { title: "Tu mejor salto en caja", score: 999 }); // word-prefix, score alto
    await crearReto(creador, { title: "salto", score: 0 }); // EXACTO, score bajo

    const { items } = await buscarRetos(prisma, "salto", null);
    // El exacto va primero AUNQUE tenga menos scoreAutoridad (la exactitud domina).
    expect(items[0]?.title).toBe("salto");
  });
});
