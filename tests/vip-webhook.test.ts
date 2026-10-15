/**
 * EL WEBHOOK DE LA SUSCRIPCIÓN — la puerta por la que se activa el VIP.
 *
 * Punto de entrada SIN sesión: lo llama el servidor de Stripe. Su única autenticación es la FIRMA
 * sobre el cuerpo crudo, así que lo primero que se fija es que esa firma de verdad decide — sin
 * ella, cualquiera se regala el sello, el color y el boost semanal con un `curl`.
 *
 * Lo demás:
 *  - EL FIN DE PERIODO VIVE EN LA LÍNEA de la suscripción, no en la suscripción. Leerlo del sitio
 *    de antes daba `undefined`, y de ahí una fecha inválida guardada: aquí se comprueba que una
 *    suscripción sin ese dato NO escribe nada.
 *  - ES IDEMPOTENTE POR CONSTRUCCIÓN: la fecha se escribe en absoluto, así que reenviar el mismo
 *    evento deja la misma fila. No hay nada que sumar y por eso no hace falta clave.
 *  - 200 EN TODO LO QUE NO SEA FIRMA MALA O FALLO NUESTRO: un evento ajeno o sin metadata no se
 *    arregla reintentando, y un 4xx haría que Stripe reenviara en bucle.
 *
 * La firma se construye DE VERDAD con el SDK (`generateTestHeaderString`): un doble de la
 * verificación dejaría sin probar lo único que protege esta ruta.
 */
import Stripe from "stripe";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

const SECRETO_WEBHOOK = "whsec_TEST_FIXTURE_vip_webhook";

const H = vi.hoisted(() => ({ prisma: null as unknown as PrismaClient }));
vi.mock("@/server/db/client", () => ({
  get prisma() {
    return H.prisma;
  },
}));
vi.mock("@/config/env", () => ({
  env: {
    AUTH_SECRET: "TEST-FIXTURE-auth-secret-vip",
    APP_URL: "https://x.test",
    STRIPE_SECRET_KEY: "sk_test_FIXTURE",
    STRIPE_WEBHOOK_SECRET: "whsec_TEST_FIXTURE_vip_webhook",
  },
}));

import { POST as webhook } from "../src/app/api/vip/webhook/route";

let prisma: PrismaClient;
let userId: string;

const FIN = new Date("2026-11-15T12:00:00Z");
const AHORA = new Date("2026-10-15T12:00:00Z");

beforeAll(() => {
  prisma = createTestPrisma();
  H.prisma = prisma;
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
  userId = await crearUsuario(prisma, { username: "la_suscrita" });
});

