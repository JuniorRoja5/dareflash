import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";
import { claimJobs } from "../src/server/services/jobs";

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

describe("cola de trabajos (claimJobs, patron lockedBy)", () => {
  it("dos ejecuciones simultaneas: ningun job se reclama dos veces", async () => {
    const N = 20;
    const ayer = new Date(Date.now() - 3_600_000); // runAt vencido
    await prisma.job.createMany({
      data: Array.from({ length: N }, (_, i) => ({
        type: "SEND_EMAIL",
        runAt: ayer,
        payload: { i },
      })),
    });

    // Dos "workers" con tokens distintos, cada uno intentando coger todo el lote.
    const [a, b] = await Promise.all([
      claimJobs(prisma, { workerToken: "worker-A", limit: N }),
      claimJobs(prisma, { workerToken: "worker-B", limit: N }),
    ]);

    const idsA = a.map((j) => j.id);
    const idsB = b.map((j) => j.id);

    // Sin solapamiento entre lo que reclama cada uno.
    const interseccion = idsA.filter((id) => idsB.includes(id));
    expect(interseccion).toHaveLength(0);

    // Entre los dos reclaman todos, sin duplicados.
    const todos = new Set([...idsA, ...idsB]);
    expect(todos.size).toBe(N);

    // Ningun job quedo PENDING ni con dos duenos: cada uno tiene un unico lockedBy.
    const runningSinDueno = await prisma.job.count({
      where: { status: "RUNNING", lockedBy: null },
    });
    const pendientes = await prisma.job.count({ where: { status: "PENDING" } });
    expect(runningSinDueno).toBe(0);
    expect(pendientes).toBe(0);
  });

  it("solo reclama jobs cuyo runAt ya vencio", async () => {
    const ayer = new Date(Date.now() - 3_600_000);
    const manana = new Date(Date.now() + 3_600_000);
    await prisma.job.create({ data: { type: "SEND_EMAIL", runAt: ayer } });
    await prisma.job.create({ data: { type: "SEND_EMAIL", runAt: manana } });

    const reclamados = await claimJobs(prisma, { workerToken: "w", limit: 10 });
    expect(reclamados).toHaveLength(1); // solo el vencido
  });
});
