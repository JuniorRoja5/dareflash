import { createHash } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";
import {
  confirmEmailVerification,
  createEmailVerification,
} from "../src/server/services/email-verification";

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

async function crearUsuarioSinVerificar(email: string): Promise<string> {
  const u = await prisma.user.create({ data: { email }, select: { id: true } });
  return u.id;
}

describe("verificacion de email", () => {
  it("en la BD solo vive el HASH del token, nunca el token en claro", async () => {
    await crearUsuarioSinVerificar("a@test.com");
    const { rawToken } = await createEmailVerification(prisma, { email: "a@test.com" });

    const row = await prisma.verificationToken.findFirstOrThrow({
      where: { identifier: "a@test.com" },
    });
    expect(row.token).not.toBe(rawToken); // no esta en claro
    expect(row.token).toBe(createHash("sha256").update(rawToken).digest("hex"));
  });

  it("token valido: verifica la cuenta y es de un solo uso", async () => {
    const userId = await crearUsuarioSinVerificar("a@test.com");
    const { rawToken } = await createEmailVerification(prisma, { email: "a@test.com" });

    const r1 = await confirmEmailVerification(prisma, { rawToken });
    expect(r1).toEqual({ verified: true, email: "a@test.com" });

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { emailVerified: true },
    });
    expect(user.emailVerified).not.toBeNull();

    // Segundo intento con el mismo token: ya consumido.
    const r2 = await confirmEmailVerification(prisma, { rawToken });
    expect(r2).toEqual({ verified: false, reason: "INVALID" });
  });

  it("token inexistente: INVALID", async () => {
    const r = await confirmEmailVerification(prisma, { rawToken: "no-existe" });
    expect(r).toEqual({ verified: false, reason: "INVALID" });
  });

  it("token caducado: EXPIRED y se consume igualmente", async () => {
    await crearUsuarioSinVerificar("a@test.com");
    const pasado = new Date(Date.now() - 48 * 60 * 60 * 1000); // creado hace 48h
    const { rawToken } = await createEmailVerification(prisma, {
      email: "a@test.com",
      now: pasado,
    });

    const r = await confirmEmailVerification(prisma, { rawToken });
    expect(r).toEqual({ verified: false, reason: "EXPIRED" });

    // Consumido aunque caducara.
    const count = await prisma.verificationToken.count({ where: { identifier: "a@test.com" } });
    expect(count).toBe(0);
  });

  it("pedir un token nuevo invalida el anterior (un solo token activo por direccion)", async () => {
    await crearUsuarioSinVerificar("a@test.com");
    const primero = await createEmailVerification(prisma, { email: "a@test.com" });
    await createEmailVerification(prisma, { email: "a@test.com" });

    const r = await confirmEmailVerification(prisma, { rawToken: primero.rawToken });
    expect(r).toEqual({ verified: false, reason: "INVALID" }); // el viejo ya no vale
  });
});
