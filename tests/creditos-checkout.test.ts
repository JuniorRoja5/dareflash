/**
 * ABRIR EL PAGO DE CRÉDITOS Y BAJAR SU RECIBO (Fase 9 · P11): las dos rutas del portal, con la sesión y
 * Stripe doblados (lo que se prueba es QUÉ le pedimos a Stripe, y quién puede pedirlo).
 *
 * DIENTES:
 *  - El importe y los créditos salen del CATÁLOGO; uno mandado por el cliente se ignora.
 *  - La empresa de la `metadata` es la del CHOKEPOINT, nunca la del cuerpo.
 *  - Se pide el número fiscal en el Checkout (`tax_id_collection`), con dirección y cliente.
 *  - INERTE SIN CLAVES: 503 con copy humano, sin llamar a Stripe; sin verificar, 403.
 *  - El RECIBO de otra empresa es un 404, sin preguntar a Stripe; el suyo, una redirección a Stripe.
 *  - QUIEN COMPRA ES UNA CUENTA DE EMPRESA DE VERDAD (`esCuentaEmpresa = true`), con una sesión creada
 *    y validada como la del login, y la petición pasa por el `mutatingRoute` y el `requireEmpresa`
 *    REALES (Origin, sesión, CSRF y el candado de la cuenta de empresa). Antes los dos estaban
 *    doblados y el dueño era un usuario normal: la ruta llegó a producción bloqueando a la empresa
 *    que iba a pagar con esta suite en verde. Para romperlo: quitar `cuentaEmpresa: "permite"` de la
 *    ruta (rojo: la empresa recibe CUENTA_EMPRESA).
 */
import { falso } from "./helpers/valores-falsos";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MSG_CREDITOS_PAGO_NO_DISPONIBLE,
  MSG_CREDITOS_SIN_VERIFICAR,
  PAQUETES_CREDITOS,
} from "../src/config/constants";
import type { PrismaClient } from "../src/generated/prisma/client";
import { issueCsrfToken } from "../src/server/auth/csrf";
import { createSession, validateSession } from "../src/server/auth/session";
import { acreditarCompraCreditos } from "../src/server/services/creditos-compra";

import { createTestPrisma, crearUsuario, resetDb } from "./helpers/db";

// `vi.hoisted` corre ANTES que los imports: el helper de valores falsos se carga dentro.
const H = await vi.hoisted(async () => {
  const { falso } = await import("./helpers/valores-falsos");
  return {
    prisma: null as unknown as PrismaClient,
    /** El token CRUDO de la cookie de sesión: lo que el navegador manda tras el login. */
    token: "" as string,
    crearSesion: vi.fn(),
    recuperar: vi.fn(),
    claveStripe: falso("clave-stripe") as string | undefined,
  };
});

const SECRETO = falso("auth-secret-creditos");
const APP_URL = "https://x.test";

vi.mock("@/server/db/client", () => ({
  get prisma() {
    return H.prisma;
  },
}));
vi.mock("@/config/env", () => ({
  env: {
    AUTH_SECRET: falso("auth-secret-creditos"),
    APP_URL: "https://x.test",
    get STRIPE_SECRET_KEY() {
      return H.claveStripe;
    },
  },
}));
// Solo se dobla LEER LA COOKIE (`next/headers` no existe fuera de una petición de Next). La sesión se
// valida de verdad contra la BD, con la misma función que usa la app: misma forma que tras el login.
vi.mock("@/server/auth/current-user", async () => {
  const { validateSession } = await import("../src/server/auth/session");
  return { getCurrentUser: () => validateSession(H.prisma, H.token) };
});
vi.mock("@/server/pagos/stripe", async () => {
  const real =
    await vi.importActual<typeof import("@/server/pagos/stripe")>("@/server/pagos/stripe");
  return {
    ...real,
    clienteStripe: (secret: string | undefined) => {
      if (!secret) throw new real.PagosNoDisponibles("STRIPE_SECRET_KEY");
      return { checkout: { sessions: { create: H.crearSesion, retrieve: H.recuperar } } };
    },
  };
});

