/**
 * ABRIR EL PAGO DE LA SUSCRIPCIÓN — y lo que pasa cuando el raíl está INERTE.
 *
 * ┌─ HOY NO HAY CLAVES DE STRIPE EN PRODUCCIÓN, Y ESO NO ES UN FALLO ───────────────────────────┐
 * │ Es el estado de la Fase 8: el raíl se construye y se deja inerte, como se hizo con Boost.    │
 * │ Lo que SÍ es un fallo sería que sin claves la pantalla reventara, o —peor— que activara el   │
 * │ VIP sin cobrar. Así que se comprueba las dos cosas: 503 limpio con copy humano, y cero       │
 * │ escritura.                                                                                    │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Y lo otro que fija: NO SE ABRE UN SEGUNDO PAGO a quien ya es VIP —cobraría dos veces por lo
 * mismo—, y esa comprobación pasa por el chokepoint, no por mirar el estado a mano.
 *
 * Para romperlo a propósito: activar la suscripción aquí en vez de en el webhook (rojo: el caso de
 * que abrir el pago no escribe nada), o comprobar "ya es VIP" mirando el estado (rojo: el caso de
 * la suscripción con el periodo vencido, que SÍ tiene que poder volver a suscribirse).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { MSG_VIP_PAGO_NO_DISPONIBLE } from "@/config/constants";
import type { PrismaClient } from "../src/generated/prisma/client";

const H = vi.hoisted(() => ({
  prisma: null as unknown as PrismaClient,
  user: {
    userId: "",
    sessionId: "s1",
    role: "USER" as const,
    emailVerified: new Date() as Date | null,
  },
  /** Las claves de Stripe del entorno simulado. `undefined` = raíl inerte, que es hoy. */
  claveStripe: undefined as string | undefined,
}));

vi.mock("@/server/db/client", () => ({
  get prisma() {
    return H.prisma;
  },
}));
vi.mock("@/config/env", () => ({
  env: {
    AUTH_SECRET: "TEST-FIXTURE-auth-secret-vip-checkout",
    APP_URL: "https://x.test",
    get STRIPE_SECRET_KEY() {
      return H.claveStripe;
    },
  },
}));
vi.mock("@/server/auth/mutating-route", () => ({
  mutatingRoute:
    (handler: (req: Request, ctx: unknown, rc: unknown) => Promise<Response>) =>
    (req: Request, rc: unknown) =>
      handler(
        req,
        { user: H.user, env: { AUTH_SECRET: "x", APP_URL: "https://x.test" }, prisma: H.prisma },
        rc,
      ),
}));

import { POST as checkout } from "../src/app/api/vip/checkout/route";
import { registrarSuscripcion } from "../src/server/services/vip";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

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
  H.user.userId = await crearUsuario(prisma, { username: "la_que_paga" });
  H.user.emailVerified = new Date();
  H.claveStripe = undefined;
});

const pedir = (): Promise<Response> =>
  checkout(
    new Request("http://test/api/vip/checkout", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://test" },
      body: "{}",
    }),
    undefined,
  );

describe("el raíl está inerte", () => {
  it("sin claves de Stripe: 503 con copy humano, y NADA activado", async () => {
    const res = await pedir();

    expect(res.status).toBe(503);
    const cuerpo = await res.json();
    expect(cuerpo.error.message).toBe(MSG_VIP_PAGO_NO_DISPONIBLE);
    // Ni el nombre de la variable ni el error del SDK llegan a la pantalla.
    expect(JSON.stringify(cuerpo)).not.toMatch(/STRIPE|Stripe|sk_/);
    expect(await prisma.subscription.count(), "abrir un pago activó el VIP").toBe(0);
  });

  it("y abrir el pago NUNCA escribe la suscripción: eso lo hace el webhook", async () => {
    // Activar aquí sería regalar el VIP a quien abre el formulario y lo cierra.
    H.claveStripe = "sk_test_FIXTURE";
    await pedir().catch(() => null);
    expect(await prisma.subscription.count()).toBe(0);
  });
});

describe("quién puede abrir el pago", () => {
  it("sin el correo verificado, no", async () => {
    H.user.emailVerified = null;
    const res = await pedir();
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("EMAIL_SIN_VERIFICAR");
  });

  it("quien YA es VIP, tampoco: sería cobrarle dos veces por lo mismo", async () => {
    await registrarSuscripcion(prisma, {
      userId: H.user.userId,
      estado: "ACTIVA",
      periodoFin: new Date(Date.now() + 86_400_000),
    });

    const res = await pedir();

    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("YA_ACTIVO");
  });

  it("pero quien lo FUE y se le acabó, SÍ puede volver", async () => {
    // La diferencia la marca el periodo, no el estado: una fila que sigue en ACTIVA porque el
    // webhook de baja se perdió no puede dejar a alguien sin poder volver a suscribirse nunca.
    await registrarSuscripcion(prisma, {
      userId: H.user.userId,
      estado: "ACTIVA",
      periodoFin: new Date(Date.now() - 86_400_000),
    });

    const res = await pedir();

    // Llega hasta Stripe (y ahí se cae por falta de claves), que es lo que se quiere comprobar:
    // NO le corta la puerta el chequeo de "ya eres VIP".
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("PAGO_NO_CONFIGURADO");
  });
});
