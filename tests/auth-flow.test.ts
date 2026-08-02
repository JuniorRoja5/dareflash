import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";
import { login } from "../src/server/auth/login";
import { hashPassword } from "../src/server/auth/password";
import { registerUser } from "../src/server/auth/registration";
import { validateSession } from "../src/server/auth/session";

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

const APP_URL = "https://dareflash.com";

describe("registro", () => {
  it("email nuevo: crea usuario SIN verificar y encola el correo de verificacion", async () => {
    await registerUser(prisma, {
      email: "nuevo@test.com",
      password: "TEST-FIXTURE-pass-larga-123",
      birthDate: new Date("2000-01-01T00:00:00Z"),
      appUrl: APP_URL,
    });

    const user = await prisma.user.findUniqueOrThrow({
      where: { email: "nuevo@test.com" },
      select: { emailVerified: true, passwordHash: true },
    });
    expect(user.emailVerified).toBeNull(); // sin verificar
    expect(user.passwordHash).not.toBeNull();
    expect(await prisma.verificationToken.count({ where: { identifier: "nuevo@test.com" } })).toBe(
      1,
    );
    expect(await prisma.job.count({ where: { type: "SEND_EMAIL" } })).toBe(1);
  });

  it("email existente: no-op (sin enumeracion) — no crea un segundo usuario", async () => {
    await prisma.user.create({ data: { email: "ya@test.com", passwordHash: "x" } });
    await registerUser(prisma, {
      email: "ya@test.com",
      password: "TEST-FIXTURE-pass-otra-larga",
      birthDate: new Date("2000-01-01T00:00:00Z"),
      appUrl: APP_URL,
    });
    expect(await prisma.user.count({ where: { email: "ya@test.com" } })).toBe(1);
    expect(await prisma.job.count({ where: { type: "SEND_EMAIL" } })).toBe(0); // no reenvia
  });
});

describe("login", () => {
  async function crearUsuario(email: string, password: string, verificado: boolean) {
    await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(password),
        emailVerified: verificado ? new Date() : null,
      },
    });
  }

  it("credenciales correctas y verificado -> sesion valida", async () => {
    await crearUsuario("a@test.com", "TEST-FIXTURE-pass-correcta-1234567", true);
    const r = await login(prisma, {
      email: "a@test.com",
      password: "TEST-FIXTURE-pass-correcta-1234567",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(await validateSession(prisma, r.session.rawToken)).not.toBeNull();
  });

  it("contrasena incorrecta -> INVALID_CREDENTIALS", async () => {
    await crearUsuario("a@test.com", "TEST-FIXTURE-pass-correcta-1234567", true);
    const r = await login(prisma, {
      email: "a@test.com",
      password: "TEST-FIXTURE-pass-incorrecta",
    });
    expect(r).toEqual({ ok: false, reason: "INVALID_CREDENTIALS" });
  });

  it("usuario inexistente -> INVALID_CREDENTIALS (sin lanzar; timing-safe)", async () => {
    const r = await login(prisma, {
      email: "nadie@test.com",
      password: "TEST-FIXTURE-pass-loquesea-1234",
    });
    expect(r).toEqual({ ok: false, reason: "INVALID_CREDENTIALS" });
  });

  it("sin email verificado -> EMAIL_NOT_VERIFIED (barrera antifraude)", async () => {
    await crearUsuario("a@test.com", "TEST-FIXTURE-pass-correcta-1234567", false);
    const r = await login(prisma, {
      email: "a@test.com",
      password: "TEST-FIXTURE-pass-correcta-1234567",
    });
    expect(r).toEqual({ ok: false, reason: "EMAIL_NOT_VERIFIED" });
  });
});
