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
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MSG_CREDITOS_PAGO_NO_DISPONIBLE,
  MSG_CREDITOS_SIN_VERIFICAR,
  PAQUETES_CREDITOS,
} from "../src/config/constants";
import type { PrismaClient } from "../src/generated/prisma/client";
import { acreditarCompraCreditos } from "../src/server/services/creditos-compra";

import { createTestPrisma, crearUsuario, resetDb } from "./helpers/db";

const H = vi.hoisted(() => ({
  prisma: null as unknown as PrismaClient,
  ambito: {
    user: { userId: "", sessionId: "s1", emailVerified: new Date() },
    empresaId: "",
    estado: "VERIFICADA",
  },
  crearSesion: vi.fn(),
  recuperar: vi.fn(),
  claveStripe: "sk_test_FIXTURE" as string | undefined,
}));

vi.mock("@/server/db/client", () => ({
  get prisma() {
    return H.prisma;
  },
}));
vi.mock("@/config/env", () => ({
  env: {
    AUTH_SECRET: "TEST-FIXTURE-auth-secret-creditos",
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
          user: H.ambito.user,
          env: {
            AUTH_SECRET: "TEST-FIXTURE-auth-secret-creditos",
            APP_URL: "https://x.test",
            STRIPE_SECRET_KEY: H.claveStripe,
          },
          prisma: H.prisma,
        },
        rc,
      ),
}));
vi.mock("@/server/auth/empresa-actual", async () => {
  const real = await vi.importActual<typeof import("@/server/auth/empresa-actual")>(
    "@/server/auth/empresa-actual",
  );
  return { ...real, requireEmpresa: async () => H.ambito };
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
async function unaEmpresa(): Promise<{ id: string; owner: string }> {
  n += 1;
  const owner = await crearUsuario(prisma);
  await prisma.user.update({ where: { id: owner }, data: { email: `compra${n}@empresa.test` } });
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
  H.ambito.user.userId = e.owner;
  H.ambito.empresaId = e.id;
  H.ambito.estado = "VERIFICADA";
  H.claveStripe = "sk_test_FIXTURE";
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
      headers: { "content-type": "application/json", origin: "http://test" },
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
    expect(args().metadata).toEqual({ empresaId: H.ambito.empresaId, packageId: "creditos_100" });
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
    H.ambito.estado = "PENDIENTE";
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
      empresaId: H.ambito.empresaId,
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
