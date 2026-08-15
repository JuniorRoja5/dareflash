/**
 * REGISTER — tope de correos por DIRECCION (anti email-bombing). CON DIENTES: sin el rate-limit por
 * email, un atacante con muchas IPs bombardea el buzon de una victima con correos de verificacion.
 * Aqui: N altas para la MISMA direccion pasan hasta el limite y la siguiente da 429; otra direccion
 * no se ve afectada (topes independientes). El `registerUser` real (argon2 + encolado de correo) se
 * mockea: esta prueba mide el GATE de rate-limit, no el alta en si.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";

import { createTestPrisma, resetDb } from "./helpers/db";

const H = vi.hoisted(() => ({ prisma: null as unknown as PrismaClient }));
vi.mock("@/server/db/client", () => ({
  get prisma() {
    return H.prisma;
  },
}));
vi.mock("@/config/env", () => ({
  env: { AUTH_SECRET: "TEST-FIXTURE-auth-secret-register-ratelimit", APP_URL: "https://x.test" },
}));
// El alta real (argon2 + correo) no se ejecuta: solo importa que el gate de rate-limit se consuma.
vi.mock("@/server/auth/registration", () => ({
  registerUser: vi.fn().mockResolvedValue(undefined),
}));

import { POST as registerPOST } from "../src/app/api/auth/register/route";

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

// Contraseña que SÍ pasa la política fuerte (para no caer por validación antes del alta).
const PASS = "TEST-FIXTURE-cordillera-tejado-ambar-79";
const BIRTH = "2000-01-01";

function reqRegister(email: string): Request {
  return new Request("http://test/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://test" },
    body: JSON.stringify({ email, password: PASS, birthDate: BIRTH }),
  });
}

describe("register: tope por direccion (anti email-bombing)", () => {
  it("permite hasta el limite y despues 429 para la MISMA direccion", async () => {
    const email = "victima@test.com";
    // REGISTER_PER_EMAIL = 3/hora: las 3 primeras pasan, la 4a se corta.
    const s1 = (await registerPOST(reqRegister(email))).status;
    const s2 = (await registerPOST(reqRegister(email))).status;
    const s3 = (await registerPOST(reqRegister(email))).status;
    const s4 = (await registerPOST(reqRegister(email))).status;

    expect([s1, s2, s3]).toEqual([200, 200, 200]);
    expect(s4).toBe(429); // <- si se quita el tope por email, esto seria 200 y el test cae
  });

  it("el tope es POR direccion: otra direccion no se ve afectada", async () => {
    const victima = "otra-victima@test.com";
    for (let i = 0; i < 3; i++) await registerPOST(reqRegister(victima));
    expect((await registerPOST(reqRegister(victima))).status).toBe(429); // agotada

    // Una direccion distinta arranca con su propio contador.
    expect((await registerPOST(reqRegister("alguien-mas@test.com"))).status).toBe(200);
  });
});
