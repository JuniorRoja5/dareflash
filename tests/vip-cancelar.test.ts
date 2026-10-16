/**
 * DARSE DE BAJA — y lo que NO hace, que es la mitad de la pieza.
 *
 * ┌─ CANCELAR NO ES CORTAR ──────────────────────────────────────────────────────────────────────┐
 * │ Lo que se le pide a Stripe es `cancel_at_period_end`, y lo que se escribe en nuestra base de │
 * │ datos es NADA: eso es del webhook. Escribir aquí "CANCELADA" por nuestra cuenta crearía una  │
 * │ segunda verdad —si Stripe rechazara la operación, tendríamos una suscripción marcada de baja │
 * │ que sigue cobrando— y, sobre todo, un periodo pagado al que de pronto le falta el acceso.    │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Y LA PUERTA LA DECIDE EL CHOKEPOINT, no el estado a mano: una suscripción VENCIDA no se cancela
 * (ya se acabó) y una CORTADA tampoco (no da acceso). El botón no se le enseña a quien no es VIP,
 * pero el endpoint existe y se llega con un `curl`.
 *
 * Para romperlo a propósito: escribir la suscripción aquí en vez de dejárselo al webhook (rojo: el
 * caso de que la fila no se toca), o comprobar "es VIP" mirando `estado === "ACTIVA"` (rojo: el
 * caso de la vencida, que NO se puede cancelar aunque su estado siga en ACTIVA).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MSG_VIP_NO_ERES,
  MSG_VIP_PAGO_NO_DISPONIBLE,
  MSG_VIP_YA_CANCELADA,
} from "@/config/constants";
import type { PrismaClient } from "../src/generated/prisma/client";

const H = vi.hoisted(() => ({
  prisma: null as unknown as PrismaClient,
  user: {
    userId: "",
    sessionId: "s1",
    role: "USER" as const,
    emailVerified: new Date() as Date | null,
  },
  /** Las claves del entorno simulado. `undefined` = raíl inerte, que es el estado de hoy. */
  claveStripe: "sk_test_FIXTURE" as string | undefined,
  /** Lo que Stripe recibe. Es lo que de verdad importa comprobar de esta ruta. */
  update: vi.fn(),
}));

vi.mock("@/server/db/client", () => ({
  get prisma() {
    return H.prisma;
  },
}));
vi.mock("@/config/env", () => ({
  env: {
    AUTH_SECRET: "TEST-FIXTURE-auth-secret-vip-cancelar",
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
        {
          user: H.user,
          env: { AUTH_SECRET: "x", APP_URL: "https://x.test", STRIPE_SECRET_KEY: H.claveStripe },
          prisma: H.prisma,
        },
        rc,
      ),
}));
vi.mock("@/server/pagos/stripe", () => {
  class PagosNoDisponibles extends Error {}
  return {
    PagosNoDisponibles,
    clienteStripe: (clave: string | undefined) => {
      if (!clave) throw new PagosNoDisponibles("STRIPE_SECRET_KEY");
      return { subscriptions: { update: H.update } };
    },
  };
});

import { POST as cancelar } from "../src/app/api/vip/cancelar/route";
import { esVipActivoDe, registrarSuscripcion } from "../src/server/services/vip";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

let prisma: PrismaClient;
const DIA = 86_400_000;

beforeAll(() => {
  prisma = createTestPrisma();
  H.prisma = prisma;
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
  H.user.userId = await crearUsuario(prisma, { username: "la_que_se_va" });
  H.claveStripe = "sk_test_FIXTURE";
  H.update.mockReset().mockResolvedValue({ id: "sub_X", cancel_at_period_end: true });
});

const pedir = (): Promise<Response> =>
  cancelar(
    new Request("http://test/api/vip/cancelar", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://test" },
      body: "{}",
    }),
    undefined,
  );

/** Una suscripción de quien manda la petición, con los valores que haga falta. */
const suscribir = (
  estado: string,
  finEnDias: number,
  stripeSubscriptionId: string | null = "sub_X",
) =>
  registrarSuscripcion(prisma, {
    userId: H.user.userId,
    estado,
    periodoFin: new Date(Date.now() + finEnDias * DIA),
    ...(stripeSubscriptionId ? { stripeSubscriptionId } : {}),
  });