/** El cuerpo de un evento de suscripción, con la forma que manda Stripe de verdad. */
function cuerpoEvento(
  opciones: {
    tipo?: string;
    subId?: string;
    usuario?: string | null;
    estado?: string;
    cancelaAlFinal?: boolean;
    /** En SEGUNDOS, y DENTRO de la línea: es donde vive desde el cambio de versión de la API. */
    finSegundos?: number | null;
    /** `true` para mandarlo en el sitio ANTIGUO (la suscripción), que es como NO hay que leerlo. */
    finEnLaSuscripcion?: boolean;
  } = {},
): string {
  const metadata: Record<string, string> = {};
  if (opciones.usuario !== null) metadata["userId"] = opciones.usuario ?? userId;
  const fin = opciones.finSegundos === undefined ? FIN.getTime() / 1000 : opciones.finSegundos;
  return JSON.stringify({
    id: `evt_${Math.random().toString(36).slice(2)}`,
    type: opciones.tipo ?? "customer.subscription.updated",
    data: {
      object: {
        id: opciones.subId ?? "sub_test_1",
        object: "subscription",
        status: opciones.estado ?? "active",
        cancel_at_period_end: opciones.cancelaAlFinal ?? false,
        canceled_at: null,
        customer: "cus_test_1",
        ...(opciones.finEnLaSuscripcion ? { current_period_end: fin } : {}),
        items: {
          data: [
            {
              id: "si_test_1",
              ...(opciones.finEnLaSuscripcion
                ? {}
                : fin === null
                  ? {}
                  : { current_period_end: fin }),
            },
          ],
        },
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
  return new Request("http://test/api/vip/webhook", {
    method: "POST",
    headers: cabeceras,
    body: cuerpo,
  });
}

const suscripcion = () => prisma.subscription.findUnique({ where: { userId } });

describe("la firma es lo único que protege esta ruta", () => {
  it("con firma válida, se registra la suscripción", async () => {
    const res = await webhook(peticion(cuerpoEvento()));

    expect(res.status).toBe(200);
    const s = await suscripcion();
    expect(s?.estado).toBe("ACTIVA");
    expect(s?.periodoFin.toISOString()).toBe(FIN.toISOString());
    expect(s?.stripeSubscriptionId).toBe("sub_test_1");
  });

  it("CON FIRMA INVÁLIDA, 400 y NADA escrito", async () => {
    // Sin esto, cualquiera se regala el VIP con un `curl`.
    const res = await webhook(peticion(cuerpoEvento(), "t=1,v1=falsa"));
    expect(res.status).toBe(400);
    expect(await suscripcion()).toBeNull();
  });

  it("y sin la cabecera de firma tampoco", async () => {
    const res = await webhook(peticion(cuerpoEvento(), null));
    expect(res.status).toBe(400);
    expect(await suscripcion()).toBeNull();
  });

  it("el cuerpo se verifica TAL CUAL llegó: reserializarlo invalida la firma", async () => {
    // ┌─ ESTE CASO NO MEDÍA NADA EN SU PRIMERA VERSIÓN ─────────────────────────────────────────┐
    // │ "Manipulaba" el cuerpo con `JSON.stringify(JSON.parse(x))`, que sobre un JSON compacto   │
    // │ devuelve EXACTAMENTE los mismos bytes: la firma seguía valiendo y el caso pasaba en      │
    // │ verde por no haber cambiado nada. Lo que de verdad ocurre al parsear y volver a          │
    // │ serializar es que cambia el FORMATO, así que eso es lo que hay que reproducir.           │
    // └──────────────────────────────────────────────────────────────────────────────────────────┘
    const cuerpo = cuerpoEvento();
    const firma = Stripe.webhooks.generateTestHeaderString({
      payload: cuerpo,
      secret: SECRETO_WEBHOOK,
    });
    const reserializado = JSON.stringify(JSON.parse(cuerpo), null, 2);
    expect(reserializado, "la fixture no cambió los bytes").not.toBe(cuerpo);

    const res = await webhook(peticion(reserializado, firma));

    expect(res.status).toBe(400);
    expect(await suscripcion()).toBeNull();
  });
});

describe("lo que se escribe", () => {
  it("la baja pedida se guarda como CANCELADA, y sigue dando acceso", async () => {
    const { esVipActivo } = await import("../src/lib/vip");
    await webhook(peticion(cuerpoEvento({ estado: "active", cancelaAlFinal: true })));

    const s = await suscripcion();
    expect(s?.estado).toBe("CANCELADA");
    expect(esVipActivo(s, AHORA), "cancelar cortó el acceso ya pagado").toBe(true);
  });

  it("y una suscripción terminada deja de dar acceso por la FECHA, no por el estado", async () => {
    const pasado = new Date("2026-09-15T12:00:00Z");
    const { esVipActivo } = await import("../src/lib/vip");
    await webhook(
      peticion(cuerpoEvento({ estado: "canceled", finSegundos: pasado.getTime() / 1000 })),
    );

    const s = await suscripcion();
    expect(esVipActivo(s, AHORA)).toBe(false);
  });

  it("REENVIAR EL MISMO EVENTO deja la misma fila: no regala otro mes", async () => {
    const cuerpo = cuerpoEvento();
    await webhook(peticion(cuerpo));
    const primera = await suscripcion();
    await webhook(peticion(cuerpo));
    await webhook(peticion(cuerpo));

    expect(await prisma.subscription.count()).toBe(1);
    const ultima = await suscripcion();
    expect(ultima?.periodoFin.toISOString()).toBe(primera?.periodoFin.toISOString());
  });

  it("y una renovación SÍ mueve la fecha hacia delante", async () => {
    await webhook(peticion(cuerpoEvento()));
    const siguiente = new Date("2026-12-15T12:00:00Z");
    await webhook(peticion(cuerpoEvento({ finSegundos: siguiente.getTime() / 1000 })));

    expect((await suscripcion())?.periodoFin.toISOString()).toBe(siguiente.toISOString());
  });
});

describe("lo que se ignora, con 200", () => {
  it("un evento que no es nuestro", async () => {
    const res = await webhook(peticion(cuerpoEvento({ tipo: "invoice.paid" })));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ignorado: "invoice.paid" });
    expect(await suscripcion()).toBeNull();
  });

  it("una suscripción sin nuestra metadata: no se sabe de quién es", async () => {
    const res = await webhook(peticion(cuerpoEvento({ usuario: null })));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ignorado: "sin_metadata" });
    expect(await prisma.subscription.count()).toBe(0);
  });

  it("SIN FIN DE PERIODO LEGIBLE no se escribe una fecha inventada", async () => {
    // ┌─ EL CASO QUE JUSTIFICA `finDePeriodo` ──────────────────────────────────────────────────┐
    // │ `current_period_end` se mudó de la suscripción a sus LÍNEAS. Si llega una sin ese dato   │
    // │ —o si alguien lo lee del sitio de antes— lo que NO puede pasar es guardar un             │
    // │ `Invalid Date`: quedaría alguien con un VIP que no se sabe cuándo acaba.                 │
    // └──────────────────────────────────────────────────────────────────────────────────────────┘
    const res = await webhook(peticion(cuerpoEvento({ finSegundos: null })));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ignorado: "sin_periodo" });
    expect(await prisma.subscription.count()).toBe(0);
  });

  it("y si SOLO viene en el sitio ANTIGUO, tampoco se escribe", async () => {
    // Mismo caso, por el otro lado: una suscripción con `current_period_end` arriba y sin él en la
    // línea es exactamente lo que vería un código que lee donde no debe.
    const res = await webhook(peticion(cuerpoEvento({ finEnLaSuscripcion: true })));
    expect(await res.json()).toEqual({ ignorado: "sin_periodo" });
    expect(await prisma.subscription.count()).toBe(0);
  });
});
