/**
 * AJUSTE MANUAL DEL SALDO DEL MONEDERO — el admin mueve dinero de verdad.
 *
 * ┌─ LO QUE ESTA PIEZA TIENE QUE IMPEDIR ────────────────────────────────────────────────────────┐
 * │ Que el saldo se mueva sin su fila (un descuadre, y encima sin autor), que un doble clic       │
 * │ acredite dos veces, que alguien quede en números rojos, y que un movimiento de dinero exista  │
 * │ sin que nadie responda por él. Las cuatro se comprueban ejecutando, no leyendo.               │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Y una quinta, que es la que el esquema regala: el MOTIVO y el handle del admin no pueden llegar
 * al dueño de la cuenta. `WalletLedger` no tiene dónde guardarlos, así que viven en el `AuditLog`.
 *
 * Para romperlo a propósito: mover el `auditLog.create` fuera del `trasAplicar` (rojo: el doble
 * envío escribe dos trazas de un ajuste que ocurrió una vez), quitar el `allowNegative: false`
 * implícito (rojo), aceptar nota vacía (rojo), o meter el `refId` en el DTO del usuario (rojo).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  AJUSTE_NOTA_MIN,
  AJUSTE_SALDO_CENTS_MAX,
  CONCEPTO_MOVIMIENTO,
  CONCEPTO_MOVIMIENTO_OTRO,
  REF_WALLET_AJUSTE_ADMIN,
} from "@/config/constants";
import type { PrismaClient } from "../src/generated/prisma/client";
import {
  AjusteSaldoError,
  ajustarSaldoMonedero,
  claveAjusteSaldo,
  fichaMonedero,
} from "../src/server/services/monedero-admin";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

let prisma: PrismaClient;
let userId: string;
let adminId: string;

const NOTA = "Premio del reto de octubre que no entró por el fallo del worker";
const CLAVE = "aaaaaaaa-2222-4333-8444-555555555551";

beforeAll(() => {
  prisma = createTestPrisma();
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
  userId = await crearUsuario(prisma);
  adminId = await crearUsuario(prisma, { username: "la_admin" });
});

const saldo = async (): Promise<number> =>
  (
    await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { walletBalanceCents: true },
    })
  ).walletBalanceCents;

const ajustar = (parcial: Partial<Parameters<typeof ajustarSaldoMonedero>[1]> = {}) =>
  ajustarSaldoMonedero(prisma, {
    adminId,
    userId,
    deltaCents: 5000,
    nota: NOTA,
    clave: CLAVE,
    ...parcial,
  });

/** El motivo del rechazo, o `null` si no lo hubo. Así el caso afirma el motivo, no solo que falló. */
async function rechazo(parcial: Parameters<typeof ajustar>[0]): Promise<string | null> {
  try {
    await ajustar(parcial);
    return null;
  } catch (e) {
    if (e instanceof AjusteSaldoError) return e.code;
    throw e;
  }
}

describe("acreditar y descontar", () => {
  it("acreditar sube el saldo y deja su fila de ledger, con el admin como referencia", async () => {
    const r = await ajustar({ deltaCents: 5000 });

    expect(r.aplicado).toBe(true);
    expect(r.saldoCents).toBe(5000);
    expect(await saldo()).toBe(5000);

    const filas = await prisma.walletLedger.findMany({ where: { userId } });
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({
      amountCents: 5000,
      entryType: "CREDIT",
      refType: "ADMIN",
      // EL QUIÉN, en la fila: un movimiento de dinero sin autor no se puede auditar.
      refId: adminId,
    });
    expect(filas[0]!.idempotencyKey).toBe(claveAjusteSaldo(adminId, CLAVE));
  });

  it("descontar baja el saldo, y la fila va en negativo con `DEBIT`", async () => {
    await ajustar({ deltaCents: 8000 });
    const r = await ajustar({ deltaCents: -3000, clave: "bbbbbbbb-2222-4333-8444-555555555551" });

    expect(r.saldoCents).toBe(5000);
    expect(await saldo()).toBe(5000);
    const debito = await prisma.walletLedger.findFirst({ where: { userId, entryType: "DEBIT" } });
    expect(debito?.amountCents).toBe(-3000);
  });

  it("NUNCA se escribe el saldo a mano: sin fila no hay movimiento", async () => {
    // El invariante del proyecto entero: un saldo sin su fila es un descuadre. Si alguien
    // "arreglara" esto con un `update` de `walletBalanceCents`, la suma del ledger dejaría de
    // cuadrar con el saldo — que es justo lo que este caso mide.
    await ajustar({ deltaCents: 7500 });
    await ajustar({ deltaCents: -2500, clave: "cccccccc-2222-4333-8444-555555555551" });

    const filas = await prisma.walletLedger.findMany({ where: { userId } });
    const suma = filas.reduce((t, f) => t + f.amountCents, 0);
    expect(suma).toBe(await saldo());
  });
});

