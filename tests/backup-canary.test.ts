import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";
import { login } from "../src/server/auth/login";
import {
  CANARY_EMAIL,
  CANARY_PASSWORD,
  problemasDeSeguridadDelCanario,
  provisionarCanario,
  validarCanarioEnBase,
} from "../scripts/backup/canary";

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

describe("cuenta canario de respaldo", () => {
  it("aprovisionar es idempotente: una fila, baneada y SIN verificar", async () => {
    await provisionarCanario(prisma);
    await provisionarCanario(prisma);
    const rows = await prisma.user.findMany({ where: { email: CANARY_EMAIL } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.bannedAt).not.toBeNull();
    expect(rows[0]!.emailVerified).toBeNull();
  });

  it("validacion OK cuando el canario es correcto (fila integra + argon2 verifica)", async () => {
    await provisionarCanario(prisma);
    const r = await validarCanarioEnBase(prisma);
    expect(r.ok).toBe(true);
    expect(r.motivos).toEqual([]);
  });

  it("SEGURIDAD: si alguien le quita el baneo, la validacion del respaldo FALLA", async () => {
    await provisionarCanario(prisma);
    await prisma.user.update({ where: { email: CANARY_EMAIL }, data: { bannedAt: null } });
    const r = await validarCanarioEnBase(prisma);
    expect(r.ok).toBe(false);
    expect(r.motivos.join(" ")).toMatch(/NO esta baneado/i);
  });

  it("el flujo de login RECHAZA el canario aunque la contrasena conocida sea correcta", async () => {
    await provisionarCanario(prisma);
    const res = await login(prisma, { email: CANARY_EMAIL, password: CANARY_PASSWORD });
    expect(res.ok).toBe(false);
    // Baneada -> INVALID_CREDENTIALS (no revela la razon). Nunca crea sesion.
    if (!res.ok) expect(res.reason).toBe("INVALID_CREDENTIALS");
  });

  it("hash corrupto tras el ciclo -> validacion falla", async () => {
    await provisionarCanario(prisma);
    await prisma.user.update({
      where: { email: CANARY_EMAIL },
      data: { passwordHash: "$argon2id$hash-corrupto" },
    });
    const r = await validarCanarioEnBase(prisma);
    expect(r.ok).toBe(false);
    expect(r.motivos.join(" ")).toMatch(/verifyPassword/i);
  });

  it("problemasDeSeguridadDelCanario (puro): limpio solo si baneado y sin verificar", () => {
    const banned = new Date();
    expect(
      problemasDeSeguridadDelCanario({ bannedAt: banned, emailVerified: null, passwordHash: "h" }),
    ).toEqual([]);
    expect(
      problemasDeSeguridadDelCanario({ bannedAt: null, emailVerified: null, passwordHash: "h" })
        .length,
    ).toBeGreaterThan(0);
    expect(
      problemasDeSeguridadDelCanario({ bannedAt: banned, emailVerified: banned, passwordHash: "h" })
        .length,
    ).toBeGreaterThan(0);
  });
});
