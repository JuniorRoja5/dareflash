import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";
import type { EmailAdapter, EmailMessage } from "../src/server/email/adapter";
import { construirRegistro, type Registro } from "../src/server/jobs/registry";
import {
  backoffMs,
  bucleWorker,
  esAmbiguo,
  JOB_TIMEOUT_MS,
  podarDone,
  procesarLote,
  REAPER_UMBRAL_MS,
  repasarColgados,
  sanearError,
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

    expect(r).toEqual({ hechos: 1, fallidos: 0, liberados: 0 });
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

  it("fallo LIMPIO: reintenta con backoff y agota a FAILED conservando SOLO el destinatario", async () => {
    await encolarEmail("a@test.com");
    const adapter = fakeAdapter({ fail: true });
    let now = new Date();
    for (let i = 0; i < 8; i++) {
      const pend = await prisma.job.findFirst({ where: { status: "PENDING" } });
      if (!pend) break;
      now = new Date(now.getTime() + 7 * 60 * 60 * 1000); // saltar el backoff
      await procesarLote(prisma, registroFake(adapter), { workerToken: `w${i}`, limit: 10, now });
    }
    const job = await prisma.job.findFirstOrThrow({ where: { type: "SEND_EMAIL" } });
    expect(job.status).toBe("FAILED");
    expect(job.attempts).toBe(job.maxAttempts);
    expect(job.payload).toEqual({ to: "a@test.com" });
  });

  it("fallo AMBIGUO (JOB_TIMEOUT) sobre SEND_EMAIL -> FAILED directo, NO reencola (evita duplicado)", async () => {
    await encolarEmail("a@test.com");
    const colgado: EmailAdapter = {
      name: "colgado",
      async send() {
        await new Promise(() => {});
      },
    };
    // jobTimeoutMs pequeño: el handler cuelga -> conTimeout lanza JOB_TIMEOUT (ambiguo).
    const r = await procesarLote(prisma, registroFake(colgado), {
      workerToken: "w1",
      limit: 10,
      jobTimeoutMs: 50,
    });
    expect(r.fallidos).toBe(1);
    const job = await prisma.job.findFirstOrThrow({ where: { type: "SEND_EMAIL" } });
    expect(job.status).toBe("FAILED"); // NO PENDING: efecto pudo ocurrir, politica FAIL
    expect(job.attempts).toBe(1); // fue directo a FAILED, no agoto reintentos
    expect(job.payload).toEqual({ to: "a@test.com" });
    expect(job.lastError).toMatch(/ambiguo/i);
  });

  it("lastError SANEADO: guarda el code, nunca el mensaje crudo (posibles secretos)", async () => {
    await encolarEmail("a@test.com");
    const authFail: EmailAdapter = {
      name: "authfail",
      async send() {
        throw Object.assign(new Error("clave=SUPERSECRETO en la traza"), {
          code: "EAUTH",
          responseCode: 535,
        });
      },
    };
    await procesarLote(prisma, registroFake(authFail), { workerToken: "w1", limit: 10 });
    const job = await prisma.job.findFirstOrThrow({ where: { type: "SEND_EMAIL" } });
    expect(job.status).toBe("PENDING"); // auth NO es ambiguo (no salio) -> reintenta
    expect(job.lastError).toBe("EAUTH (535)");
    expect(job.lastError ?? "").not.toMatch(/SUPERSECRETO/);
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
    const viejo = new Date(Date.now() - 20 * 60 * 1000);
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
    expect(email.payload).toEqual({ to: "x@test.com" });
    const ledger = await prisma.job.findFirstOrThrow({ where: { type: "LEDGER_TEST" } });
    expect(ledger.status).toBe("PENDING");
    const reciente = await prisma.job.findFirstOrThrow({ where: { lockedBy: "vivo" } });
    expect(reciente.status).toBe("RUNNING"); // no vencido: intacto
  });
});

