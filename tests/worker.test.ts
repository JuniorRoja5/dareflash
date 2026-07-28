import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";
import type { EmailAdapter, EmailMessage } from "../src/server/email/adapter";
import { construirRegistro, type Registro } from "../src/server/jobs/registry";
import {
  backoffMs,
  bucleWorker,
  JOB_TIMEOUT_MS,
  procesarLote,
  REAPER_UMBRAL_MS,
  repasarColgados,
  validarInvarianteReaper,
} from "../src/server/jobs/worker";

import { createTestPrisma, resetDb } from "./helpers/db";

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

function fakeAdapter(opts: { fail?: boolean } = {}): EmailAdapter & { sent: EmailMessage[] } {
  const sent: EmailMessage[] = [];
  return {
    name: "fake",
    sent,
    async send(m) {
      if (opts.fail) throw new Error("boom");
      sent.push(m);
    },
  };
}

/** Registro con SEND_EMAIL (FAIL) + un tipo sintetico idempotente (REQUEUE) para el reaper. */
function registroFake(adapter: EmailAdapter): Registro {
  return {
    ...construirRegistro({ emailAdapter: adapter }),
    LEDGER_TEST: { reaper: "REQUEUE", async handler() {} },
  };
}

async function encolarEmail(to: string): Promise<void> {
  await prisma.job.create({
    data: {
      type: "SEND_EMAIL",
      payload: { to, subject: "s", text: "cuerpo/token" },
      runAt: new Date(),
    },
  });
}

describe("worker: dispatch y reintentos", () => {
  it("procesa SEND_EMAIL, marca DONE y BORRA el payload (no retiene el token)", async () => {
    await encolarEmail("a@test.com");
    const adapter = fakeAdapter();
    const r = await procesarLote(prisma, registroFake(adapter), { workerToken: "w1", limit: 10 });

    expect(r).toEqual({ hechos: 1, fallidos: 0 });
    expect(adapter.sent.map((m) => m.to)).toEqual(["a@test.com"]);
    const job = await prisma.job.findFirstOrThrow({ where: { type: "SEND_EMAIL" } });
    expect(job.status).toBe("DONE");
    expect(job.payload).toBeNull();
  });

  it("respeta el lote (limit)", async () => {
    for (let i = 0; i < 5; i++) await encolarEmail(`u${i}@test.com`);
    const r = await procesarLote(prisma, registroFake(fakeAdapter()), {
      workerToken: "w1",
      limit: 2,
    });
    expect(r.hechos).toBe(2);
    expect(await prisma.job.count({ where: { status: "PENDING" } })).toBe(3);
  });

  it("si el envio falla, reintenta con backoff y agota a FAILED conservando SOLO el destinatario", async () => {
    await encolarEmail("a@test.com");
    const adapter = fakeAdapter({ fail: true });
    let now = new Date();
    for (let i = 0; i < 8; i++) {
      const pend = await prisma.job.findFirst({ where: { status: "PENDING" } });
      if (!pend) break;
      now = new Date(now.getTime() + 7 * 60 * 60 * 1000); // saltar el backoff (>6h)
      await procesarLote(prisma, registroFake(adapter), { workerToken: `w${i}`, limit: 10, now });
    }
    const job = await prisma.job.findFirstOrThrow({ where: { type: "SEND_EMAIL" } });
    expect(job.status).toBe("FAILED");
    expect(job.attempts).toBe(job.maxAttempts);
    // resumenFallo: se sabe a QUIEN afecto (reenvio manual), sin el cuerpo/token.
    expect(job.payload).toEqual({ to: "a@test.com" });
  });

  it("un tipo desconocido va a FAILED (no se queda colgado)", async () => {
    await prisma.job.create({ data: { type: "NO_EXISTE", runAt: new Date() } });
    const r = await procesarLote(prisma, registroFake(fakeAdapter()), {
      workerToken: "w1",
      limit: 10,
    });
    expect(r.fallidos).toBe(1);
    const job = await prisma.job.findFirstOrThrow({ where: { type: "NO_EXISTE" } });
    expect(job.status).toBe("FAILED");
  });
});

