/**
 * CADA WEBHOOK ATIENDE SOLO SU TIPO DE PAGO (Fase 11 · PW).
 *
 * Stripe manda a cada endpoint TODOS los eventos del tipo al que está suscrito: el
 * `checkout.session.completed` de una compra de créditos llega también al webhook de Boost, y el de
 * un alta de VIP llega a los dos. El 13 nov, el de Boost escribió «sin metadata de compra» por una
 * compra de créditos. Antes cada webhook reconocía lo suyo porque los NOMBRES de los campos no
 * coincidían —una convención—; ahora el `tipo` va escrito en la metadata y manda él.
 *
 * Lo que fija, contra las TRES rutas reales y con firmas DE VERDAD (cada una con su secreto):
 *  - lo AJENO se descarta en silencio: 200, `ignorado: "otro_tipo"`, nada abonado y NADA en el log;
 *  - un pago DE SU TIPO al que le falta a quién abonar SÍ escribe el error;
 *  - un tipo desconocido no abona en ningún webhook;
 *  - el tipo escrito GANA a la forma: una compra marcada como de créditos con la forma exacta de una
 *    de Boost (usuario, paquete y precio de Boost) no abona boosts. Es el caso que la convención de
 *    antes no paraba;
 *  - LAS DE ANTES, sin tipo, se reconocen por su forma y se abonan, y un reenvío ya con tipo de la
 *    misma sesión no abona otra vez (la clave sigue siendo la de la sesión).
 *
 * Para romperlo a propósito: quitar el descarte por tipo de un webhook (rojo: escribe en el log o
 * abona lo ajeno), hacer que acepte también el tipo de otro (rojo), o quitar la deducción de la forma
 * antigua en `tipoDePago` (rojo: las sesiones de antes dejan de abonarse).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { falso } from "./helpers/valores-falsos";
import Stripe from "stripe";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_CURRENCY, PAQUETES_BOOST, PAQUETES_CREDITOS } from "../src/config/constants";
import type { PrismaClient } from "../src/generated/prisma/client";
import { conTipo, tipoDePago } from "../src/lib/pago-tipo";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";
import { RAIZ, sinComentarios } from "./helpers/grafo-imports";

const SECRETOS = {
  boost: falso("boost_webhook"),
  creditos: falso("creditos_webhook"),
  vip: falso("vip_webhook"),
};

const H = vi.hoisted(() => ({ prisma: null as unknown as PrismaClient }));
vi.mock("@/server/db/client", () => ({
  get prisma() {
    return H.prisma;
  },
}));
vi.mock("@/config/env", () => ({
  env: {
    AUTH_SECRET: falso("auth-secret-por-tipo"),
    APP_URL: "https://x.test",
    STRIPE_SECRET_KEY: falso("clave-stripe"),
    STRIPE_WEBHOOK_SECRET: falso("boost_webhook"),
    STRIPE_WEBHOOK_SECRET_CREDITOS: falso("creditos_webhook"),
    STRIPE_WEBHOOK_SECRET_VIP: falso("vip_webhook"),
  },
}));

import { POST as webhookBoost } from "../src/app/api/boost/webhook/route";
import { POST as webhookCreditos } from "../src/app/api/empresa/creditos/webhook/route";
import { POST as webhookVip } from "../src/app/api/vip/webhook/route";

let prisma: PrismaClient;
let userId: string;
let empresaId: string;
let errores: ReturnType<typeof vi.spyOn>;

beforeAll(() => {
  prisma = createTestPrisma();
  H.prisma = prisma;
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
  userId = await crearUsuario(prisma, { username: "la_compradora" });
  empresaId = (
    await prisma.empresa.create({
      data: {
        ownerUserId: userId,
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
  errores = vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  errores.mockRestore();
});

// ---------------------------------------------------------------------------------------------------
// Los cuerpos, como los manda Stripe
// ---------------------------------------------------------------------------------------------------

function sesion(
  metadata: Record<string, string>,
  o: { id?: string; pagadoCents?: number; tipoEvento?: string } = {},
): string {
  return JSON.stringify({
    id: `evt_${Math.random().toString(36).slice(2)}`,
    type: o.tipoEvento ?? "checkout.session.completed",
    data: {
      object: {
        id: o.id ?? "cs_test_1",
        object: "checkout.session",
        payment_status: "paid",
        amount_total: o.pagadoCents ?? PAQUETES_BOOST.boost_5.precioCents,
        currency: DEFAULT_CURRENCY.toLowerCase(),
        metadata,
      },
    },
  });
}

function suscripcion(metadata: Record<string, string>): string {
  return JSON.stringify({
    id: `evt_${Math.random().toString(36).slice(2)}`,
    type: "customer.subscription.created",
    data: {
      object: {
        id: "sub_test_1",
        object: "subscription",
        status: "active",
        cancel_at_period_end: false,
        canceled_at: null,
        customer: "cus_test_1",
        items: { data: [{ id: "si_1", current_period_end: Date.now() / 1000 + 30 * 86_400 }] },
        metadata,
      },
    },
  });
}

/** Firmada DE VERDAD con el secreto del endpoint al que va: cada webhook tiene el suyo. */
function peticion(destino: keyof typeof SECRETOS, cuerpo: string): Request {
  return new Request(`http://test/api/${destino}/webhook`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "stripe-signature": Stripe.webhooks.generateTestHeaderString({
        payload: cuerpo,
        secret: SECRETOS[destino],
      }),
    },
    body: cuerpo,
  });
}