describe("el monedero no se queda en negativo", () => {
  it("quitar más de lo que hay se rechaza, y no mueve nada", async () => {
    await ajustar({ deltaCents: 3000 });
    const motivo = await rechazo({
      deltaCents: -5000,
      clave: "dddddddd-2222-4333-8444-555555555551",
    });

    expect(motivo).toBe("SALDO_NEGATIVO");
    expect(await saldo()).toBe(3000);
    expect(await prisma.walletLedger.count({ where: { userId } })).toBe(1);
  });

  it("y quitar EXACTAMENTE lo que hay sí pasa: cero no es negativo", async () => {
    await ajustar({ deltaCents: 3000 });
    const r = await ajustar({ deltaCents: -3000, clave: "eeeeeeee-2222-4333-8444-555555555551" });
    expect(r.aplicado).toBe(true);
    expect(await saldo()).toBe(0);
  });
});

describe("la misma intención, una sola vez", () => {
  it("dos envíos con la MISMA clave acreditan una vez", async () => {
    const uno = await ajustar({ deltaCents: 5000 });
    const dos = await ajustar({ deltaCents: 5000 });

    expect(uno.aplicado).toBe(true);
    expect(dos.aplicado, "el reenvío volvió a acreditar").toBe(false);
    expect(await saldo()).toBe(5000);
    expect(await prisma.walletLedger.count({ where: { userId } })).toBe(1);
  });

  it("y TAMPOCO escribe una segunda traza de un ajuste que ocurrió una vez", async () => {
    // La auditoría va DENTRO de `trasAplicar`, que solo corre cuando el movimiento se aplica. Si
    // estuviera después de la llamada, el reenvío dejaría dos entradas de un único ajuste y la
    // auditoría contaría más dinero del que se movió.
    await ajustar();
    await ajustar();
    expect(await prisma.auditLog.count({ where: { action: "WALLET_ADJUST" } })).toBe(1);
  });

  it("la clave va por ADMIN: dos admins con la misma clave de formulario no se pisan", async () => {
    const otroAdmin = await crearUsuario(prisma, { username: "el_otro_admin" });
    await ajustar({ deltaCents: 5000 });
    const b = await ajustar({ adminId: otroAdmin, deltaCents: 5000 });

    expect(b.aplicado, "la clave de un admin bloqueó la de otro").toBe(true);
    expect(await saldo()).toBe(10_000);
    expect(claveAjusteSaldo(adminId, CLAVE)).not.toBe(claveAjusteSaldo(otroAdmin, CLAVE));
  });

  it("y no choca con las claves de otros flujos del monedero", async () => {
    // El espacio de nombres (`monedero:ajuste:<admin>:…`) es lo que impide que una clave del panel
    // colisione con la de una retirada o un premio y convierta un movimiento en un no-op.
    expect(claveAjusteSaldo(adminId, CLAVE)).toMatch(/^monedero:ajuste:/);
  });
});

describe("sin motivo no se mueve dinero", () => {
  it("vacío, en blanco o demasiado corto: rechazado", async () => {
    for (const nota of ["", "   ", "a".repeat(AJUSTE_NOTA_MIN - 1)]) {
      expect(await rechazo({ nota }), `nota «${nota}»`).toBe("NOTA_OBLIGATORIA");
    }
    expect(await saldo()).toBe(0);
    expect(await prisma.walletLedger.count()).toBe(0);
  });

  it("un importe que no es un entero de céntimos, o es cero, o se pasa del tope: rechazado", async () => {
    for (const deltaCents of [
      0,
      10.5,
      NaN,
      AJUSTE_SALDO_CENTS_MAX + 1,
      -AJUSTE_SALDO_CENTS_MAX - 1,
    ]) {
      expect(await rechazo({ deltaCents }), `importe ${deltaCents}`).toBe("IMPORTE_INVALIDO");
    }
    expect(await prisma.walletLedger.count()).toBe(0);
  });

  it("y el tope EXACTO sí pasa: es un techo, no un corte antes de tiempo", async () => {
    const r = await ajustar({ deltaCents: AJUSTE_SALDO_CENTS_MAX });
    expect(r.aplicado).toBe(true);
  });

  it("un usuario que no existe se rechaza sin escribir nada", async () => {
    expect(await rechazo({ userId: "no-existe" })).toBe("USUARIO_NO_EXISTE");
    expect(await prisma.walletLedger.count()).toBe(0);
    expect(await prisma.auditLog.count()).toBe(0);
  });
});

