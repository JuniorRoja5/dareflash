/**
 * LA RUTA QUE MUEVE RETIRADAS — quién entra y qué contesta.
 *
 *  - EL ROL SE DERIVA de `secciones.ts`: un MODERATOR no pasa, aunque el panel le deje entrar al
 *    edificio. Y no hay un literal "ADMIN" escrito en la ruta que pueda discrepar de la nav. Es
 *    dinero: de las dos cosas que el moderador no toca, esta es la que devuelve saldo.
 *  - QUIÉN MUEVE SALE DE LA SESIÓN: un `adminId` en el cuerpo se ignora, así que nadie firma una
 *    transición a nombre de otro.
 *  - UN ESTADO DESTINO QUE NO EXISTE no llega al servicio: la unión es cerrada en el esquema.
 *  - LOS DATOS DE PAGO NO VUELVEN en la respuesta.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_CURRENCY } from "@/config/constants";
import type { PrismaClient } from "../src/generated/prisma/client";

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
  env: { PAGOS_SECRET: "r".repeat(40), AUTH_SECRET: "TEST-FIXTURE-auth-secret-ruta-retiradas" },
}));
vi.mock("@/server/auth/mutating-route", () => ({
  mutatingRoute:
    (handler: (req: Request, ctx: unknown, rc: unknown) => Promise<Response>) =>
    (req: Request, rc: unknown) =>
      handler(req, { user: H.user, env: {}, prisma: H.prisma }, rc),
}));
// La sesión que leen `requireRole`/`getCurrentUser` sale de este doble: así el guard REAL decide.
vi.mock("@/server/auth/current-user", () => ({
  getCurrentUser: async () => (H.user.userId ? H.user : null),
}));

import { POST as ajuste } from "../src/app/api/panel/monedero/ajustar/route";
import { POST as transicion } from "../src/app/api/panel/monedero/transicion/route";
import { solicitarRetirada } from "../src/server/services/retirada";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

let prisma: PrismaClient;
let duenyo: string;

const IBAN_OK = "ES9121000418450200051332";

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
  duenyo = await crearUsuario(prisma, { username: "la_cobradora" });
});

const pedir = (cuerpo: unknown): Promise<Response> =>
  transicion(
    new Request("http://test/api/panel/monedero/transicion", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://test" },
      body: JSON.stringify(cuerpo),
    }),
    undefined,
  );

async function retiradaPendiente(cents = 7500): Promise<string> {
  const { applyWallet } = await import("../src/server/services/ledger");
  await applyWallet(prisma, {
    userId: duenyo,
    amountCents: cents,
    currency: DEFAULT_CURRENCY,
    entryType: "CREDIT",
    idempotencyKey: `semilla:${duenyo}`,
  });
  const { guardarMetodoPago } = await import("../src/server/services/metodos-pago");
  const m = await guardarMetodoPago(prisma, {
    userId: duenyo,
    destino: { metodo: "BANK", iban: IBAN_OK, titular: "Marta Ruiz" },
  });
  const r = await solicitarRetirada(prisma, {
    userId: duenyo,
    importeCents: cents,
    metodoPagoId: m.ok ? m.id : "",
    clave: "99999999-2222-4333-8444-555555555551",
  });
  return r.retiradaId!;
}

const saldoDuenyo = async (): Promise<number> =>
  (
    await prisma.user.findUniqueOrThrow({
      where: { id: duenyo },
      select: { walletBalanceCents: true },
    })
  ).walletBalanceCents;

describe("quién puede mover una retirada", () => {
  it("el administrador, sí", async () => {
    const id = await retiradaPendiente();
    const res = await pedir({ retiradaId: id, hasta: "APPROVED" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ estado: "APPROVED", devueltoCents: 0 });
  });

  it("un MODERADOR no: es dinero", async () => {
    const id = await retiradaPendiente();
    H.user.role = "MODERATOR";

    const res = await pedir({ retiradaId: id, hasta: "REJECTED", motivo: "DATOS_BANCARIOS" });

    expect(res.status).toBe(403);
    expect(
      (await prisma.withdrawal.findUniqueOrThrow({ where: { id } })).status,
      "el moderador movió la retirada",
    ).toBe("PENDING");
    expect(await saldoDuenyo(), "el moderador devolvió dinero").toBe(0);
  });
});

describe("el cuerpo", () => {
  it("un estado destino que no existe se rechaza con 400", async () => {
    const id = await retiradaPendiente();
    for (const hasta of ["CUALQUIERA", "PENDING", "", null]) {
      const res = await pedir({ retiradaId: id, hasta });
      expect(res.status, JSON.stringify(hasta)).toBe(400);
    }
    expect((await prisma.withdrawal.findUniqueOrThrow({ where: { id } })).status).toBe("PENDING");
  });

  it("QUIÉN mueve sale de la sesión: un `adminId` del cuerpo se ignora", async () => {
    const otro = await crearUsuario(prisma, { username: "el_otro_admin" });
    const id = await retiradaPendiente();

    await pedir({ retiradaId: id, hasta: "APPROVED", adminId: otro });

    const linea = await prisma.auditLog.findFirstOrThrow({
      where: { action: "WITHDRAWAL_TRANSITION", targetId: id },
    });
    expect(linea.actorId, "la transición se firmó a nombre de otro").toBe(H.user.userId);
  });

  it("una transición inválida da 409, no 400: el cuerpo estaba bien", async () => {
    const id = await retiradaPendiente();
    const res = await pedir({ retiradaId: id, hasta: "PAID" });
    expect(res.status).toBe(409);
  });
});

describe("rechazar desde la ruta devuelve el dinero y lo dice", () => {
  it("responde cuánto volvió al monedero", async () => {
    const id = await retiradaPendiente(6000);
    const res = await pedir({ retiradaId: id, hasta: "REJECTED", motivo: "DATOS_BANCARIOS" });

    expect(await res.json()).toEqual({ estado: "REJECTED", devueltoCents: 6000 });
    expect(await saldoDuenyo()).toBe(6000);
  });

  it("y SIN motivo la ruta no deja: 409 y el dinero donde estaba", async () => {
    const id = await retiradaPendiente(6000);
    const res = await pedir({ retiradaId: id, hasta: "REJECTED" });

    // 409 y no 400: el cuerpo era válido —el motivo es opcional en el esquema—; lo que no cuadra
    // es la operación. Quien decide que hace falta es la transición, no el `zod`.
    expect(res.status).toBe(409);
    expect(await saldoDuenyo(), "devolvió el dinero sin razón").toBe(0);
    expect((await prisma.withdrawal.findUniqueOrThrow({ where: { id } })).status).toBe("PENDING");
  });

  it("un motivo que no está en la lista no llega al servicio: 400", async () => {
    const id = await retiradaPendiente(6000);
    const res = await pedir({ retiradaId: id, hasta: "REJECTED", motivo: "PORQUE_SI" });
    expect(res.status).toBe(400);
    expect(await saldoDuenyo()).toBe(0);
  });

  it("y la respuesta NO lleva los datos de pago", async () => {
    const id = await retiradaPendiente();
    const res = await pedir({ retiradaId: id, hasta: "APPROVED" });
    const cuerpo = JSON.stringify(await res.json());
    expect(cuerpo).not.toContain(IBAN_OK);
    expect(cuerpo).not.toMatch(/iban|titular|datosPago/i);
  });
});

/**
 * LA RUTA QUE AJUSTA UN SALDO A MANO. Mismo edificio y mismo criterio: el rol se deriva de
 * `secciones.ts` y quién firma sale de la sesión. Lo que cambia es que esto CREA dinero, así que
 * un moderador que pasara aquí no movería una cola: se acreditaría a sí mismo.
 */