import { POST as checkout } from "../src/app/api/empresa/creditos/checkout/route";
import { GET as recibo } from "../src/app/api/empresa/creditos/[id]/recibo/route";

let prisma: PrismaClient;
beforeAll(() => {
  prisma = createTestPrisma();
  H.prisma = prisma;
});
afterAll(async () => {
  await prisma.$disconnect();
});

let n = 0;
let empresaId = "";
let sessionId = "";
async function unaEmpresa(): Promise<{ id: string; owner: string }> {
  n += 1;
  const owner = await crearUsuario(prisma);
  // UNA CUENTA DE EMPRESA REAL: la marca que lee el candado de `mutatingRoute`, y el correo
  // verificado que exige `requireEmpresa`.
  await prisma.user.update({
    where: { id: owner },
    data: { email: `compra${n}@empresa.test`, esCuentaEmpresa: true, emailVerified: new Date() },
  });
  const e = await prisma.empresa.create({
    data: {
      ownerUserId: owner,
      nombre: `Panadería ${n}`,
      tipoCuenta: "EMPRESA",
      tipoNegocio: "FISICO",
      estado: "VERIFICADA",
      paisIso: "ES",
      personaContacto: "Lucía",
    },
    select: { id: true },
  });
  return { id: e.id, owner };
}

beforeEach(async () => {
  await resetDb(prisma);
  const e = await unaEmpresa();
  empresaId = e.id;
  const s = await createSession(prisma, e.owner);
  H.token = s.rawToken;
  sessionId = s.sessionId;
  H.claveStripe = falso("clave-stripe");
  H.crearSesion
    .mockReset()
    .mockResolvedValue({ id: "cs_test_1", url: "https://stripe.test/pagar" });
  H.recuperar.mockReset().mockResolvedValue({
    payment_intent: { latest_charge: { receipt_url: "https://pay.stripe.com/receipts/r_1" } },
  });
});

const pedir = (cuerpo: unknown) =>
  checkout(
    new Request("http://test/api/empresa/creditos/checkout", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: APP_URL,
        "x-csrf-token": issueCsrfToken(SECRETO, sessionId),
      },
      body: JSON.stringify(cuerpo),
    }),
    undefined,
  );
type Args = {
  line_items: { price_data: { unit_amount: number; currency: string } }[];
  metadata: Record<string, string>;
  tax_id_collection: { enabled: boolean };
  customer_creation: string;
  billing_address_collection: string;
};
const args = () => H.crearSesion.mock.calls[0]?.[0] as Args;

