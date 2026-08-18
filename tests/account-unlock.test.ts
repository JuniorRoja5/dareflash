/**
 * Desbloqueo de cuenta por correo — tests CON DIENTES.
 *  - UN correo por VENTANA de bloqueo (cubo unlock:acct 1/hora): anti-bombardeo del buzon.
 *  - Sin enumeracion: email inexistente NO encola correo, pero SI consume el cubo (uniforme).
 *  - El token es LOGIN_UNLOCK (no sirve para verificar; ver email-token.test).
 *  - El enlace resetea SOLO el cubo de CUENTA, JAMAS el de IP (guardian de CPU).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";
import { generarHandle } from "../src/server/auth/handle";
import { requestAccountUnlockEmail } from "../src/server/auth/account-unlock";
import { rateLimit, resetRateLimit } from "../src/server/security/rate-limit";

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

async function crearUsuario(email: string): Promise<void> {
  await prisma.user.create({
    data: { email, username: generarHandle(), passwordHash: "TEST-FIXTURE-hash" },
  });
}

const KEYS = { unlockAcctKey: "unlock:acct:a", unlockIpKey: "unlock:ip:x" };
const APP = "https://x.test";

describe("correo de desbloqueo de cuenta", () => {
  it("UN correo por ventana: dos disparos en la misma ventana encolan UN solo correo", async () => {
    await crearUsuario("a@test.com");
    await requestAccountUnlockEmail(prisma, { email: "a@test.com", appUrl: APP, ...KEYS });
    await requestAccountUnlockEmail(prisma, { email: "a@test.com", appUrl: APP, ...KEYS });
    expect(await prisma.job.count({ where: { type: "SEND_EMAIL" } })).toBe(1); // 1/hora, no 1/intento
  });

  it("SIN ENUMERACION: email inexistente NO encola correo, pero SI consume el cubo (uniforme)", async () => {
    await requestAccountUnlockEmail(prisma, {
      email: "noexiste@test.com",
      appUrl: APP,
      unlockAcctKey: "unlock:acct:noexiste",
      unlockIpKey: "unlock:ip:x",
    });
    expect(await prisma.job.count({ where: { type: "SEND_EMAIL" } })).toBe(0); // no existe -> no correo
    // El cubo por cuenta se consume IGUAL (uniformidad: no delata que la cuenta no existe).
    const row = await prisma.rateLimit.findFirst({ where: { key: "unlock:acct:noexiste" } });
    expect(row?.count).toBe(1);
  });

  it("el token creado es LOGIN_UNLOCK (no un token de verificacion)", async () => {
    await crearUsuario("a@test.com");
    await requestAccountUnlockEmail(prisma, { email: "a@test.com", appUrl: APP, ...KEYS });
    const tok = await prisma.verificationToken.findFirstOrThrow({
      where: { identifier: "a@test.com" },
    });
    expect(tok.purpose).toBe("LOGIN_UNLOCK");
  });

  it("el desbloqueo resetea SOLO el cubo de CUENTA, nunca el de IP", async () => {
    // Lo que hace /api/auth/unlock al consumir el token: reset del login:acct de esa direccion,
    // JAMAS el login:ip (guardian de CPU; si se pudiera liberar desde un correo, un atacante
    // provocaria su propio desbloqueo y se saltaria el freno de CPU).
    await rateLimit(prisma, { key: "login:acct:victima", limit: 5, windowMs: 1000 });
    await rateLimit(prisma, { key: "login:ip:atacante", limit: 5, windowMs: 1000 });

    await resetRateLimit(prisma, "login:acct:victima"); // <- exactamente lo que hace el endpoint

    expect(await prisma.rateLimit.findFirst({ where: { key: "login:acct:victima" } })).toBeNull();
    expect(
      await prisma.rateLimit.findFirst({ where: { key: "login:ip:atacante" } }),
    ).not.toBeNull();
  });
});