describe("el ajuste manual de saldo", () => {
  const ajustar = (cuerpo: unknown): Promise<Response> =>
    ajuste(
      new Request("http://test/api/panel/monedero/ajustar", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://test" },
        body: JSON.stringify(cuerpo),
      }),
      undefined,
    );

  const CLAVE = "99999999-3333-4333-8444-555555555551";
  const NOTA = "Premio del reto de octubre que no entró";

  it("el administrador acredita, y el saldo sube", async () => {
    const res = await ajustar({ userId: duenyo, deltaCents: 5000, nota: NOTA, clave: CLAVE });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ aplicado: true, saldoCents: 5000 });
    expect(await saldoDuenyo()).toBe(5000);
  });

  it("un MODERADOR no: con esto se regalaría dinero a sí mismo", async () => {
    H.user.role = "MODERATOR";

    const res = await ajustar({ userId: duenyo, deltaCents: 5000, nota: NOTA, clave: CLAVE });

    expect(res.status).toBe(403);
    expect(await saldoDuenyo(), "el moderador movió dinero").toBe(0);
    expect(await prisma.walletLedger.count()).toBe(0);
  });

  it("QUIÉN ajusta sale de la sesión: un `adminId` del cuerpo se ignora", async () => {
    const otro = await crearUsuario(prisma, { username: "el_otro_admin" });

    await ajustar({ userId: duenyo, deltaCents: 5000, nota: NOTA, clave: CLAVE, adminId: otro });

    const linea = await prisma.auditLog.findFirstOrThrow({ where: { action: "WALLET_ADJUST" } });
    expect(linea.actorId, "el ajuste se firmó a nombre de otro").toBe(H.user.userId);
    expect((await prisma.walletLedger.findFirstOrThrow({ where: { userId: duenyo } })).refId).toBe(
      H.user.userId,
    );
  });

  it("sin motivo, con importe 0 o sin clave: 400 y nada escrito", async () => {
    for (const cuerpo of [
      { userId: duenyo, deltaCents: 5000, nota: "", clave: CLAVE },
      { userId: duenyo, deltaCents: 0, nota: NOTA, clave: CLAVE },
      { userId: duenyo, deltaCents: 5000, nota: NOTA },
      { userId: duenyo, deltaCents: 5000, nota: NOTA, clave: "no-es-un-uuid" },
    ]) {
      const res = await ajustar(cuerpo);
      expect(res.status, JSON.stringify(cuerpo)).toBe(400);
    }
    expect(await prisma.walletLedger.count()).toBe(0);
  });

  it("quitar más de lo que hay da 409, no 400: el cuerpo estaba bien", async () => {
    const res = await ajustar({ userId: duenyo, deltaCents: -5000, nota: NOTA, clave: CLAVE });
    expect(res.status).toBe(409);
    expect(await saldoDuenyo()).toBe(0);
  });

  it("y un usuario que no existe, 404", async () => {
    const res = await ajustar({ userId: "no-existe", deltaCents: 5000, nota: NOTA, clave: CLAVE });
    expect(res.status).toBe(404);
  });
});