describe("worker: reaper con politica POR TIPO", () => {
  it("SEND_EMAIL colgado -> FAILED (no reenviar); tipo REQUEUE -> PENDING (idempotente)", async () => {
    const viejo = new Date(Date.now() - 20 * 60 * 1000); // 20 min: mas que el umbral
    await prisma.job.create({
      data: {
        type: "SEND_EMAIL",
        status: "RUNNING",
        lockedAt: viejo,
        lockedBy: "muerto",
        runAt: viejo,
        payload: { to: "x@test.com", subject: "s", text: "cuerpo/token" },
      },
    });
    await prisma.job.create({
      data: {
        type: "LEDGER_TEST",
        status: "RUNNING",
        lockedAt: viejo,
        lockedBy: "muerto",
        runAt: viejo,
      },
    });
    // Uno RECIENTE no debe tocarse.
    await prisma.job.create({
      data: {
        type: "SEND_EMAIL",
        status: "RUNNING",
        lockedAt: new Date(),
        lockedBy: "vivo",
        runAt: new Date(),
      },
    });

    const r = await repasarColgados(prisma, registroFake(fakeAdapter()), { now: new Date() });
    expect(r).toEqual({ reencolados: 1, fallados: 1 });

    const email = await prisma.job.findFirstOrThrow({
      where: { type: "SEND_EMAIL", status: "FAILED" },
    });
    expect(email.payload).toEqual({ to: "x@test.com" }); // se sabe a quien afecto

    const ledger = await prisma.job.findFirstOrThrow({ where: { type: "LEDGER_TEST" } });
    expect(ledger.status).toBe("PENDING"); // idempotente -> reencola siempre

    // El SEND_EMAIL RECIENTE (no vencido) sigue intacto.
    const reciente = await prisma.job.findFirstOrThrow({ where: { lockedBy: "vivo" } });
    expect(reciente.status).toBe("RUNNING");
  });
});

describe("worker: backoff, jitter e invariante del reaper", () => {
  it("backoff 1m->5m->25m con tope 6h y jitter +-20%", () => {
    expect(backoffMs(1, () => 0.5)).toBe(60_000); // 1m
    expect(backoffMs(2, () => 0.5)).toBe(300_000); // 5m
    expect(backoffMs(3, () => 0.5)).toBe(1_500_000); // 25m
    expect(backoffMs(10, () => 0.5)).toBe(6 * 60 * 60_000); // tope 6h
    // jitter: +-20% del base
    expect(backoffMs(1, () => 0)).toBe(48_000);
    expect(backoffMs(1, () => 1)).toBe(72_000);
  });

  it("INVARIANTE: el timeout de un job debe ser < umbral del reaper (o hay doble ejecucion)", () => {
    expect(() => validarInvarianteReaper(60_000, 600_000)).not.toThrow();
    expect(() => validarInvarianteReaper(600_000, 600_000)).toThrow(/Invariante/);
    expect(() => validarInvarianteReaper(900_000, 600_000)).toThrow(/Invariante/);
    // Los valores que se despliegan cumplen el invariante.
    expect(JOB_TIMEOUT_MS).toBeLessThan(REAPER_UMBRAL_MS);
  });
});

describe("worker: exclusividad de reclamo", () => {
  it("dos workers a la vez NO procesan el mismo job (cada correo sale una sola vez)", async () => {
    const N = 8;
    for (let i = 0; i < N; i++) await encolarEmail(`u${i}@test.com`);
    const a1 = fakeAdapter();
    const a2 = fakeAdapter();

    const [r1, r2] = await Promise.all([
      procesarLote(prisma, registroFake(a1), { workerToken: "wA", limit: N }),
      procesarLote(prisma, registroFake(a2), { workerToken: "wB", limit: N }),
    ]);

    expect(r1.hechos + r2.hechos).toBe(N);
    const todos = [...a1.sent, ...a2.sent].map((m) => m.to);
    expect(todos).toHaveLength(N);
    expect(new Set(todos).size).toBe(N); // sin duplicados
    expect(await prisma.job.count({ where: { type: "SEND_EMAIL", status: "DONE" } })).toBe(N);
  });
});

describe("worker: apagado limpio con SIGTERM", () => {
  it("termina el lote en curso y luego sale (no reclama uno nuevo)", async () => {
    for (let i = 0; i < 3; i++) await encolarEmail(`u${i}@test.com`);
    const adapter = fakeAdapter();
    // parar(): false la 1a vez (deja entrar y procesar el lote), true despues (no reclama otro).
    let llamadas = 0;
    const parar = (): boolean => {
      llamadas += 1;
      return llamadas > 1;
    };
    await bucleWorker(prisma, registroFake(adapter), {
      workerToken: "w1",
      limit: 10,
      intervaloMs: 1,
      parar,
      dormir: async () => {},
    });
    expect(adapter.sent).toHaveLength(3); // termino lo que tenia
    expect(await prisma.job.count({ where: { status: "DONE" } })).toBe(3);
  });

  it("si ya esta parando al arrancar, NO reclama nada", async () => {
    for (let i = 0; i < 2; i++) await encolarEmail(`u${i}@test.com`);
    const adapter = fakeAdapter();
    await bucleWorker(prisma, registroFake(adapter), {
      workerToken: "w1",
      limit: 10,
      intervaloMs: 1,
      parar: () => true, // ya parando
      dormir: async () => {},
    });
    expect(adapter.sent).toHaveLength(0);
    expect(await prisma.job.count({ where: { status: "PENDING" } })).toBe(2);
  });
});
