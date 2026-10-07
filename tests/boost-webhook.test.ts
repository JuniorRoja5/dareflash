/**
 * EL WEBHOOK DE STRIPE — la puerta por la que entran los boosts pagados.
 *
 * Es un punto de entrada SIN sesión: lo llama el servidor de Stripe, no un navegador. Su única
 * autenticación es la FIRMA sobre el cuerpo crudo, así que lo primero que se fija aquí es que esa
 * firma de verdad decide. Lo demás:
 *
 *  - FIRMA INVÁLIDA → 400 y NADA acreditado. Es el caso en que el mensaje no es de quien dice ser.
 *  - EL CUERPO SE LEE CRUDO. La firma se calcula sobre esos bytes; reserializar el JSON la rompe.
 *  - 200 EN TODO LO DEMÁS, incluso al no acreditar: un 4xx/5xx haría que Stripe reintentara en
 *    bucle una entrega que nunca va a ir mejor (un importe que no cuadra no mejora al reenviarlo).
 *  - DOS TIPOS DE EVENTO, UNA COMPRA: `completed` y `async_payment_succeeded` traen la misma
 *    sesión, así que acreditan una sola vez.
 *  - UN PAGO NO COBRADO todavía no acredita.
 *
 * La firma se construye DE VERDAD con el SDK de Stripe (`generateTestHeaderString`), no se mockea:
 * un doble de la verificación dejaría sin probar justamente lo único que protege esta ruta.
 */
import Stripe from "stripe";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { PAQUETES_BOOST } from "../src/config/constants";
import type { PrismaClient } from "../src/generated/prisma/client";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

const SECRETO_WEBHOOK = "whsec_TEST_FIXTURE_boost_webhook";

const H = vi.hoisted(() => ({ prisma: null as unknown as PrismaClient }));
vi.mock("@/server/db/client", () => ({
  get prisma() {
    return H.prisma;
  },
}));
vi.mock("@/config/env", () => ({
  env: {
    AUTH_SECRET: "TEST-FIXTURE-auth-secret-boost",
    APP_URL: "https://x.test",
    STRIPE_SECRET_KEY: "sk_test_FIXTURE",
    STRIPE_WEBHOOK_SECRET: "whsec_TEST_FIXTURE_boost_webhook",
  },
}));

import { POST as webhook } from "../src/app/api/boost/webhook/route";

let prisma: PrismaClient;
let userId: string;

beforeAll(() => {
  prisma = createTestPrisma();
  H.prisma = prisma;
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
  userId = await crearUsuario(prisma, { username: "la_pagadora" });
});

/** El cuerpo de un evento de sesión de pago, tal y como lo manda Stripe. */
function cuerpoEvento(opciones: {
  tipo?: string;
  sessionId?: string;
  packageId?: string | null;
  usuario?: string | null;
  pagadoCents?: number | null;
  estadoPago?: string;
}): string {
  const metadata: Record<string, string> = {};
  if (opciones.usuario !== null) metadata["userId"] = opciones.usuario ?? userId;
  if (opciones.packageId !== null) metadata["packageId"] = opciones.packageId ?? "boost_5";
  return JSON.stringify({
    id: `evt_${Math.random().toString(36).slice(2)}`,
    type: opciones.tipo ?? "checkout.session.completed",
    data: {
      object: {
        id: opciones.sessionId ?? "cs_test_1",
        object: "checkout.session",
        payment_status: opciones.estadoPago ?? "paid",
        amount_total:
          opciones.pagadoCents === undefined
            ? PAQUETES_BOOST.boost_5.precioCents
            : opciones.pagadoCents,
        metadata,
      },
    },
  });
}

/** Petición con firma VÁLIDA, generada por el propio SDK sobre ese cuerpo exacto. */
function peticion(cuerpo: string, firma?: string | null): Request {
  const cabeceras: Record<string, string> = { "content-type": "application/json" };
  const f =
    firma === undefined
      ? Stripe.webhooks.generateTestHeaderString({ payload: cuerpo, secret: SECRETO_WEBHOOK })
      : firma;
  if (f !== null) cabeceras["stripe-signature"] = f;
  return new Request("http://test/api/boost/webhook", {
    method: "POST",
    headers: cabeceras,
    body: cuerpo,
  });
}

const saldo = async () =>
  (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).boostBalance;