describe("quién puede darse de baja", () => {
  it("un NO-VIP no cancela nada, y Stripe no se entera", async () => {
    const res = await pedir();

    expect(res.status).toBe(409);
    const cuerpo = await res.json();
    expect(cuerpo.error.code).toBe("NO_ERES_VIP");
    expect(cuerpo.error.message).toBe(MSG_VIP_NO_ERES);
    expect(H.update, "se ha llamado a Stripe por alguien sin suscripción").not.toHaveBeenCalled();
  });

  it("una suscripción VENCIDA tampoco: ya se acabó", async () => {
    // Aunque su estado siga en ACTIVA porque el webhook de baja se perdió. Lo decide la FECHA.
    await suscribir("ACTIVA", -1);

    const res = await pedir();

    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("NO_ERES_VIP");
    expect(H.update).not.toHaveBeenCalled();
  });

  it("y una CORTADA tampoco: no da acceso, no hay nada que conservar", async () => {
    await suscribir("CORTADA", 30);

    const res = await pedir();

    expect(res.status).toBe(409);
    expect(H.update).not.toHaveBeenCalled();
  });
});

describe("la baja de quien SÍ es VIP", () => {
  it("le pide a Stripe el fin de periodo, nunca un corte", async () => {
    await suscribir("ACTIVA", 20);

    const res = await pedir();

    expect(res.status).toBe(200);
    expect(H.update).toHaveBeenCalledTimes(1);
    expect(H.update).toHaveBeenCalledWith("sub_X", { cancel_at_period_end: true });
    // Ni `cancel()` ni un borrado: el mes está pagado y se disfruta entero.
    const args = JSON.stringify(H.update.mock.calls[0]);
    expect(args).not.toMatch(/prorate|invoice_now|immediately/i);
  });

  it("y NO toca nuestra fila: eso lo escribe el webhook", async () => {
    await suscribir("ACTIVA", 20);
    const antes = await prisma.subscription.findUnique({ where: { userId: H.user.userId } });

    await pedir();

    const despues = await prisma.subscription.findUnique({ where: { userId: H.user.userId } });
    expect(despues?.estado, "la ruta se ha adelantado al webhook").toBe(antes?.estado);
    expect(despues?.periodoFin.getTime()).toBe(antes?.periodoFin.getTime());
    expect(despues?.canceladaEn).toBe(antes?.canceladaEn ?? null);
  });

  it("el acceso SIGUE hasta el fin del periodo, y se acaba justo ahí", async () => {
    // El webhook traduce la baja a CANCELADA; el acceso lo sigue mandando la fecha.
    await suscribir("CANCELADA", 20);
    expect(await esVipActivoDe(prisma, H.user.userId), "la baja ha cortado el acceso").toBe(true);

    const pasadoElFin = new Date(Date.now() + 21 * DIA);
    expect(await esVipActivoDe(prisma, H.user.userId, pasadoElFin)).toBe(false);
  });

  it("pulsar dos veces no es equivocarse: la segunda es un no-op amable", async () => {
    await suscribir("CANCELADA", 20);

    const res = await pedir();

    expect(res.status).toBe(200);
    expect((await res.json()).mensaje).toBe(MSG_VIP_YA_CANCELADA);
    // Y NO se vuelve a llamar a Stripe por algo que ya está pedido.
    expect(H.update).not.toHaveBeenCalled();
  });
});

describe("cuando el raíl no está", () => {
  it("sin claves de Stripe: 503 con copy humano y sin filtrar nada", async () => {
    await suscribir("ACTIVA", 20);
    H.claveStripe = undefined;

    const res = await pedir();

    expect(res.status).toBe(503);
    const cuerpo = await res.json();
    expect(cuerpo.error.message).toBe(MSG_VIP_PAGO_NO_DISPONIBLE);
    expect(JSON.stringify(cuerpo)).not.toMatch(/STRIPE|Stripe|sk_/);
  });

  it("sin el id de la suscripción en Stripe: se dice que no, en vez de fingir que se ha hecho", async () => {
    // Pasa si la fila se creó a mano (un ajuste del equipo). Mentir aquí dejaría a alguien
    // creyendo que ha cancelado mientras le siguen cobrando.
    await suscribir("ACTIVA", 20, null);

    const res = await pedir();

    expect(res.status).toBe(503);
    expect(H.update).not.toHaveBeenCalled();
  });
});
