import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";
import type { EmailAdapter, EmailMessage } from "../src/server/email/adapter";
import { enqueueEmail, processEmailBatch } from "../src/server/email/send";

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

/** Adaptador de test que registra lo enviado; opcionalmente falla. */
function fakeAdapter(opts: { fail?: boolean } = {}): EmailAdapter & { sent: EmailMessage[] } {
  const sent: EmailMessage[] = [];
  return {
    name: "fake",
    sent,
    async send(message) {
      if (opts.fail) throw new Error("boom");
      sent.push(message);
    },
  };
}

const msg = (to: string): EmailMessage => ({
  to,
  subject: "Hola",
  text: "cuerpo con enlace/token",
});

describe("email via cola", () => {
  it("enqueueEmail encola un job SEND_EMAIL; no envia todavia", async () => {
    await enqueueEmail(prisma, msg("a@test.com"));
    const jobs = await prisma.job.findMany({ where: { type: "SEND_EMAIL" } });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.status).toBe("PENDING");
  });

  it("processEmailBatch envia los pendientes, marca DONE y BORRA el payload (no retiene el token)", async () => {
    await enqueueEmail(prisma, msg("a@test.com"));
    await enqueueEmail(prisma, msg("b@test.com"));
    const adapter = fakeAdapter();

    const res = await processEmailBatch(prisma, adapter, { workerToken: "w1" });

    expect(res).toEqual({ sent: 2, failed: 0 });
    expect(adapter.sent.map((m) => m.to).sort()).toEqual(["a@test.com", "b@test.com"]);

    const jobs = await prisma.job.findMany({ where: { type: "SEND_EMAIL" } });
    expect(jobs.every((j) => j.status === "DONE")).toBe(true);
    expect(jobs.every((j) => j.payload === null)).toBe(true); // payload borrado
  });

  it("respeta el ritmo maximo (limit) por ejecucion", async () => {
    for (let i = 0; i < 5; i++) await enqueueEmail(prisma, msg(`u${i}@test.com`));
    const adapter = fakeAdapter();

    const res = await processEmailBatch(prisma, adapter, { workerToken: "w1", limit: 2 });

    expect(res.sent).toBe(2); // solo 2 en esta pasada
    const pendientes = await prisma.job.count({ where: { type: "SEND_EMAIL", status: "PENDING" } });
    expect(pendientes).toBe(3);
  });

  it("si el envio falla, reintenta con backoff y agota a FAILED", async () => {
    await enqueueEmail(prisma, msg("a@test.com"));
    const adapter = fakeAdapter({ fail: true });

    // maxAttempts por defecto = 5: procesamos hasta agotar.
    let guard = 0;
    for (;;) {
      const pend = await prisma.job.findFirst({
        where: { type: "SEND_EMAIL", status: "PENDING" },
      });
      if (!pend || guard++ > 10) break;
      // avanzar el reloj para saltar el backoff
      await processEmailBatch(prisma, adapter, {
        workerToken: `w${guard}`,
        now: new Date(Date.now() + guard * 60 * 60 * 1000),
      });
    }

    const job = await prisma.job.findFirstOrThrow({ where: { type: "SEND_EMAIL" } });
    expect(job.status).toBe("FAILED");
    expect(job.attempts).toBe(job.maxAttempts);
    // El error registrado es generico, sin token ni cuerpo.
    expect(job.lastError).toBe("email send failed");
  });
});
