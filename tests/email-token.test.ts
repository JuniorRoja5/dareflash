/**
 * Token de correo por PROPOSITO — test CON DIENTES.
 *
 * El punto critico (Opcion 3, desbloqueo por correo): un token de EMAIL_VERIFY NO puede
 * desbloquear una cuenta, ni un token de LOGIN_UNLOCK puede verificar un alta. La garantia es
 * ESTRUCTURAL: el `purpose` va DENTRO del WHERE al consumir. Rompe eso (quita el purpose del
 * findFirst) y estos tests lo cazan en los dos sentidos.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";
import { consumeEmailToken, createEmailToken } from "../src/server/auth/email-token";

import { createTestPrisma, resetDb } from "./helpers/db";

let prisma: PrismaClient;
const HORA = 60 * 60 * 1000;

beforeAll(() => {
  prisma = createTestPrisma();
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
});

describe("token de correo: el proposito va dentro del WHERE", () => {
  it("un token EMAIL_VERIFY NO se puede consumir como LOGIN_UNLOCK (y no lo gasta)", async () => {
    const { rawToken } = await createEmailToken(prisma, {
      identifier: "a@test.com",
      purpose: "EMAIL_VERIFY",
      ttlMs: HORA,
    });
    // Con el proposito equivocado: no casa.
    expect(await consumeEmailToken(prisma, { rawToken, purpose: "LOGIN_UNLOCK" })).toEqual({
      ok: false,
      reason: "INVALID",
    });
    // Y NO lo consumio: sigue valiendo para su proposito correcto.
    expect(await consumeEmailToken(prisma, { rawToken, purpose: "EMAIL_VERIFY" })).toEqual({
      ok: true,
      identifier: "a@test.com",
    });
  });

  it("un token LOGIN_UNLOCK NO se puede consumir como EMAIL_VERIFY", async () => {
    const { rawToken } = await createEmailToken(prisma, {
      identifier: "a@test.com",
      purpose: "LOGIN_UNLOCK",
      ttlMs: HORA,
    });
    expect(await consumeEmailToken(prisma, { rawToken, purpose: "EMAIL_VERIFY" })).toEqual({
      ok: false,
      reason: "INVALID",
    });
    expect(await consumeEmailToken(prisma, { rawToken, purpose: "LOGIN_UNLOCK" })).toEqual({
      ok: true,
      identifier: "a@test.com",
    });
  });

  it("un solo uso: consumido con el proposito correcto, ya no vale", async () => {
    const { rawToken } = await createEmailToken(prisma, {
      identifier: "a@test.com",
      purpose: "EMAIL_VERIFY",
      ttlMs: HORA,
    });
    expect((await consumeEmailToken(prisma, { rawToken, purpose: "EMAIL_VERIFY" })).ok).toBe(true);
    expect(await consumeEmailToken(prisma, { rawToken, purpose: "EMAIL_VERIFY" })).toEqual({
      ok: false,
      reason: "INVALID",
    });
  });

  it("caducado: se consume pero devuelve EXPIRED", async () => {
    const now = new Date("2026-08-03T12:00:00.000Z");
    const { rawToken } = await createEmailToken(prisma, {
      identifier: "a@test.com",
      purpose: "EMAIL_VERIFY",
      ttlMs: HORA,
      now,
    });
    const despues = new Date(now.getTime() + HORA + 1000);
    expect(
      await consumeEmailToken(prisma, { rawToken, purpose: "EMAIL_VERIFY", now: despues }),
    ).toEqual({ ok: false, reason: "EXPIRED" });
  });

  it("un token activo por (identifier, purpose): renovar uno NO borra el del otro proposito", async () => {
    await createEmailToken(prisma, {
      identifier: "a@test.com",
      purpose: "EMAIL_VERIFY",
      ttlMs: HORA,
    });
    const unlock = await createEmailToken(prisma, {
      identifier: "a@test.com",
      purpose: "LOGIN_UNLOCK",
      ttlMs: HORA,
    });
    // Renovar EMAIL_VERIFY no debe tocar el de LOGIN_UNLOCK.
    await createEmailToken(prisma, {
      identifier: "a@test.com",
      purpose: "EMAIL_VERIFY",
      ttlMs: HORA,
    });
    expect(await prisma.verificationToken.count({ where: { identifier: "a@test.com" } })).toBe(2);
    expect(
      (await consumeEmailToken(prisma, { rawToken: unlock.rawToken, purpose: "LOGIN_UNLOCK" })).ok,
    ).toBe(true);
  });
});