describe("abrir el pago", () => {
  it("la sesión es la de una CUENTA DE EMPRESA, y el candado real la deja pasar", async () => {
    // El control: si la sesión no llevara la marca, el test de abajo no probaría el candado.
    expect((await validateSession(prisma, H.token))?.esCuentaEmpresa).toBe(true);
    const res = await pedir({ packageId: "creditos_10" });
    const cuerpo = await res.json();
    expect(cuerpo).not.toMatchObject({ error: { code: "CUENTA_EMPRESA" } });
    expect(res.status).toBe(200);
    expect(cuerpo).toMatchObject({ url: "https://stripe.test/pagar" });
  });

  it("y las barreras de fuera siguen: sin CSRF no se abre nada", async () => {
    const res = await checkout(
      new Request("http://test/api/empresa/creditos/checkout", {
        method: "POST",
        headers: { "content-type": "application/json", origin: APP_URL },
        body: JSON.stringify({ packageId: "creditos_10" }),
      }),
      undefined,
    );
    expect(res.status).toBe(403);
    expect(H.crearSesion).not.toHaveBeenCalled();
  });

  it("un participante (sin empresa) recibe 404, no un pago", async () => {
    const u = await crearUsuario(prisma);
    await prisma.user.update({ where: { id: u }, data: { emailVerified: new Date() } });
    const s = await createSession(prisma, u);
    H.token = s.rawToken;
    sessionId = s.sessionId;
    expect((await pedir({ packageId: "creditos_10" })).status).toBe(404);
    expect(H.crearSesion).not.toHaveBeenCalled();
  });

  it.each(Object.keys(PAQUETES_CREDITOS) as (keyof typeof PAQUETES_CREDITOS)[])(
    "%s se cobra por su importe del catálogo, en USD",
    async (packageId) => {
      expect((await pedir({ packageId })).status).toBe(200);
      expect(args().line_items[0]?.price_data).toMatchObject({
        unit_amount: PAQUETES_CREDITOS[packageId].precioCents,
        currency: "usd",
      });
    },
  );

  it("el precio y la empresa del cliente se IGNORAN: manda el catálogo y el chokepoint", async () => {
    await pedir({ packageId: "creditos_100", precioCents: 1, empresaId: "la_de_otro" });
    expect(args().line_items[0]?.price_data.unit_amount).toBe(3000);
    expect(args().metadata).toEqual({ empresaId, packageId: "creditos_100" });
  });

  it("pide el número fiscal (con dirección y cliente), para que conste en sus documentos", async () => {
    await pedir({ packageId: "creditos_10" });
    expect(args()).toMatchObject({
      tax_id_collection: { enabled: true },
      customer_creation: "always",
      billing_address_collection: "required",
    });
  });

  it("un paquete inventado no llega a Stripe", async () => {
    expect((await pedir({ packageId: "creditos_999" })).status).toBe(400);
    expect(H.crearSesion).not.toHaveBeenCalled();
  });

  it("INERTE SIN CLAVES: 503 con copy humano, sin el nombre de la variable", async () => {
    H.claveStripe = undefined;
    const res = await pedir({ packageId: "creditos_10" });
    expect(res.status).toBe(503);
    const cuerpo = JSON.stringify(await res.json());
    expect(cuerpo).toContain(MSG_CREDITOS_PAGO_NO_DISPONIBLE);
    expect(cuerpo).not.toContain("STRIPE");
    expect(H.crearSesion).not.toHaveBeenCalled();
  });

  it("una empresa sin verificar no compra", async () => {
    await prisma.empresa.update({ where: { id: empresaId }, data: { estado: "PENDIENTE" } });
    const res = await pedir({ packageId: "creditos_10" });
    expect(res.status).toBe(403);
    expect(JSON.stringify(await res.json())).toContain(MSG_CREDITOS_SIN_VERIFICAR);
    expect(H.crearSesion).not.toHaveBeenCalled();
  });
});

describe("el recibo", () => {
  const bajar = (id: string) =>
    recibo(new Request(`http://test/api/empresa/creditos/${id}/recibo`), {
      params: Promise.resolve({ id }),
    });

  it("el SUYO: redirige a la página del recibo de Stripe", async () => {
    await acreditarCompraCreditos(prisma, {
      empresaId,
      packageId: "creditos_10",
      sessionId: "cs_propia",
      pagadoCents: 500,
      moneda: "usd",
    });
    const mov = await prisma.creditoLedger.findFirstOrThrow({ where: { reason: "COMPRA" } });
    const res = await bajar(mov.id);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://pay.stripe.com/receipts/r_1");
  });

  it("el de OTRA empresa: 404, y a Stripe no se le pregunta nada", async () => {
    const otra = await unaEmpresa();
    await acreditarCompraCreditos(prisma, {
      empresaId: otra.id,
      packageId: "creditos_10",
      sessionId: "cs_ajena",
      pagadoCents: 500,
      moneda: "usd",
    });
    const mov = await prisma.creditoLedger.findFirstOrThrow({ where: { empresaId: otra.id } });
    const res = await bajar(mov.id);
    expect(res.status).toBe(404);
    expect(H.recuperar).not.toHaveBeenCalled();
  });
});