const enviar = {
  boost: (c: string) => webhookBoost(peticion("boost", c)),
  creditos: (c: string) => webhookCreditos(peticion("creditos", c)),
  vip: (c: string) => webhookVip(peticion("vip", c)),
};

/** Las metadatas que escribe hoy cada checkout (con el MISMO helper que ellos). */
const COMPRA = {
  boost: () => conTipo("boost", { userId, packageId: "boost_5" }),
  creditos: () => conTipo("creditos", { empresaId, packageId: "creditos_10" }),
  vip: () => conTipo("vip", { userId, plan: "VIP_MYTHIC" }),
};

const boosts = async () =>
  (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).boostBalance;
const creditos = async () =>
  (await prisma.empresa.findUniqueOrThrow({ where: { id: empresaId } })).creditosSaldo;

async function nadaAbonado() {
  expect(await prisma.boostLedger.count(), "se abonaron boosts").toBe(0);
  expect(await prisma.creditoLedger.count(), "se abonaron créditos").toBe(0);
  expect(await prisma.subscription.count(), "se registró una suscripción").toBe(0);
}

async function ignoradaEnSilencio(res: Response) {
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ignorado: "otro_tipo" });
  expect(errores, "un pago AJENO escribió en el log de errores").not.toHaveBeenCalled();
}

// ---------------------------------------------------------------------------------------------------

describe("lo ajeno se descarta en silencio", () => {
  it("una compra de CRÉDITOS en el webhook de Boost: 200, nada abonado, nada en el log", async () => {
    // El caso del 13 nov, tal cual.
    const res = await enviar.boost(
      sesion(COMPRA.creditos(), { pagadoCents: PAQUETES_CREDITOS.creditos_10.precioCents }),
    );
    await ignoradaEnSilencio(res);
    await nadaAbonado();
  });

  it("un alta de VIP (su sesión de Checkout) en los webhooks de Boost y de créditos", async () => {
    await ignoradaEnSilencio(await enviar.boost(sesion(COMPRA.vip())));
    await ignoradaEnSilencio(await enviar.creditos(sesion(COMPRA.vip())));
    await nadaAbonado();
  });

  it("una compra de Boost en el webhook de créditos", async () => {
    await ignoradaEnSilencio(await enviar.creditos(sesion(COMPRA.boost())));
    await nadaAbonado();
  });

  it("control: lo PROPIO de cada uno sí se abona (si no, lo de arriba pasaría sin distinguir)", async () => {
    expect((await enviar.boost(sesion(COMPRA.boost(), { id: "cs_b" }))).status).toBe(200);
    expect(await boosts()).toBe(PAQUETES_BOOST.boost_5.boosts);

    const r = await enviar.creditos(
      sesion(COMPRA.creditos(), {
        id: "cs_c",
        pagadoCents: PAQUETES_CREDITOS.creditos_10.precioCents,
      }),
    );
    expect(await r.json()).toEqual({ estado: "acreditado" });
    expect(await creditos()).toBe(PAQUETES_CREDITOS.creditos_10.creditos);

    expect(await (await enviar.vip(suscripcion(COMPRA.vip()))).json()).toEqual({
      estado: "registrada",
    });
    expect(errores).not.toHaveBeenCalled();
  });
});