describe("worker: backoff, jitter, invariante y clasificacion", () => {
  it("backoff 1m->5m->25m con jitter +-20% y TOPE por tipo", () => {
    const seisH = 6 * 60 * 60_000;
    expect(backoffMs(1, seisH, () => 0.5)).toBe(60_000);
    expect(backoffMs(2, seisH, () => 0.5)).toBe(300_000);
    expect(backoffMs(3, seisH, () => 0.5)).toBe(1_500_000);
    expect(backoffMs(10, seisH, () => 0.5)).toBe(seisH); // tope global
    // Tope de SEND_EMAIL (20 min): el 3er intento (25m base) se corta a 20m.
    expect(backoffMs(3, 20 * 60_000, () => 0.5)).toBe(20 * 60_000);
    expect(backoffMs(1, seisH, () => 0)).toBe(48_000); // -20%
    expect(backoffMs(1, seisH, () => 1)).toBe(72_000); // +20%
  });

  it("INVARIANTE: el timeout de un job debe ser < umbral del reaper (o hay doble ejecucion)", () => {
    expect(() => validarInvarianteReaper(60_000, 600_000)).not.toThrow();
    expect(() => validarInvarianteReaper(600_000, 600_000)).toThrow(/Invariante/);
    expect(JOB_TIMEOUT_MS).toBeLessThan(REAPER_UMBRAL_MS);
  });

  it("esAmbiguo: un TIMEOUT si; conexion/auth/DNS no", () => {
    expect(esAmbiguo(Object.assign(new Error(""), { code: "JOB_TIMEOUT" }))).toBe(true);
    expect(esAmbiguo(Object.assign(new Error(""), { code: "ETIMEDOUT" }))).toBe(true);
    expect(esAmbiguo(new Error("read timeout"))).toBe(true);
    expect(esAmbiguo(Object.assign(new Error(""), { code: "ECONNREFUSED" }))).toBe(false);
    expect(esAmbiguo(Object.assign(new Error(""), { code: "EAUTH" }))).toBe(false);
  });

  it("sanearError: code (+responseCode), etiqueta de certificado, nunca el mensaje crudo", () => {
    expect(
      sanearError(Object.assign(new Error("clave=SECRETO"), { code: "EAUTH", responseCode: 535 })),
    ).toBe("EAUTH (535)");
    expect(sanearError(Object.assign(new Error("x"), { code: "EDNS" }))).toBe("EDNS");
    expect(sanearError(new Error("certificate has expired"))).toBe("error de certificado TLS");
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
  it("a mitad de un lote: los NO procesados quedan en PENDING (no en RUNNING)", async () => {
    for (let i = 0; i < 5; i++) await encolarEmail(`u${i}@test.com`);
    let procesados = 0;
    const sent: EmailMessage[] = [];
    const adapter: EmailAdapter = {
      name: "cuenta",
      async send(m) {
        procesados += 1;
        sent.push(m);
      },
    };
    const parar = (): boolean => procesados >= 1; // parar tras procesar el primero

    const r = await procesarLote(prisma, registroFake(adapter), {
      workerToken: "w1",
      limit: 5,
      parar,
    });

    expect(r.hechos).toBe(1);
    expect(r.liberados).toBe(4);
    expect(await prisma.job.count({ where: { status: "DONE" } })).toBe(1);
    expect(await prisma.job.count({ where: { status: "PENDING" } })).toBe(4);
    expect(await prisma.job.count({ where: { status: "RUNNING" } })).toBe(0); // ninguno colgado
  });

  it("bucleWorker: termina el lote en curso y sale; y si ya para, no reclama nada", async () => {
    for (let i = 0; i < 3; i++) await encolarEmail(`u${i}@test.com`);
    const adapter = fakeAdapter();
    // parar cuando el lote ya se envio: procesa los 3 y en la siguiente comprobacion sale.
    await bucleWorker(prisma, registroFake(adapter), {
      workerToken: "w1",
      limit: 10,
      intervaloMs: 1,
      parar: () => adapter.sent.length >= 3,
      dormir: async () => {},
    });
    expect(adapter.sent).toHaveLength(3);

    // Ya parando al arrancar: no reclama nada.
    await resetDb(prisma);
    for (let i = 0; i < 2; i++) await encolarEmail(`v${i}@test.com`);
    const a2 = fakeAdapter();
    await bucleWorker(prisma, registroFake(a2), {
      workerToken: "w2",
      limit: 10,
      intervaloMs: 1,
      parar: () => true,
      dormir: async () => {},
    });
    expect(a2.sent).toHaveLength(0);
    expect(await prisma.job.count({ where: { status: "PENDING" } })).toBe(2);
  });
});

describe("worker: poda de DONE", () => {
  it("borra los DONE con mas de N dias y conserva los recientes", async () => {
    const viejo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    await prisma.job.create({
      data: { type: "SEND_EMAIL", status: "DONE", runAt: viejo, createdAt: viejo },
    });
    await prisma.job.create({
      data: { type: "SEND_EMAIL", status: "DONE", runAt: new Date(), createdAt: new Date() },
    });
    const borrados = await podarDone(prisma, { dias: 7 });
    expect(borrados).toBe(1);
    expect(await prisma.job.count({ where: { status: "DONE" } })).toBe(1);
  });
});
