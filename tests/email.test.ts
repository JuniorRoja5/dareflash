import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";
import type { EmailMessage } from "../src/server/email/adapter";
import { enqueueEmail } from "../src/server/email/send";

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

const msg = (to: string): EmailMessage => ({
  to,
  subject: "Hola",
  text: "cuerpo con enlace/token",
});

describe("encolado de email", () => {
  it("enqueueEmail crea un job SEND_EMAIL PENDING; no envia todavia", async () => {
    await enqueueEmail(prisma, msg("a@test.com"));
    const jobs = await prisma.job.findMany({ where: { type: "SEND_EMAIL" } });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.status).toBe("PENDING");
  });

  it("idempotencyKey repetido NO crea dos jobs (doble encolado = no-op)", async () => {
    await enqueueEmail(prisma, msg("a@test.com"), { idempotencyKey: "k1" });
    await enqueueEmail(prisma, msg("a@test.com"), { idempotencyKey: "k1" });
    expect(await prisma.job.count({ where: { type: "SEND_EMAIL" } })).toBe(1);
  });

  it("sin idempotencyKey, dos encolados crean dos jobs", async () => {
    await enqueueEmail(prisma, msg("a@test.com"));
    await enqueueEmail(prisma, msg("a@test.com"));
    expect(await prisma.job.count({ where: { type: "SEND_EMAIL" } })).toBe(2);
  });
});