describe("un pago DE SU TIPO al que le falta algo sí es un error", () => {
  it("Boost sin `userId`: escribe el error y no abona", async () => {
    const res = await enviar.boost(sesion(conTipo("boost", { packageId: "boost_5" })));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ignorado: "sin_metadata" });
    expect(errores).toHaveBeenCalledWith(expect.stringContaining("sin metadata de compra"));
    await nadaAbonado();
  });

  it("créditos sin `empresaId`, igual", async () => {
    const res = await enviar.creditos(
      sesion(conTipo("creditos", { packageId: "creditos_10" }), {
        pagadoCents: PAQUETES_CREDITOS.creditos_10.precioCents,
      }),
    );
    expect(await res.json()).toEqual({ ignorado: "sin_metadata" });
    expect(errores).toHaveBeenCalledWith(expect.stringContaining("sin metadata de compra"));
  });

  it("y VIP sin `userId`, igual", async () => {
    const res = await enviar.vip(suscripcion(conTipo("vip", { plan: "VIP_MYTHIC" })));
    expect(await res.json()).toEqual({ ignorado: "sin_metadata" });
    expect(errores).toHaveBeenCalledWith(expect.stringContaining("sin metadata de usuario"));
  });
});

describe("un tipo desconocido no abona en NINGÚN webhook", () => {
  it("aunque traiga la forma completa de cada uno", async () => {
    const regalo = (m: Record<string, string>) => ({ ...m, tipo: "regalo" });
    await enviar.boost(sesion(regalo(COMPRA.boost())));
    await enviar.creditos(
      sesion(regalo(COMPRA.creditos()), {
        pagadoCents: PAQUETES_CREDITOS.creditos_10.precioCents,
      }),
    );
    await enviar.vip(suscripcion(regalo(COMPRA.vip())));
    await nadaAbonado();
  });
});

describe("el tipo ESCRITO gana a la forma: ningún webhook acepta el de otro", () => {
  it("Boost: tipo `creditos` con la forma, el paquete y el precio EXACTOS de Boost", async () => {
    // Lo que la convención de antes no paraba: si una compra de créditos llevara también quién pagó
    // y un paquete con nombre de Boost, el webhook de Boost la habría abonado.
    const disfrazada = conTipo("creditos", { userId, packageId: "boost_5" });
    await ignoradaEnSilencio(await enviar.boost(sesion(disfrazada)));
    expect(await boosts()).toBe(0);
  });

  it("créditos: tipo `boost` con la forma exacta de créditos", async () => {
    const disfrazada = conTipo("boost", { empresaId, packageId: "creditos_10" });
    await ignoradaEnSilencio(
      await enviar.creditos(
        sesion(disfrazada, { pagadoCents: PAQUETES_CREDITOS.creditos_10.precioCents }),
      ),
    );
    expect(await creditos()).toBe(0);
  });

  it("VIP: una suscripción de tipo `boost` con usuario y plan", async () => {
    const disfrazada = conTipo("boost", { userId, plan: "VIP_MYTHIC" });
    await ignoradaEnSilencio(await enviar.vip(suscripcion(disfrazada)));
    expect(await prisma.subscription.count()).toBe(0);
  });
});

