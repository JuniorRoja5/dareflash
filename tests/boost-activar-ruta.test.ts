/**
 * LA RUTA DE ACTIVAR — quién puede gastar un boost y qué se responde.
 *
 *  - EL CORREO VERIFICADO ES LA PUERTA, y la decide `requireVerifiedUser`, no un `if` escrito en la
 *    ruta: es la misma barrera antifraude que votar, comentar o comprar.
 *  - QUIÉN ACTIVA SALE DE LA SESIÓN. Un `userId` en el cuerpo se ignora, así que nadie gasta el
 *    boost de otro.
 *  - SIN SALDO Y LÍMITE SON 200 CON SU COPY. No son errores del sistema: son respuestas. Un 4xx
 *    aquí haría que la pantalla dijera "ha fallado algo" cuando lo que pasa es que no quedan.
 *  - NO TOCA STRIPE: esto gasta crédito interno.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  BOOST_DAILY_LIMIT,
  BOOST_DURACION_MIN,
  MSG_BOOST_LIMITE_DIARIO,
  MSG_BOOST_SIN_SALDO,
} from "../src/config/constants";
import type { PrismaClient } from "../src/generated/prisma/client";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

const H = vi.hoisted(() => ({
  prisma: null as unknown as PrismaClient,
  user: { userId: "", sessionId: "s1", role: "USER", emailVerified: new Date() as Date | null },
}));

vi.mock("@/server/db/client", () => ({
  get prisma() {
    return H.prisma;
  },
}));
vi.mock("@/config/env", () => ({
  env: { AUTH_SECRET: "TEST-FIXTURE-auth-secret-activar", APP_URL: "https://x.test" },
}));
// `mutatingRoute` tiene sus propios tests (Origin/sesión/CSRF): aquí se sustituye por un paso que
// inyecta lo mismo, para probar LO QUE ESTA RUTA decide sin montar una sesión real.
vi.mock("@/server/auth/mutating-route", () => ({
  mutatingRoute:
    (handler: (req: Request, ctx: unknown, rc: unknown) => Promise<Response>) =>
    (req: Request, rc: unknown) =>
      handler(req, { user: H.user, env: {}, prisma: H.prisma }, rc),
}));
// La sesión que lee `requireVerifiedUser` sale del mismo doble: así el guard REAL decide de verdad.
vi.mock("@/server/auth/current-user", () => ({
  getCurrentUser: async () => (H.user.userId ? H.user : null),
}));

import { POST as activar } from "../src/app/api/boost/activar/route";

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
  H.user.userId = await crearUsuario(prisma, { username: "la_activa", boostBalance: 3 });
  H.user.emailVerified = new Date();
});

const TOKEN = "11111111-2222-4333-8444-555555555555";

const pedir = (cuerpo: unknown) =>
  activar(
    new Request("http://test/api/boost/activar", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://test" },
      body: JSON.stringify(cuerpo),
    }),
    undefined,
  );

const saldo = async (id = H.user.userId) =>
  (await prisma.user.findUniqueOrThrow({ where: { id } })).boostBalance;

describe("activar de verdad", () => {
  it("gasta un boost y lo cuenta", async () => {
    const res = await pedir({ token: TOKEN });
    expect(res.status).toBe(200);

    const cuerpo = (await res.json()) as { estado: string; saldo: number; usadasHoy: number };
    expect(cuerpo).toMatchObject({ estado: "activado", saldo: 2, usadasHoy: 1 });
    expect(await saldo()).toBe(2);
    expect(await prisma.boostActivation.count()).toBe(1);
  });

  it("y dice hasta cuándo dura, derivado de la constante", async () => {
    const antes = Date.now();
    const res = await pedir({ token: TOKEN });
    const { expiraEnMs } = (await res.json()) as { expiraEnMs: number };

    expect(expiraEnMs).toBeGreaterThanOrEqual(antes + BOOST_DURACION_MIN * 60_000 - 5_000);
    expect(expiraEnMs).toBeLessThanOrEqual(Date.now() + BOOST_DURACION_MIN * 60_000);
  });

  it("el MISMO token dos veces no gasta dos boosts", async () => {
    await pedir({ token: TOKEN });
    const res = await pedir({ token: TOKEN });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ estado: "repetida" });
    expect(await saldo()).toBe(2);
    expect(await prisma.boostActivation.count()).toBe(1);
  });
});

describe("quién activa sale de la SESIÓN", () => {
  it("un `userId` en el cuerpo se ignora por completo", async () => {
    const otra = await crearUsuario(prisma, { username: "la_victima", boostBalance: 5 });
    await pedir({ token: TOKEN, userId: otra });

    expect(await saldo(otra), "se gastó el boost de otra persona").toBe(5);
    expect(await saldo()).toBe(2);
  });
});

describe("la puerta es el correo verificado", () => {
  it("sin verificar: 403 y nada escrito", async () => {
    H.user.emailVerified = null;
    const res = await pedir({ token: TOKEN });

    expect(res.status).toBe(403);
    expect(await saldo()).toBe(3);
    expect(await prisma.boostActivation.count()).toBe(0);
  });

  it("y el copy no menciona ningún código ni jerga interna", async () => {
    H.user.emailVerified = null;
    const cuerpo = (await (await pedir({ token: TOKEN })).json()) as {
      error: { code: string; message: string };
    };
    expect(cuerpo.error.message).toMatch(/correo/i);
    expect(cuerpo.error.message).not.toMatch(/EMAIL_NOT_VERIFIED|AuthError|requireVerified/);
  });
});

describe("sin saldo y límite son 200, con su copy", () => {
  it("sin boosts: 200, `sin-saldo` y el mensaje humano", async () => {
    H.user.userId = await crearUsuario(prisma, { username: "la_pelada", boostBalance: 0 });
    const res = await pedir({ token: TOKEN });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ estado: "sin-saldo", mensaje: MSG_BOOST_SIN_SALDO });
  });

  it(`con las ${BOOST_DAILY_LIMIT} del día gastadas: 200, \`limite\` y su mensaje`, async () => {
    H.user.userId = await crearUsuario(prisma, { username: "la_tope", boostBalance: 9 });
    for (let i = 0; i < BOOST_DAILY_LIMIT; i += 1) {
      await prisma.boostActivation.create({
        data: { userId: H.user.userId, startsAt: new Date(), expiresAt: new Date(Date.now() + 1) },
      });
    }

    const res = await pedir({ token: TOKEN });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ estado: "limite", mensaje: MSG_BOOST_LIMITE_DIARIO });
    expect(await saldo(H.user.userId)).toBe(9);
  });

  it("y el mensaje del límite NO promete «mañana»: el corte es la medianoche UTC", async () => {
    // Para alguien en UTC+10, "vuelve mañana" es falso: su contador se reinicia esta misma tarde.
    expect(MSG_BOOST_LIMITE_DIARIO).toMatch(/UTC/);
    expect(MSG_BOOST_LIMITE_DIARIO).not.toMatch(/mañana/i);
  });
});

describe("el cuerpo se valida", () => {
  it.each([{}, { token: "" }, { token: "no-es-uuid" }, { token: 7 }, null])(
    "«%s» no activa nada",
    async (cuerpo) => {
      const res = await pedir(cuerpo);
      expect(res.status).toBe(400);
      expect(await prisma.boostActivation.count()).toBe(0);
      expect(await saldo()).toBe(3);
    },
  );
});
