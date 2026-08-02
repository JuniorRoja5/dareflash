/**
 * REHASHEO OPORTUNISTA en login — test CON DIENTES.
 *
 * Al fijar los parametros de Argon2id en p=1, los hashes p=4 antiguos deben CONVERGER a los
 * nuevos, o `DUMMY_HASH` (p=1, 178 ms) y un hash real p=4 (195 ms) tardarian distinto: 17 ms de
 * diferencia sistematica = el oraculo de enumeracion reabierto. La solucion es regrabar el hash
 * tras un login correcto. Rompe la condicion (quita el rehasheo, o hazlo incondicional) y estos
 * tests lo cazan.
 */
import argon2 from "argon2";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";
import { login } from "../src/server/auth/login";
import { hashPassword, needsRehash } from "../src/server/auth/password";

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

/** Parametros VIEJOS (los defaults de la libreria que usabamos antes): p=4. */
const PARAMS_VIEJOS = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
} as const;

async function crearUsuario(email: string, passwordHash: string): Promise<string> {
  const u = await prisma.user.create({
    data: { email, emailVerified: new Date(), passwordHash },
    select: { id: true },
  });
  return u.id;
}

describe("rehasheo oportunista en login", () => {
  it("hash con parametros VIEJOS (p=4): se REGRABA tras un login correcto", async () => {
    const pwd = "contrasena-correcta-1234";
    const viejo = await argon2.hash(pwd, PARAMS_VIEJOS);
    const id = await crearUsuario("a@test.com", viejo);
    expect(needsRehash(viejo)).toBe(true); // precondicion: el hash es viejo

    const r = await login(prisma, { email: "a@test.com", password: pwd });
    expect(r.ok).toBe(true);

    const u = await prisma.user.findUniqueOrThrow({
      where: { id },
      select: { passwordHash: true },
    });
    expect(u.passwordHash).not.toBe(viejo); // se regrabo
    expect(needsRehash(u.passwordHash!)).toBe(false); // ahora con los parametros actuales (p=1)
    expect(await argon2.verify(u.passwordHash!, pwd)).toBe(true); // sigue siendo la MISMA contrasena
  });

  it("hash con parametros ACTUALES (p=1): NO se toca", async () => {
    const pwd = "contrasena-correcta-1234";
    const actual = await hashPassword(pwd); // ya p=1
    const id = await crearUsuario("b@test.com", actual);
    expect(needsRehash(actual)).toBe(false); // precondicion: ya esta al dia

    const r = await login(prisma, { email: "b@test.com", password: pwd });
    expect(r.ok).toBe(true);

    const u = await prisma.user.findUniqueOrThrow({
      where: { id },
      select: { passwordHash: true },
    });
    expect(u.passwordHash).toBe(actual); // intacto: mismo string, no se regrabo por nada
  });

  it("login con contrasena INCORRECTA no regraba nada (aunque el hash sea viejo)", async () => {
    const viejo = await argon2.hash("la-correcta-1234", PARAMS_VIEJOS);
    const id = await crearUsuario("c@test.com", viejo);

    const r = await login(prisma, { email: "c@test.com", password: "la-mala" });
    expect(r.ok).toBe(false);

    const u = await prisma.user.findUniqueOrThrow({
      where: { id },
      select: { passwordHash: true },
    });
    expect(u.passwordHash).toBe(viejo); // sin acierto, no se toca
  });
});
