/**
 * PURGAS Y AVISO del worker — tests CON DIENTES.
 *
 * Cablean el mantenimiento que antes existia pero no corria: purga de RateLimit (ventanas
 * cerradas), de Session (caducadas) y de Job FAILED (retencion 90 dias), y el aviso al admin
 * por acumulacion de FAILED con histeresis durable.
 *
 * El test que MAS importa: la purga de RateLimit NO debe tocar la ventana EN CURSO. Si la
 * borrara, el contador se resetearia y el rate limit dejaria de proteger. Rompe la purga a
 * proposito (quita el filtro de windowStart o usa `now` en vez de `now - retener`) y este test
 * lo caza.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { JOB_FAILED_RETENTION_DAYS, RATE_LIMIT_PURGE_RETENER_MS } from "../src/config/constants";
import type { PrismaClient } from "../src/generated/prisma/client";
import { purgeExpiredSessions } from "../src/server/auth/session";
import type { EmailAdapter, EmailMessage } from "../src/server/email/adapter";
import { avisarSiFallidos, podarFailed, podarRateLimit } from "../src/server/jobs/worker";

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

function fakeAdapter(): EmailAdapter & { sent: EmailMessage[] } {
  const sent: EmailMessage[] = [];
  return {
    name: "fake",
    sent,
    async send(m) {
      sent.push(m);
    },
  };
}

async function crearFailed(n: number): Promise<void> {
  for (let i = 0; i < n; i += 1) {
    await prisma.job.create({ data: { type: "SEND_EMAIL", status: "FAILED", runAt: new Date() } });
  }
}

describe("purga de RateLimit", () => {
  it("borra las ventanas CERRADAS y NO la ventana en curso ni la inmediatamente anterior", async () => {
    const now = new Date("2026-08-02T12:00:00.000Z");
    // EN CURSO (misma hora): jamas se borra -> si se borrara, el limite se resetearia.
    await prisma.rateLimit.create({
      data: { key: "login:ip:encurso", windowStart: now, count: 3 },
    });
    // Anterior reciente (90 min < 2 h de holgura): tampoco se borra.
    const anterior = new Date(now.getTime() - 90 * 60 * 1000);
    await prisma.rateLimit.create({
      data: { key: "login:ip:prev", windowStart: anterior, count: 5 },
    });
    // Vieja (3 h > 2 h): esta SI.
    const vieja = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    await prisma.rateLimit.create({
      data: { key: "login:ip:vieja", windowStart: vieja, count: 9 },
    });

    const { total: borradas } = await podarRateLimit(prisma, {
      now,
      retenerMs: RATE_LIMIT_PURGE_RETENER_MS,
    });

    expect(borradas).toBe(1);
    // La EN CURSO conserva su cuenta intacta (el rate limit sigue protegiendo).
    const enCurso = await prisma.rateLimit.findFirst({ where: { key: "login:ip:encurso" } });
    expect(enCurso?.count).toBe(3);
    expect(await prisma.rateLimit.findFirst({ where: { key: "login:ip:prev" } })).not.toBeNull();
    expect(await prisma.rateLimit.findFirst({ where: { key: "login:ip:vieja" } })).toBeNull();
  });
});

describe("purga de sesiones caducadas", () => {
  it("borra las caducadas y respeta las vigentes", async () => {
    const now = new Date("2026-08-02T12:00:00.000Z");
    const userId = (await prisma.user.create({ data: {}, select: { id: true } })).id;
    await prisma.session.create({
      data: { sessionToken: "hash-caducada", userId, expires: new Date(now.getTime() - 1000) },
    });
    await prisma.session.create({
      data: { sessionToken: "hash-viva", userId, expires: new Date(now.getTime() + 60_000) },
    });

    const { total: borradas } = await purgeExpiredSessions(prisma, now);

    expect(borradas).toBe(1);
    expect(await prisma.session.findFirst({ where: { sessionToken: "hash-viva" } })).not.toBeNull();
    expect(await prisma.session.findFirst({ where: { sessionToken: "hash-caducada" } })).toBeNull();
  });
});

describe("purga de Job FAILED (retencion 90 dias)", () => {
  it("un FAILED de 30 dias NO se borra; uno de 100 SI", async () => {
    const now = new Date("2026-08-02T12:00:00.000Z");
    const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const d100 = new Date(now.getTime() - 100 * 24 * 60 * 60 * 1000);
    await prisma.job.create({
      data: { type: "SEND_EMAIL", status: "FAILED", runAt: d30, createdAt: d30 },
    });
    await prisma.job.create({
      data: { type: "SEND_EMAIL", status: "FAILED", runAt: d100, createdAt: d100 },
    });

    const { total: borrados } = await podarFailed(prisma, { now, dias: JOB_FAILED_RETENTION_DAYS });

    expect(borrados).toBe(1);
    const quedan = await prisma.job.findMany({ where: { status: "FAILED" } });
    expect(quedan).toHaveLength(1);
    expect(quedan[0]!.createdAt.getTime()).toBe(d30.getTime()); // sobrevive el de 30 dias
  });
});

describe("aviso al admin por acumulacion de FAILED (histeresis durable)", () => {
  const umbral = 3;
  const admin = "admin@dareflash.com";

  it("cruzar el umbral envia UN aviso; seguir por encima no; bajar y volver a cruzar si", async () => {
    const adapter = fakeAdapter();

    // Por DEBAJO del umbral: no avisa.
    await crearFailed(umbral - 1);
    expect((await avisarSiFallidos(prisma, adapter, { umbral, adminEmail: admin })).enviado).toBe(
      false,
    );
    expect(adapter.sent).toHaveLength(0);

    // CRUZAR el umbral: UN aviso.
    await crearFailed(1);
    expect((await avisarSiFallidos(prisma, adapter, { umbral, adminEmail: admin })).enviado).toBe(
      true,
    );
    expect(adapter.sent).toHaveLength(1);

    // SEGUIR por encima: NO reavisa (aunque suba mas).
    await crearFailed(5);
    expect((await avisarSiFallidos(prisma, adapter, { umbral, adminEmail: admin })).enviado).toBe(
      false,
    );
    expect(adapter.sent).toHaveLength(1);

    // BAJAR por debajo: re-arma, SIN correo.
    await prisma.job.deleteMany({ where: { status: "FAILED" } });
    expect((await avisarSiFallidos(prisma, adapter, { umbral, adminEmail: admin })).enviado).toBe(
      false,
    );
    expect(adapter.sent).toHaveLength(1);

    // VOLVER a cruzar: OTRO aviso.
    await crearFailed(umbral);
    expect((await avisarSiFallidos(prisma, adapter, { umbral, adminEmail: admin })).enviado).toBe(
      true,
    );
    expect(adapter.sent).toHaveLength(2);
  });

  it("la histeresis SOBREVIVE a un reinicio: el estado vive en SystemState (BD), no en memoria", async () => {
    await crearFailed(umbral);
    // "Arranque 1" del worker: cruza y avisa.
    const a1 = fakeAdapter();
    expect((await avisarSiFallidos(prisma, a1, { umbral, adminEmail: admin })).enviado).toBe(true);
    // "Arranque 2" (adaptador NUEVO, como un proceso reiniciado): sigue por encima -> NO reavisa,
    // porque el estado "disparado" quedo en SystemState.
    const a2 = fakeAdapter();
    expect((await avisarSiFallidos(prisma, a2, { umbral, adminEmail: admin })).enviado).toBe(false);
    expect(a2.sent).toHaveLength(0);
    expect(
      await prisma.systemState.findUnique({ where: { key: "aviso:job_failed" } }),
    ).not.toBeNull();
  });

  it("el aviso NO pasa por la cola: no crea ninguna fila en Job", async () => {
    const adapter = fakeAdapter();
    await crearFailed(umbral);
    const jobsAntes = await prisma.job.count();

    expect((await avisarSiFallidos(prisma, adapter, { umbral, adminEmail: admin })).enviado).toBe(
      true,
    );
    expect(adapter.sent).toHaveLength(1);
    // El aviso salio por el adaptador, NO como job: el numero de filas Job no cambia.
    expect(await prisma.job.count()).toBe(jobsAntes);
  });

  it("SIN ADMIN_EMAIL: NO marca DISPARADO; dos ciclos por encima dejan el estado ARMADO", async () => {
    const adapter = fakeAdapter();
    await crearFailed(umbral);

    // Dos ciclos por encima del umbral SIN destinatario: no envia y NO dispara el estado.
    expect((await avisarSiFallidos(prisma, adapter, { umbral })).enviado).toBe(false);
    expect((await avisarSiFallidos(prisma, adapter, { umbral })).enviado).toBe(false);
    expect(adapter.sent).toHaveLength(0);
    // El estado NO queda "disparado" (si no, olvidar ADMIN_EMAIL mataria el aviso para siempre).
    const estado = await prisma.systemState.findUnique({ where: { key: "aviso:job_failed" } });
    expect(estado?.value).not.toBe("disparado");

    // En cuanto se configura ADMIN_EMAIL, el aviso sale sin esperar a que el contador baje y cruce.
    expect((await avisarSiFallidos(prisma, adapter, { umbral, adminEmail: admin })).enviado).toBe(
      true,
    );
    expect(adapter.sent).toHaveLength(1);
  });
});
