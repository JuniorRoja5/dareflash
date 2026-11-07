/**
 * LA COMPRA DE CRÉDITOS DE PUBLICIDAD (Fase 9 · P11), contra la base de datos.
 *
 * DIENTES:
 *  - Se abona el paquete del CATÁLOGO, por `aplicarCreditos`, con su fila COMPRA.
 *  - LA MONEDA ANTES QUE EL IMPORTE: otra divisa se rechaza AUNQUE el número cuadre; sin moneda, también.
 *  - El importe se contrasta contra la constante del paquete.
 *  - La misma sesión dos veces = UN abono (clave por sesión).
 *  - El recibo: la empresa A no ve el de B (null sin preguntar a Stripe); la suya, sí.
 *  - Ningún texto del portal llama «Factura» al recibo.
 *
 * Para romperlo a propósito: mover el chequeo de moneda debajo del importe o tolerar `moneda == null`
 * (rojo el de la divisa); quitar `empresaId` del where de `compraDeMiEmpresa` (rojo el del recibo); usar
 * el id del evento en la clave (rojo el de dos veces).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_CURRENCY, PAQUETES_CREDITOS } from "../src/config/constants";
import type { PrismaClient } from "../src/generated/prisma/client";
import { paquetesCreditosEnVenta } from "../src/lib/creditos-precio";
import {
  type StripeRecibos,
  acreditarCompraCreditos,
  claveCompraCreditos,
  reciboDeMiCompra,
} from "../src/server/services/creditos-compra";
import { misCreditos } from "../src/server/services/creditos";

import { createTestPrisma, crearUsuario, resetDb } from "./helpers/db";

let prisma: PrismaClient;
beforeAll(() => {
  prisma = createTestPrisma();
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
});

let n = 0;
async function unaEmpresa(): Promise<string> {
  n += 1;
  const owner = await crearUsuario(prisma);
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
  return e.id;
}

const usd = DEFAULT_CURRENCY.toLowerCase();
const compra = (empresaId: string, extra: Partial<Parameters<typeof acreditarCompraCreditos>[1]>) =>
  acreditarCompraCreditos(prisma, {
    empresaId,
    packageId: "creditos_30",
    sessionId: "cs_test_1",
    pagadoCents: PAQUETES_CREDITOS.creditos_30.precioCents,
    moneda: usd,
    ...extra,
  });
const saldo = async (e: string) =>
  (await prisma.empresa.findUniqueOrThrow({ where: { id: e } })).creditosSaldo;

describe("el abono", () => {
  it("abona el paquete del catálogo, con su fila COMPRA y la clave de la sesión", async () => {
    const e = await unaEmpresa();
    expect(await compra(e, {})).toEqual({ estado: "acreditado", creditos: 30, saldo: 30 });
    const fila = await prisma.creditoLedger.findFirstOrThrow({ where: { empresaId: e } });
    expect(fila).toMatchObject({
      delta: 30,
      reason: "COMPRA",
      refType: "STRIPE_CHECKOUT",
      refId: "cs_test_1",
      idempotencyKey: claveCompraCreditos("cs_test_1"),
    });
  });

  it("la misma sesión dos veces: UN abono", async () => {
    const e = await unaEmpresa();
    await compra(e, {});
    expect(await compra(e, {})).toEqual({ estado: "repetida" });
    expect(await saldo(e)).toBe(30);
    expect(await prisma.creditoLedger.count({ where: { empresaId: e } })).toBe(1);
  });

  it("OTRA MONEDA se rechaza aunque el importe cuadre; sin moneda, también", async () => {
    const e = await unaEmpresa();
    expect(await compra(e, { moneda: "jpy" })).toEqual({ estado: "rechazada", motivo: "MONEDA" });
    expect(await compra(e, { moneda: null })).toEqual({ estado: "rechazada", motivo: "MONEDA" });
    // Moneda e importe mal a la vez: dice MONEDA (va primero; el número no significa nada sin ella).
    expect(await compra(e, { moneda: "eur", pagadoCents: 1 })).toEqual({
      estado: "rechazada",
      motivo: "MONEDA",
    });
    expect(await saldo(e)).toBe(0);
  });

  it("el importe, contra la constante del paquete; un paquete inventado; una empresa que no existe", async () => {
    const e = await unaEmpresa();
    expect(await compra(e, { pagadoCents: 100 })).toEqual({
      estado: "rechazada",
      motivo: "IMPORTE",
    });
    expect(await compra(e, { packageId: "creditos_999" })).toEqual({
      estado: "rechazada",
      motivo: "PAQUETE",
    });
    expect(await compra("noexiste1234567", {})).toEqual({
      estado: "rechazada",
      motivo: "EMPRESA",
    });
    expect(await saldo(e)).toBe(0);
  });
});

describe("el recibo", () => {
  const stripeFalso = () => {
    const retrieve = vi.fn().mockResolvedValue({
      payment_intent: { latest_charge: { receipt_url: "https://pay.stripe.com/receipts/r_1" } },
    });
    return { stripe: { checkout: { sessions: { retrieve } } } satisfies StripeRecibos, retrieve };
  };

  it("la suya, sí; la de OTRA empresa, null y sin preguntar a Stripe", async () => {
    const a = await unaEmpresa();
    const b = await unaEmpresa();
    await compra(b, { sessionId: "cs_de_b" });
    const movB = await prisma.creditoLedger.findFirstOrThrow({ where: { empresaId: b } });

    const { stripe, retrieve } = stripeFalso();
    expect(await reciboDeMiCompra(prisma, stripe, a, movB.id)).toBeNull();
    expect(retrieve).not.toHaveBeenCalled();
    expect(await reciboDeMiCompra(prisma, stripe, b, movB.id)).toBe(
      "https://pay.stripe.com/receipts/r_1",
    );
    expect(retrieve).toHaveBeenCalledWith("cs_de_b", { expand: ["payment_intent.latest_charge"] });
  });

  it("en el historial, solo una compra lleva su enlace de Recibo", async () => {
    const e = await unaEmpresa();
    await compra(e, {});
    const { movimientos } = await misCreditos(prisma, e);
    expect(movimientos).toHaveLength(1);
    expect(movimientos[0]?.recibo).toBe(`/api/empresa/creditos/${movimientos[0]?.id}/recibo`);
    expect(movimientos[0]?.concepto).toBe("Compra de créditos");
  });
});

describe("el catálogo en venta", () => {
  it("10 = 5 $, 30 = 12 $, 100 = 30 $; el de mejor precio por crédito, uno", () => {
    const p = paquetesCreditosEnVenta();
    expect(p.map((x) => [x.creditos, x.precioCents, x.porCreditoCents])).toEqual([
      [10, 500, 50],
      [30, 1200, 40],
      [100, 3000, 30],
    ]);
    expect(p.filter((x) => x.mejorPrecio).map((x) => x.clave)).toEqual(["creditos_100"]);
  });
});

describe("«Recibo», nunca «Factura»", () => {
  it("ningún texto del portal de la empresa dice factura", () => {
    const raiz = path.resolve(__dirname, "..", "src", "app", "(app)", "(shell)", "empresa");
    const fuentes = (dir: string): string[] =>
      readdirSync(dir).flatMap((x) => {
        const p = path.join(dir, x);
        return statSync(p).isDirectory() ? fuentes(p) : /\.(ts|tsx)$/.test(x) ? [p] : [];
      });
    const sinComentarios = (s: string) =>
      s.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "").replace(/^\s*\/\/.*$/gm, "");
    const culpables = fuentes(raiz).filter((f) =>
      /factura/i.test(sinComentarios(readFileSync(f, "utf8"))),
    );
    expect(culpables).toEqual([]);
  });
});
