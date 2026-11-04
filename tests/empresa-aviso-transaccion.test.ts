/**
 * EL AVISO VA EN LA MISMA TRANSACCIÓN QUE EL REGISTRO (Fase 9 · P1).
 *
 * Fuera de la transacción hay dos huecos reales: el hecho SIN aviso —una empresa esperando que nadie
 * sabe que existe— y el aviso SIN hecho, si la transacción revierte después. El de `empresa-registro`
 * prueba el primero (si la fila falla, no queda correo). Este prueba la otra mitad, que es la que un
 * test normal NO ve: que el encolado recibe el cliente de la TRANSACCIÓN y no el singleton.
 *
 * ┌─ POR QUÉ ESTE DIENTE Y NO OTRO ────────────────────────────────────────────────────────────────┐
 * │ Cambiar `enqueueEmail(tx, …)` por `enqueueEmail(db, …)` compila, pasa todos los demás tests y  │
 * │ deja el aviso FUERA de la transacción: si la creación revierte después, el correo ya está      │
 * │ encolado y alguien recibirá «hay una empresa esperando» de una empresa que no existe. Es la    │
 * │ misma clase de verde falso que dio cambiar `tx` por `db` en el `FOR UPDATE` del cupo de Boost. │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Para romperlo a propósito: pasar `db` en vez de `tx` en `registrarEmpresa` -> rojo.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";

/** Lo que recibió el encolado, llamada a llamada. */
const llamadas: { cliente: unknown; opciones: unknown }[] = [];

vi.mock("@/server/email/send", () => ({
  enqueueEmail: vi.fn(async (cliente: unknown, _mensaje: unknown, opciones: unknown) => {
    llamadas.push({ cliente, opciones });
  }),
}));

const { registrarEmpresa } = await import("../src/server/services/empresas");
const { crearUsuario, createTestPrisma, resetDb } = await import("./helpers/db");

let prisma: PrismaClient;
let dueno: string;

beforeAll(() => {
  prisma = createTestPrisma();
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
  llamadas.length = 0;
  dueno = await crearUsuario(prisma, { username: "dueno_tx" });
});

describe("el encolado del aviso", () => {
  it("recibe el cliente de la transacción, NO el singleton de Prisma", async () => {
    const r = await registrarEmpresa(
      prisma,
      {
        userId: dueno,
        nombre: "Bar de la Transacción",
        tipoCuenta: "EMPRESA",
        tipoNegocio: "FISICO",
      },
      { adminEmail: "admin@dareflash.com", urlPanel: "https://dareflash.com/panel/empresas" },
    );

    expect(llamadas).toHaveLength(1);
    // LA COMPROBACIÓN QUE IMPORTA: si fuera el singleton, el aviso viviría fuera de la transacción.
    expect(llamadas[0]?.cliente).not.toBe(prisma);
    // Y la clave sale del HECHO, no del momento: un reintento no manda un segundo correo.
    expect(llamadas[0]?.opciones).toMatchObject({
      idempotencyKey: `empresa-pendiente:${r.id}`,
    });
  });

  it("y no se llama cuando no hay destinatario", async () => {
    await registrarEmpresa(
      prisma,
      { userId: dueno, nombre: "Sin Avisos", tipoCuenta: "EMPRESA", tipoNegocio: "ONLINE" },
      { adminEmail: null, urlPanel: "https://dareflash.com/panel/empresas" },
    );
    expect(llamadas).toHaveLength(0);
  });
});