describe("compatibilidad: lo de antes no lleva tipo", () => {
  it("una compra de Boost de antes se abona, y su reenvío ya con tipo NO abona otra vez", async () => {
    const vieja = { userId, packageId: "boost_5" };
    expect(await (await enviar.boost(sesion(vieja, { id: "cs_vieja" }))).json()).toEqual({
      estado: "acreditado",
    });
    // La misma sesión otra vez —con o sin tipo—: la clave es la de la sesión, que no cambió.
    expect(await (await enviar.boost(sesion(vieja, { id: "cs_vieja" }))).json()).toEqual({
      estado: "repetida",
    });
    expect(
      await (await enviar.boost(sesion(conTipo("boost", vieja), { id: "cs_vieja" }))).json(),
    ).toEqual({ estado: "repetida" });
    expect(await boosts()).toBe(PAQUETES_BOOST.boost_5.boosts);
    expect(await prisma.boostLedger.count()).toBe(1);
  });

  it("una de créditos de antes se abona, y el webhook de Boost la sigue descartando", async () => {
    const vieja = sesion(
      { empresaId, packageId: "creditos_10" },
      { id: "cs_vieja_c", pagadoCents: PAQUETES_CREDITOS.creditos_10.precioCents },
    );
    await ignoradaEnSilencio(await enviar.boost(vieja));
    expect(await (await enviar.creditos(vieja)).json()).toEqual({ estado: "acreditado" });
    expect(await creditos()).toBe(PAQUETES_CREDITOS.creditos_10.creditos);
  });

  it("una suscripción VIP de antes (sin tipo, con `plan`) se sigue registrando en cada renovación", async () => {
    // La metadata de la suscripción se fija al crearla: las de antes llegan SIN tipo para siempre.
    const res = await enviar.vip(suscripcion({ userId, plan: "VIP_MYTHIC" }));
    expect(await res.json()).toEqual({ estado: "registrada" });
  });

  it("y el alta de VIP de antes (su sesión) tampoco ensucia el log de Boost ni el de créditos", async () => {
    await ignoradaEnSilencio(await enviar.boost(sesion({ userId, plan: "VIP_MYTHIC" })));
    await ignoradaEnSilencio(await enviar.creditos(sesion({ userId, plan: "VIP_MYTHIC" })));
  });
});

describe("cada checkout escribe SU tipo, y cada webhook pregunta por el suyo", () => {
  const leer = (f: string) => sinComentarios(readFileSync(path.join(RAIZ, f), "utf8"));
  const CASOS = [
    { tipo: "boost", checkout: "src/app/api/boost/checkout/route.ts", metadatas: 1 },
    { tipo: "creditos", checkout: "src/app/api/empresa/creditos/checkout/route.ts", metadatas: 1 },
    // VIP en la SESIÓN y en la SUSCRIPCIÓN: la renovación llega con la segunda.
    { tipo: "vip", checkout: "src/app/api/vip/checkout/route.ts", metadatas: 2 },
  ] as const;
  const WEBHOOK = {
    boost: "src/app/api/boost/webhook/route.ts",
    creditos: "src/app/api/empresa/creditos/webhook/route.ts",
    vip: "src/app/api/vip/webhook/route.ts",
  } as const;

  it.each(CASOS)("checkout de $tipo: toda metadata pasa por conTipo con SU tipo", (c) => {
    const codigo = leer(c.checkout);
    const metadatas = [...codigo.matchAll(/metadata:\s*([^\n]*)/g)].map((m) => m[1]!.trim());
    expect(metadatas, "hay una metadata sin tipo").toHaveLength(c.metadatas);
    for (const m of metadatas) {
      expect(m.startsWith(`conTipo("${c.tipo}"`), `metadata sin su tipo: ${m}`).toBe(true);
    }
  });

  it.each(CASOS)("webhook de $tipo: descarta todo lo que no es SU tipo, antes de nada", (c) => {
    const codigo = leer(WEBHOOK[c.tipo]);
    const descartes = [...codigo.matchAll(/tipoDePago\([^)]*\)\s*!==\s*"(\w+)"/g)].map((m) => m[1]);
    expect(descartes, "el webhook no pregunta por SU tipo").toEqual([c.tipo]);
  });
});

describe("tipoDePago, la regla en un sitio", () => {
  it("el tipo escrito manda; uno fuera del catálogo es `desconocido`", () => {
    expect(tipoDePago({ tipo: "boost" })).toBe("boost");
    expect(tipoDePago({ tipo: "creditos", userId: "u", packageId: "boost_5" })).toBe("creditos");
    expect(tipoDePago({ tipo: "Boost" })).toBe("desconocido");
    expect(tipoDePago({ tipo: "" })).toBe("desconocido");
  });

  it("sin tipo, la forma antigua; sin forma, `null`", () => {
    expect(tipoDePago({ userId: "u", packageId: "boost_5" })).toBe("boost");
    expect(tipoDePago({ empresaId: "e", packageId: "creditos_10" })).toBe("creditos");
    expect(tipoDePago({ userId: "u", plan: "VIP_MYTHIC" })).toBe("vip");
    expect(tipoDePago({ packageId: "boost_5" })).toBeNull();
    expect(tipoDePago(null)).toBeNull();
    expect(tipoDePago(undefined)).toBeNull();
  });
});