describe("la traza: es dinero", () => {
  it("queda en el AuditLog con quién, a quién, cuánto, el motivo y los saldos", async () => {
    await ajustar({ deltaCents: 4200 });

    const traza = await prisma.auditLog.findFirstOrThrow({ where: { action: "WALLET_ADJUST" } });
    expect(traza.actorId).toBe(adminId);
    expect(traza.targetType).toBe("USER");
    expect(traza.targetId).toBe(userId);
    expect(traza.metadata).toMatchObject({ deltaCents: 4200, antes: 0, despues: 4200, nota: NOTA });
  });

  it("y la traza NO existe si el dinero no se movió", async () => {
    // Un rechazo que dejara su entrada de auditoría contaría un ajuste que no ocurrió; y uno que se
    // aplica sin traza es dinero movido sin autor. Las dos mitades, aquí.
    await rechazo({ deltaCents: -1 });
    expect(await prisma.auditLog.count({ where: { action: "WALLET_ADJUST" } })).toBe(0);
  });
});

describe("el motivo y el admin NO llegan al dueño de la cuenta", () => {
  it("el historial de movimientos del usuario no lleva el refId (que es el admin)", async () => {
    const { misMovimientosMonedero } = await import("../src/server/services/retirada");
    await ajustar({ deltaCents: 5000 });

    const movimientos = await misMovimientosMonedero(prisma, userId);
    expect(movimientos).toHaveLength(1);
    expect(movimientos[0]!.concepto, "el movimiento no dice que es un ajuste").toBe("ADMIN");
    expect(movimientos[0]!.amountCents).toBe(5000);

    const crudo = JSON.stringify(movimientos);
    expect(crudo, "el id del admin viaja en el historial del usuario").not.toContain(adminId);
    expect(crudo, "el motivo viaja en el historial del usuario").not.toContain("worker");
    expect(crudo).not.toMatch(/refId|nota/i);
  });

  it("y el movimiento se ve: un ajuste no puede ser invisible para quien lo recibe", async () => {
    // La otra mitad de la misma regla. Esconder el motivo es correcto; esconder el MOVIMIENTO deja
    // un saldo que cambia solo, que es indistinguible de un error.
    const { misMovimientosMonedero } = await import("../src/server/services/retirada");
    expect(await misMovimientosMonedero(prisma, userId)).toHaveLength(0);
    await ajustar({ deltaCents: 5000 });
    expect(await misMovimientosMonedero(prisma, userId)).toHaveLength(1);
  });
});

describe("el ajuste se llama por su nombre", () => {
  it("no se disfraza de premio, ni comparte frase con ningún otro concepto", () => {
    // Un ajuste pintado como "premio" sería mentir en el historial de dinero de una persona: le
    // diría que ganó algo que no ganó. Y dos conceptos con la misma frase hacen indistinguible un
    // movimiento del equipo de uno del sistema, que es la misma mentira por omisión.
    const ajuste = CONCEPTO_MOVIMIENTO[REF_WALLET_AJUSTE_ADMIN];
    expect(ajuste, "el ajuste del admin no tiene frase").toBeTruthy();
    expect(ajuste!.toLowerCase()).not.toMatch(/premio|bonus|regalo/);

    const frases = Object.values(CONCEPTO_MOVIMIENTO);
    expect(new Set(frases).size, "dos conceptos dicen lo mismo").toBe(frases.length);
  });

  it("y cada concepto que el sistema escribe de verdad tiene su frase", () => {
    // Los `refType` que el código llega a escribir en `WalletLedger`. Si alguien añade un flujo
    // nuevo y no su frase, el movimiento cae en el genérico y la persona no sabe qué fue.
    for (const ref of ["PRIZE", "WITHDRAWAL", "WITHDRAWAL_REFUND", REF_WALLET_AJUSTE_ADMIN]) {
      expect(CONCEPTO_MOVIMIENTO[ref], `falta la frase de ${ref}`).toBeTruthy();
    }
    // Y el genérico existe: un `refType` desconocido no puede dejar un hueco en la lista.
    expect(CONCEPTO_MOVIMIENTO_OTRO).toBeTruthy();
  });
});

describe("la ficha del formulario", () => {
  it("trae el saldo de cualquiera, haya pedido un cobro o no", async () => {
    await ajustar({ deltaCents: 6500 });
    const f = await fichaMonedero(prisma, userId);
    expect(f?.saldoCents).toBe(6500);
    expect(f?.username).toBeTruthy();
  });

  it("y de quien no existe, nada", async () => {
    expect(await fichaMonedero(prisma, "no-existe")).toBeNull();
  });
});
