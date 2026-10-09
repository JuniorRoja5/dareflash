/**
 * LOS DOS ENDPOINTS DEL PANEL DE BOOST — quién entra y qué contestan.
 *
 *  - EL ROL SE DERIVA de `secciones.ts`: un MODERATOR no pasa, aunque el panel le deje entrar al
 *    edificio. Y no hay un literal "ADMIN" escrito en la ruta que pueda discrepar de la nav.
 *  - QUIÉN AJUSTA SALE DE LA SESIÓN: un `adminId` en el cuerpo se ignora, así que nadie firma un
 *    ajuste a nombre de otro.
 *  - RETIRAR SOLO ACEPTA LA PERSONA. No hay parámetro de aparición: por eso no se puede pedir
 *    "corta esta fila", que es el fallo mudo que esta pieza evita.
 *  - LOS RECHAZOS SON HUMANOS: motivo corto, saldo insuficiente, cantidad imposible.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { AJUSTE_BOOST_DELTA_MAX, AJUSTE_NOTA_MIN } from "../src/config/constants";
import type { PrismaClient } from "../src/generated/prisma/client";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

const H = vi.hoisted(() => ({
  prisma: null as unknown as PrismaClient,
  user: {
    userId: "",
    sessionId: "s1",
    role: "ADMIN" as "ADMIN" | "MODERATOR" | "USER",
    emailVerified: new Date() as Date | null,
  },
}));

vi.mock("@/server/db/client", () => ({
  get prisma() {
    return H.prisma;
  },
}));
vi.mock("@/config/env", () => ({
  env: { AUTH_SECRET: "TEST-FIXTURE-auth-secret-panel-boost", APP_URL: "https://x.test" },
}));
vi.mock("@/server/auth/mutating-route", () => ({
  mutatingRoute:
    (handler: (req: Request, ctx: unknown, rc: unknown) => Promise<Response>) =>
    (req: Request, rc: unknown) =>
      handler(req, { user: H.user, env: {}, prisma: H.prisma }, rc),
}));
// La sesión que leen `requireRole`/`requireSeccion` sale de este doble: así el guard REAL decide.
vi.mock("@/server/auth/current-user", () => ({
  getCurrentUser: async () => (H.user.userId ? H.user : null),
}));

import { POST as ajustar } from "../src/app/api/panel/boost/ajustar/route";
import { POST as retirar } from "../src/app/api/panel/boost/retirar/route";

let prisma: PrismaClient;
let victima: string;

beforeAll(() => {
  prisma = createTestPrisma();
  H.prisma = prisma;
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
  H.user.userId = await crearUsuario(prisma, { username: "la_admin" });
  H.user.role = "ADMIN";
  H.user.emailVerified = new Date();
  victima = await crearUsuario(prisma, { username: "la_destacada", boostBalance: 2 });
});

const CLAVE = "11111111-2222-4333-8444-555555555555";

const pedir = (
  ruta: (req: Request, rc: unknown) => Promise<Response>,
  cuerpo: unknown,
): Promise<Response> =>
  ruta(
    new Request("http://test/api/panel/boost", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://test" },
      body: JSON.stringify(cuerpo),
    }),
    undefined,
  );

const saldoDe = async (id: string) =>
  (await prisma.user.findUniqueOrThrow({ where: { id } })).boostBalance;

async function destacar(userId: string, haceMin = 5) {
  const startsAt = new Date(Date.now() - haceMin * 60_000);
  await prisma.boostActivation.create({
    data: { userId, startsAt, expiresAt: new Date(startsAt.getTime() + 60 * 60_000) },
  });
}

describe("retirar del escaparate", () => {
  it("expira TODAS sus apariciones y dice cuántas", async () => {
    await destacar(victima, 40);
    await destacar(victima, 5);

    const res = await pedir(retirar, { userId: victima });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ expiradas: 2 });
    expect(
      await prisma.boostActivation.count({
        where: { userId: victima, expiresAt: { gt: new Date() } },
      }),
    ).toBe(0);
  });

  it("sin apariciones vigentes responde 200 y cero: repetirlo es inofensivo", async () => {
    const res = await pedir(retirar, { userId: victima });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ expiradas: 0 });
  });

  it("no mueve el saldo", async () => {
    await destacar(victima);
    await pedir(retirar, { userId: victima });
    expect(await saldoDe(victima)).toBe(2);
  });

  it("un cuerpo sin usuario no retira nada", async () => {
    await destacar(victima);
    for (const cuerpo of [{}, { userId: "" }, null, { activacionId: "a1" }]) {
      const res = await pedir(retirar, cuerpo);
      expect(res.status, JSON.stringify(cuerpo)).toBe(400);
    }
    expect(
      await prisma.boostActivation.count({
        where: { userId: victima, expiresAt: { gt: new Date() } },
      }),
    ).toBe(1);
  });

  it("un MODERADOR no puede retirar", async () => {
    await destacar(victima);
    H.user.role = "MODERATOR";

    const res = await pedir(retirar, { userId: victima });

    expect(res.status).toBe(403);
    expect(
      await prisma.boostActivation.count({
        where: { userId: victima, expiresAt: { gt: new Date() } },
      }),
    ).toBe(1);
  });
});

describe("ajustar créditos", () => {
  it("suma, y responde el saldo nuevo", async () => {
    const res = await pedir(ajustar, {
      userId: victima,
      delta: 3,
      nota: "detalle de soporte por la caída",
      clave: CLAVE,
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ aplicado: true, saldo: 5 });
    expect(await saldoDe(victima)).toBe(5);
  });

  it("la MISMA clave dos veces aplica una, y lo dice", async () => {
    const cuerpo = { userId: victima, delta: 1, nota: "promoción de lanzamiento", clave: CLAVE };
    await pedir(ajustar, cuerpo);
    const res = await pedir(ajustar, cuerpo);

    expect(await res.json()).toEqual({ aplicado: false, saldo: 3 });
    expect(await saldoDe(victima)).toBe(3);
  });

  it("QUIÉN ajusta sale de la sesión: un `adminId` del cuerpo se ignora", async () => {
    const otro = await crearUsuario(prisma, { username: "el_otro_admin" });
    await pedir(ajustar, {
      userId: victima,
      delta: 1,
      nota: "firmado a nombre de otro",
      clave: CLAVE,
      adminId: otro,
    });

    const [m] = await prisma.boostLedger.findMany({ where: { userId: victima } });
    expect(m!.refId, "el ajuste se firmó a nombre de otro admin").toBe(H.user.userId);
  });

  it("quitar más de lo que hay: 409 y nada escrito", async () => {
    const res = await pedir(ajustar, {
      userId: victima,
      delta: -9,
      nota: "intento de dejarla en negativo",
      clave: CLAVE,
    });

    expect(res.status).toBe(409);
    expect(await saldoDe(victima)).toBe(2);
    expect(await prisma.boostLedger.count()).toBe(0);
  });

  it("motivo corto o cantidad imposible: 400 y nada escrito", async () => {
    const malos = [
      { userId: victima, delta: 1, nota: "", clave: CLAVE },
      // Un carácter por debajo del mínimo, DERIVADO: "corto" tiene justo cinco y es válido, así que
      // un literal aquí probaba lo contrario de lo que decía.
      { userId: victima, delta: 1, nota: "a".repeat(AJUSTE_NOTA_MIN - 1), clave: CLAVE },
      { userId: victima, delta: 0, nota: "una cantidad de cero", clave: CLAVE },
      { userId: victima, delta: 1.5, nota: "una cantidad decimal", clave: CLAVE },
      {
        userId: victima,
        delta: AJUSTE_BOOST_DELTA_MAX + 1,
        nota: "pasada de tope",
        clave: CLAVE,
      },
      { userId: victima, delta: 1, nota: "sin clave válida", clave: "no-es-uuid" },
    ];
    for (const cuerpo of malos) {
      const res = await pedir(ajustar, cuerpo);
      expect(res.status, JSON.stringify(cuerpo)).toBe(400);
    }
    expect(await prisma.boostLedger.count()).toBe(0);
    expect(await saldoDe(victima)).toBe(2);
  });

  it("el tope son DIEZ, clavado: 10 pasa por la ruta y 11 da 400", async () => {
    // ┌─ QUÉ FIJA ESTE CASO, Y QUÉ NO ────────────────────────────────────────────────────────────┐
    // │ Fija el comportamiento DE PUNTA A PUNTA, que es lo que ve el panel: 10 entra, 11 se       │
    // │ rechaza con 400. Con valores CONCRETOS y no `AJUSTE_BOOST_DELTA_MAX + 1`, porque un caso  │
    // │ derivado sigue verde el día que alguien cambie el número.                                 │
    // │                                                                                           │
    // │ Lo que NO puede ver: cuál de las dos puertas rechazó. Subir el tope del `refine` de Zod   │
    // │ de la ruta deja pasar el cuerpo, pero el servicio lo rechaza igual y la respuesta sigue   │
    // │ siendo 400 — comprobado metiendo ese diente, que salió verde. Que la ruta no se invente   │
    // │ su propio número lo vigila `panel-boost-vista` por estructura.                            │
    // └───────────────────────────────────────────────────────────────────────────────────────────┘
    const ok = await pedir(ajustar, {
      userId: victima,
      delta: 10,
      nota: "el maximo de un solo ajuste",
      clave: CLAVE,
    });
    expect(ok.status, "10 debería pasar: es el tope, no un exceso").toBe(200);
    expect(await saldoDe(victima)).toBe(12);

    const pasado = await pedir(ajustar, {
      userId: victima,
      delta: 11,
      nota: "uno por encima del tope",
      clave: "22222222-3333-4444-8555-666666666666",
    });
    expect(pasado.status).toBe(400);
    expect(await saldoDe(victima), "el exceso movió el saldo").toBe(12);
  });

  it("un usuario que no existe: 404", async () => {
    const res = await pedir(ajustar, {
      userId: "no-existe",
      delta: 1,
      nota: "regalo a un fantasma",
      clave: CLAVE,
    });
    expect(res.status).toBe(404);
  });

  it("un MODERADOR no puede ajustar créditos", async () => {
    H.user.role = "MODERATOR";
    const res = await pedir(ajustar, {
      userId: victima,
      delta: 5,
      nota: "un moderador regalando boosts",
      clave: CLAVE,
    });

    expect(res.status).toBe(403);
    expect(await saldoDe(victima)).toBe(2);
    expect(await prisma.boostLedger.count()).toBe(0);
  });

  it("y el copy de los rechazos no lleva códigos ni jerga interna", async () => {
    const res = await pedir(ajustar, {
      userId: victima,
      delta: -9,
      nota: "más de lo que tiene",
      clave: CLAVE,
    });
    const cuerpo = (await res.json()) as { error: { message: string } };
    expect(cuerpo.error.message).toMatch(/Boosts/);
    expect(JSON.stringify(cuerpo)).not.toMatch(/LedgerError|INSUFFICIENT_BALANCE|allowNegative/);
  });
});
