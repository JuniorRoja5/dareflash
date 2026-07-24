import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";
import { applyPoints, LedgerError } from "../src/server/services/ledger";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

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

describe("ledger de puntos", () => {
  it("N operaciones concurrentes sobre el mismo usuario: el saldo final = suma de deltas (sin perdidas)", async () => {
    const userId = await crearUsuario(prisma, { pointsBalance: 0 });
    const N = 20;

    // Concurrencia REAL: 20 operaciones en paralelo. `holdMs` ensancha la ventana
    // lectura->escritura; con FOR UPDATE se serializan y el resultado es exacto.
    const resultados = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        applyPoints(
          prisma,
          { userId, delta: 1, reason: "TEST", idempotencyKey: `k-${i}` },
          { holdMs: 25 },
        ),
      ),
    );

    expect(resultados.every((r) => r.applied)).toBe(true);

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { pointsBalance: true },
    });
    const movimientos = await prisma.pointsLedger.aggregate({
      where: { userId },
      _sum: { delta: true },
      _count: true,
    });

    expect(user.pointsBalance).toBe(N); // <-- FALLA si se quita el FOR UPDATE (lost updates)
    expect(movimientos._count).toBe(N);
    expect(movimientos._sum.delta).toBe(N);
  });

  it("misma idempotencyKey dos veces: una sola fila y el saldo cambia una sola vez", async () => {
    const userId = await crearUsuario(prisma, { pointsBalance: 0 });

    const r1 = await applyPoints(prisma, {
      userId,
      delta: 5,
      reason: "TEST",
      idempotencyKey: "dup",
    });
    const r2 = await applyPoints(prisma, {
      userId,
      delta: 5,
      reason: "TEST",
      idempotencyKey: "dup",
    });

    expect(r1.applied).toBe(true);
    expect(r2.applied).toBe(false); // no-op
    expect(r2.balance).toBe(5);

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { pointsBalance: true },
    });
    const count = await prisma.pointsLedger.count({ where: { userId } });
    expect(user.pointsBalance).toBe(5);
    expect(count).toBe(1);
  });

  it("misma idempotencyKey en paralelo: sigue habiendo una sola fila", async () => {
    const userId = await crearUsuario(prisma, { pointsBalance: 0 });

    const [a, b] = await Promise.all([
      applyPoints(
        prisma,
        { userId, delta: 5, reason: "TEST", idempotencyKey: "dup" },
        { holdMs: 20 },
      ),
      applyPoints(
        prisma,
        { userId, delta: 5, reason: "TEST", idempotencyKey: "dup" },
        { holdMs: 20 },
      ),
    ]);

    // Exactamente uno aplica; el otro es no-op.
    expect([a.applied, b.applied].filter(Boolean)).toHaveLength(1);

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { pointsBalance: true },
    });
    const count = await prisma.pointsLedger.count({ where: { userId } });
    expect(user.pointsBalance).toBe(5);
    expect(count).toBe(1);
  });

  it("si el INSERT del movimiento falla, el saldo NO se modifica (revierte toda la transaccion)", async () => {
    const userId = await crearUsuario(prisma, { pointsBalance: 0 });

    // Primer movimiento con id explicito M1 -> saldo 10.
    await applyPoints(prisma, {
      userId,
      delta: 10,
      reason: "TEST",
      idempotencyKey: "k1",
      movementId: "M1",
    });

    // Segundo con idempotencyKey NUEVA (pasa la idempotencia) pero id duplicado M1:
    // el INSERT del movimiento reventara por clave primaria duplicada.
    await expect(
      applyPoints(prisma, {
        userId,
        delta: 10,
        reason: "TEST",
        idempotencyKey: "k2",
        movementId: "M1",
      }),
    ).rejects.toThrow();

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { pointsBalance: true },
    });
    const count = await prisma.pointsLedger.count({ where: { userId } });
    expect(user.pointsBalance).toBe(10); // no cambio
    expect(count).toBe(1); // el segundo movimiento no existe
  });

  it("dos debitos concurrentes que juntos sobregirarian: uno pasa, el otro se rechaza", async () => {
    const userId = await crearUsuario(prisma, { pointsBalance: 100 });

    const resultados = await Promise.allSettled([
      applyPoints(
        prisma,
        { userId, delta: -60, reason: "TEST", idempotencyKey: "d1" },
        { holdMs: 25 },
      ),
      applyPoints(
        prisma,
        { userId, delta: -60, reason: "TEST", idempotencyKey: "d2" },
        { holdMs: 25 },
      ),
    ]);

    const ok = resultados.filter((r) => r.status === "fulfilled");
    const ko = resultados.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(ko).toHaveLength(1);
    expect(ko[0]?.reason).toBeInstanceOf(LedgerError);

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { pointsBalance: true },
    });
    expect(user.pointsBalance).toBe(40); // 100 - 60, el segundo rechazado
  });
});
