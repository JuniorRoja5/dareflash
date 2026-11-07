/**
 * EL WEBHOOK DE LA COMPRA DE CRÉDITOS (Fase 9 · P11) — la puerta por la que entran los créditos pagados.
 *
 * La firma se construye DE VERDAD con el SDK de Stripe (`generateTestHeaderString`): un doble de la
 * verificación dejaría sin probar lo único que protege esta ruta.
 *
 * DIENTES: firma inventada → 400 y nada abonado; firma con el secreto de OTRO webhook (Boost) → 400;
 * moneda distinta → nada abonado aunque el importe cuadre; el mismo evento dos veces (y los dos tipos de
 * evento de una misma sesión) → un solo abono; un pago aún no cobrado no abona.
 */
import Stripe from "stripe";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_CURRENCY, PAQUETES_CREDITOS } from "../src/config/constants";
import type { PrismaClient } from "../src/generated/prisma/client";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

const SECRETO = "whsec_TEST_FIXTURE_creditos_webhook";
const SECRETO_DE_BOOST = "whsec_TEST_FIXTURE_boost_webhook";

const H = vi.hoisted(() => ({ prisma: null as unknown as PrismaClient }));
vi.mock("@/server/db/client", () => ({
  get prisma() {
    return H.prisma;
  },
}));
vi.mock("@/config/env", () => ({
  env: {
    AUTH_SECRET: "TEST-FIXTURE-auth-secret-creditos",
    APP_URL: "https://x.test",
    STRIPE_SECRET_KEY: "sk_test_FIXTURE",
    STRIPE_WEBHOOK_SECRET: "whsec_TEST_FIXTURE_boost_webhook",
    STRIPE_WEBHOOK_SECRET_CREDITOS: "whsec_TEST_FIXTURE_creditos_webhook",
  },
}));

import { POST as webhook } from "../src/app/api/empresa/creditos/webhook/route";

let prisma: PrismaClient;
let empresaId: string;

beforeAll(() => {
  prisma = createTestPrisma();
  H.prisma = prisma;
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
  const owner = await crearUsuario(prisma);
  empresaId = (
    await prisma.empresa.create({
      data: {
        ownerUserId: owner,
        nombre: "Panadería",
        tipoCuenta: "EMPRESA",
        tipoNegocio: "FISICO",
        estado: "VERIFICADA",
        paisIso: "ES",
        personaContacto: "Lucía",
      },
      select: { id: true },
    })
  ).id;
});

function cuerpoEvento(o: {
  tipo?: string;
  sessionId?: string;
  pagadoCents?: number;
  moneda?: string | null;
  estadoPago?: string;
}): string {
  return JSON.stringify({
    id: `evt_${Math.random().toString(36).slice(2)}`,
    type: o.tipo ?? "checkout.session.completed",
    data: {
      object: {
        id: o.sessionId ?? "cs_test_1",
        object: "checkout.session",
        payment_status: o.estadoPago ?? "paid",
        amount_total: o.pagadoCents ?? PAQUETES_CREDITOS.creditos_10.precioCents,
        currency: o.moneda === undefined ? DEFAULT_CURRENCY.toLowerCase() : o.moneda,
        metadata: { empresaId, packageId: "creditos_10" },
      },
    },
  });
}

function peticion(cuerpo: string, firma?: string | null, secreto = SECRETO): Request {
  const cabeceras: Record<string, string> = { "content-type": "application/json" };
  const f =
    firma === undefined
      ? Stripe.webhooks.generateTestHeaderString({ payload: cuerpo, secret: secreto })
      : firma;
  if (f !== null) cabeceras["stripe-signature"] = f;
  return new Request("http://test/api/empresa/creditos/webhook", {
    method: "POST",
    headers: cabeceras,
    body: cuerpo,
  });
}

const saldo = async () =>
  (await prisma.empresa.findUniqueOrThrow({ where: { id: empresaId } })).creditosSaldo;

describe("la firma es la puerta", () => {
  it("una firma VÁLIDA abona el paquete", async () => {
    const res = await webhook(peticion(cuerpoEvento({})));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ estado: "acreditado" });
    expect(await saldo()).toBe(10);
  });

  it("una firma INVENTADA: 400 y nada abonado; sin cabecera, igual", async () => {
    expect((await webhook(peticion(cuerpoEvento({}), "t=1,v1=0000000000"))).status).toBe(400);
    expect((await webhook(peticion(cuerpoEvento({}), null))).status).toBe(400);
    expect(await saldo()).toBe(0);
    expect(await prisma.creditoLedger.count()).toBe(0);
  });

  it("firmada con el secreto de OTRO webhook (Boost): 400, cada endpoint tiene el suyo", async () => {
    const res = await webhook(peticion(cuerpoEvento({}), undefined, SECRETO_DE_BOOST));
    expect(res.status).toBe(400);
    expect(await saldo()).toBe(0);
  });
});

describe("lo que se abona", () => {
  it("OTRA MONEDA: nada abonado aunque el importe cuadre (y 200: reenviarlo no lo arregla)", async () => {
    const res = await webhook(peticion(cuerpoEvento({ moneda: "jpy" })));
    expect(res.status).toBe(200);
    expect(await saldo()).toBe(0);
  });

  it("el MISMO evento dos veces, y los dos tipos de una misma sesión: un solo abono", async () => {
    const cuerpo = cuerpoEvento({});
    await webhook(peticion(cuerpo));
    await webhook(peticion(cuerpo));
    await webhook(peticion(cuerpoEvento({ tipo: "checkout.session.async_payment_succeeded" })));
    expect(await saldo()).toBe(10);
    expect(await prisma.creditoLedger.count({ where: { reason: "COMPRA" } })).toBe(1);
  });

  it("un pago aún no cobrado no abona; un evento que no es de pago se ignora", async () => {
    await webhook(peticion(cuerpoEvento({ estadoPago: "unpaid" })));
    await webhook(peticion(cuerpoEvento({ tipo: "customer.created" })));
    expect(await saldo()).toBe(0);
  });
});