describe("la firma es la puerta", () => {
  it("una firma VÁLIDA acredita", async () => {
    const res = await webhook(peticion(cuerpoEvento({})));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ estado: "acreditado" });
    expect(await saldo()).toBe(5);
  });

  it("una firma INVENTADA no acredita, y responde 400", async () => {
    const res = await webhook(peticion(cuerpoEvento({}), "t=1,v1=0000000000"));
    expect(res.status).toBe(400);
    expect(await saldo()).toBe(0);
    expect(await prisma.boostLedger.count()).toBe(0);
  });

  it("SIN cabecera de firma, tampoco", async () => {
    const res = await webhook(peticion(cuerpoEvento({}), null));
    expect(res.status).toBe(400);
    expect(await saldo()).toBe(0);
  });

  it("y una firma de OTRO cuerpo no sirve: se firma el cuerpo exacto", async () => {
    // Es lo que rompe reserializar el JSON antes de verificar.
    const firmaDeOtro = Stripe.webhooks.generateTestHeaderString({
      payload: cuerpoEvento({ sessionId: "cs_OTRO" }),
      secret: SECRETO_WEBHOOK,
    });
    const res = await webhook(peticion(cuerpoEvento({}), firmaDeOtro));
    expect(res.status).toBe(400);
    expect(await saldo()).toBe(0);
  });

  it("el cuerpo se verifica TAL CUAL llegó, byte a byte", async () => {
    // El cuerpo va INDENTADO a propósito. Un `JSON.parse` + `JSON.stringify` antes de verificar lo
    // dejaría compacto —los mismos datos, otros bytes— y la firma dejaría de cuadrar. Con un
    // cuerpo ya compacto el viaje de ida y vuelta no cambia nada y el fallo no se vería: por eso
    // este caso usa uno con espacios.
    const compacto = cuerpoEvento({ sessionId: "cs_indentado" });
    const indentado = JSON.stringify(JSON.parse(compacto) as unknown, null, 2);
    expect(indentado).not.toBe(compacto);

    const res = await webhook(peticion(indentado));

    expect(res.status, "el cuerpo se tocó antes de verificar la firma").toBe(200);
    expect(await saldo()).toBe(5);
  });

  it("una firma de otro SECRETO tampoco", async () => {
    const cuerpo = cuerpoEvento({});
    const firmaAjena = Stripe.webhooks.generateTestHeaderString({
      payload: cuerpo,
      secret: "whsec_OTRO_SECRETO",
    });
    const res = await webhook(peticion(cuerpo, firmaAjena));
    expect(res.status).toBe(400);
    expect(await saldo()).toBe(0);
  });
});

describe("exactamente una vez, también por aquí", () => {
  it("la misma entrega dos veces acredita UNA", async () => {
    const cuerpo = cuerpoEvento({});
    expect((await webhook(peticion(cuerpo))).status).toBe(200);
    const segunda = await webhook(peticion(cuerpo));

    expect(await segunda.json()).toEqual({ estado: "repetida" });
    expect(await saldo()).toBe(5);
    expect(await prisma.boostLedger.count()).toBe(1);
  });

  it("DOS TIPOS de evento de la misma compra acreditan UNA", async () => {
    // `completed` y `async_payment_succeeded` traen la misma sesión. Con la clave por evento, esto
    // serían diez boosts en vez de cinco.
    await webhook(peticion(cuerpoEvento({ tipo: "checkout.session.completed" })));
    await webhook(peticion(cuerpoEvento({ tipo: "checkout.session.async_payment_succeeded" })));

    expect(await saldo()).toBe(5);
    expect(await prisma.boostLedger.count()).toBe(1);
  });
});

describe("200 en todo lo que no sea una firma mala", () => {
  it("un evento que no nos interesa se ignora, sin reintento", async () => {
    const res = await webhook(peticion(cuerpoEvento({ tipo: "customer.created" })));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ignorado: "customer.created" });
    expect(await saldo()).toBe(0);
  });

  it("un pago AÚN NO cobrado no acredita, pero responde 200", async () => {
    const res = await webhook(peticion(cuerpoEvento({ estadoPago: "unpaid" })));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ignorado: "no_pagado" });
    expect(await saldo()).toBe(0);
  });

  it("sin nuestra metadata no se sabe a quién acreditar: 200 e ignorado", async () => {
    const res = await webhook(peticion(cuerpoEvento({ usuario: null })));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ignorado: "sin_metadata" });
    expect(await saldo()).toBe(0);
  });

  it("un importe que no cuadra se RECHAZA, y aun así es 200", async () => {
    // Reintentar no va a arreglar un importe que no cuadra: un 5xx aquí sería un bucle.
    const res = await webhook(peticion(cuerpoEvento({ pagadoCents: 1 })));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ estado: "rechazada" });
    expect(await saldo()).toBe(0);
  });

  it("un paquete inventado, igual", async () => {
    const res = await webhook(peticion(cuerpoEvento({ packageId: "boost_999" })));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ estado: "rechazada" });
    expect(await saldo()).toBe(0);
  });
});

describe("el paquete decide cuántos boosts, no el evento", () => {
  it.each(Object.keys(PAQUETES_BOOST) as (keyof typeof PAQUETES_BOOST)[])(
    "%s acredita lo del catálogo",
    async (packageId) => {
      const res = await webhook(
        peticion(
          cuerpoEvento({
            packageId,
            pagadoCents: PAQUETES_BOOST[packageId].precioCents,
            sessionId: `cs_${packageId}`,
          }),
        ),
      );
      expect(res.status).toBe(200);
      expect(await saldo()).toBe(PAQUETES_BOOST[packageId].boosts);
    },
  );
});
