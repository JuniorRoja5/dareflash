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
  const r = await solicitarRetirada(prisma, {
    userId: duenyo,
    importeCents: cents,
    destino: { metodo: "BANK", iban: IBAN_OK, titular: "Marta Ruiz" },
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

    const res = await pedir({ retiradaId: id, hasta: "REJECTED" });

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
    const res = await pedir({ retiradaId: id, hasta: "REJECTED" });

    expect(await res.json()).toEqual({ estado: "REJECTED", devueltoCents: 6000 });
    expect(await saldoDuenyo()).toBe(6000);
  });

  it("y la respuesta NO lleva los datos de pago", async () => {
    const id = await retiradaPendiente();
    const res = await pedir({ retiradaId: id, hasta: "APPROVED" });
    const cuerpo = JSON.stringify(await res.json());
    expect(cuerpo).not.toContain(IBAN_OK);
    expect(cuerpo).not.toMatch(/iban|titular|datosPago/i);
  });
});
