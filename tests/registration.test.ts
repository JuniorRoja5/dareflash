import { performance } from "node:perf_hooks";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { Prisma } from "../src/generated/prisma/client";
import type { PrismaClient } from "../src/generated/prisma/client";
import { hashPassword } from "../src/server/auth/password";
import { esViolacionUnicaDeEmail, registerUser } from "../src/server/auth/registration";

import { createTestPrisma, resetDb } from "./helpers/db";

/** P2002 con la forma del driver adapter de MariaDB (nombre de indice en constraint.index). */
function p2002Adapter(index: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
    meta: { driverAdapterError: { cause: { constraint: { index } } } },
  });
}

/** P2002 con la forma clasica de Prisma (`meta.target`). */
function p2002Clasico(target: string | string[]): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
    meta: { target },
  });
}

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

const BIRTH = new Date("2000-01-01T00:00:00.000Z");
const PASS = "TEST-FIXTURE-pass-suficientemente-larga";

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1]! + s[mid]!) / 2 : s[mid]!;
}

/** Coste de un argon2 (referencia para el umbral), tras un warmup del modulo nativo. */
async function costeArgon2(): Promise<number> {
  await hashPassword("warmup"); // el primer hash paga la inicializacion del modulo nativo
  const t0 = performance.now();
  await hashPassword("medicion-de-coste");
  return performance.now() - t0;
}

describe("registro: sin oraculo por tiempo ni carrera", () => {
  it("NO ENUMERA por tiempo: hashea SIEMPRE, asi email nuevo y existente tardan casi igual", async () => {
    const H = await costeArgon2();

    const existente = "existe@test.com";
    await prisma.user.create({ data: { email: existente, passwordHash: "x", birthDate: BIRTH } });

    const N = 6;
    const tExist: number[] = [];
    const tNuevo: number[] = [];
    for (let i = 0; i < N; i++) {
      let s = performance.now();
      await registerUser(prisma, {
        email: existente,
        password: PASS,
        birthDate: BIRTH,
        appUrl: "https://x.test",
      });
      tExist.push(performance.now() - s);

      s = performance.now();
      await registerUser(prisma, {
        email: `nuevo${i}@test.com`,
        password: PASS,
        birthDate: BIRTH,
        appUrl: "https://x.test",
      });
      tNuevo.push(performance.now() - s);
    }

    // Con hash SIEMPRE, la separacion entre medianas es << el coste de un argon2 (solo
    // el encolado del correo, ~ms). El mismo umbral caza la version rota (test de abajo).
    const diff = Math.abs(median(tNuevo) - median(tExist));
    expect(diff).toBeLessThan(H * 0.5);
  });

  it("DIENTES: la version ROTA (hash TRAS mirar existencia) SI separa las medianas", async () => {
    // Reproduccion local del fallo que arreglamos: mirar si existe y solo entonces
    // hashear. Demuestra que el umbral del test de arriba tiene dientes: esta version
    // lo supera. Si alguien revierte registration.ts a este patron, el test cae.
    async function registrarRoto(email: string): Promise<void> {
      const e = email.trim().toLowerCase();
      const existing = await prisma.user.findUnique({ where: { email: e }, select: { id: true } });
      if (existing) return; // camino RAPIDO: no llega a hashear
      await hashPassword(PASS); // camino LENTO: solo los nuevos pagan el argon2
      await prisma.user.create({ data: { email: e, passwordHash: "x", birthDate: BIRTH } });
    }

    const H = await costeArgon2();
    const existente = "existe@test.com";
    await prisma.user.create({ data: { email: existente, passwordHash: "x", birthDate: BIRTH } });

    const N = 6;
    const tExist: number[] = [];
    const tNuevo: number[] = [];
    for (let i = 0; i < N; i++) {
      let s = performance.now();
      await registrarRoto(existente);
      tExist.push(performance.now() - s);

      s = performance.now();
      await registrarRoto(`nuevo${i}@test.com`);
      tNuevo.push(performance.now() - s);
    }

    const diff = Math.abs(median(tNuevo) - median(tExist));
    expect(diff).toBeGreaterThan(H * 0.5); // la rota SI se separa -> el test la caza
  });

  it("CARRERA: dos registros simultaneos del mismo email nuevo -> un solo usuario, sin 500", async () => {
    const email = "carrera@test.com";
    // Ambas llaman a la vez: una crea, la otra choca con la UNIQUE (P2002) y es no-op.
    const results = await Promise.allSettled([
      registerUser(prisma, { email, password: PASS, birthDate: BIRTH, appUrl: "https://x.test" }),
      registerUser(prisma, { email, password: PASS, birthDate: BIRTH, appUrl: "https://x.test" }),
    ]);

    // Ninguna revienta: la colision se traga como no-op silencioso.
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    // Y solo hay UN usuario con ese email.
    expect(await prisma.user.count({ where: { email } })).toBe(1);
  });
});

describe("registro: el no-op silencioso SOLO cubre la constraint de email", () => {
  it("reconoce el P2002 de email en la forma del adapter y en la clasica (string y array)", () => {
    expect(esViolacionUnicaDeEmail(p2002Adapter("User_email_key"))).toBe(true);
    expect(esViolacionUnicaDeEmail(p2002Clasico("User_email_key"))).toBe(true);
    expect(esViolacionUnicaDeEmail(p2002Clasico(["email"]))).toBe(true);
  });

  it("NO reconoce el P2002 de OTRA columna unica (username) ni errores que no son P2002", () => {
    expect(esViolacionUnicaDeEmail(p2002Adapter("User_username_key"))).toBe(false);
    expect(esViolacionUnicaDeEmail(p2002Clasico(["username"]))).toBe(false);
    expect(esViolacionUnicaDeEmail(new Error("otro fallo"))).toBe(false);
  });

  it("registerUser: el P2002 de email es no-op; el de OTRA columna se PROPAGA (no 'te enviamos un correo' en falso)", async () => {
    const input = {
      email: "x@test.com",
      password: PASS,
      birthDate: BIRTH,
      appUrl: "https://x.test",
    };

    // Choque en email -> no-op silencioso (resuelve sin lanzar).
    const dbEmail = {
      user: { create: async () => Promise.reject(p2002Adapter("User_email_key")) },
    } as unknown as PrismaClient;
    await expect(registerUser(dbEmail, input)).resolves.toBeUndefined();

    // Choque en username (u otra unica futura) -> se relanza, NO se oculta.
    const dbUsername = {
      user: { create: async () => Promise.reject(p2002Adapter("User_username_key")) },
    } as unknown as PrismaClient;
    await expect(registerUser(dbUsername, input)).rejects.toBeInstanceOf(
      Prisma.PrismaClientKnownRequestError,
    );
  });
});
