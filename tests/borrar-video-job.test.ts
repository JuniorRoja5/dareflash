/**
 * Job BUNNY_DELETE_VIDEO (borrado del objeto en Bunny por la COLA), con dientes. Se ejercita a
 * traves del runner REAL (`procesarLote`) para cubrir la clasificacion de fallo del tipo REQUEUE:
 *   - objeto ausente / borrado OK -> DONE, sin reintento (deleteVideo real trata el 404 como exito;
 *     aqui el stub resuelve, que es justo lo que ese 404-como-exito produce).
 *   - error de RED/HTTP -> el handler PROPAGA -> el job vuelve a PENDING (reintento con backoff).
 *   - fallo PERSISTENTE (agota maxAttempts) -> FAILED VISIBLE, conservando el bunnyVideoId (no se
 *     pierde en silencio qué objeto quedó sin borrar).
 *   - idempotencia: procesar dos veces el mismo GUID -> DONE ambas, sin efectos raros.
 * Romper cada rama (quitar el throw, subir maxAttempts, etc.) hace caer el test.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { EmailAdapter } from "../src/server/email/adapter";
import { construirRegistro } from "../src/server/jobs/registry";
import { procesarLote } from "../src/server/jobs/worker";
import type { PrismaClient } from "../src/generated/prisma/client";

import { createTestPrisma, resetDb } from "./helpers/db";

const adapterInerte: EmailAdapter = { name: "inerte", async send() {} };

/** deleteVideo controlable; el resto del cliente es inerte (no se usa en este job). */
function registroCon(deleteVideo: (input: { videoId: string }) => Promise<void>) {
  return construirRegistro({
    emailAdapter: adapterInerte,
    bunny: {
      cliente: {
        crearVideo: async () => ({ guid: "x" }),
        getVideo: async () => ({ status: 4, length: 0, thumbnailFileName: null }),
        listVideos: async () => ({ items: [], totalItems: 0 }),
        deleteVideo,
        setThumbnail: async () => {},
      },
      config: { libraryId: "lib", apiKey: "key" },
    },
  });
}

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

async function encolarBorrado(bunnyVideoId: string, maxAttempts = 5): Promise<string> {
  const j = await prisma.job.create({
    data: {
      type: "BUNNY_DELETE_VIDEO",
      payload: { bunnyVideoId },
      runAt: new Date(Date.now() - 1000), // vencido: reclamable ya
      maxAttempts,
    },
    select: { id: true },
  });
  return j.id;
}

describe("job BUNNY_DELETE_VIDEO", () => {
  it("objeto borrado/ausente -> DONE, sin reintento, deleteVideo con el GUID correcto", async () => {
    const del = vi.fn(async () => {});
    const jobId = await encolarBorrado("g-ok");
    const r = await procesarLote(prisma, registroCon(del), {
      workerToken: "w1",
      limit: 10,
      now: new Date(),
    });
    expect(r.hechos).toBe(1);
    expect(del).toHaveBeenCalledOnce();
    expect(del).toHaveBeenCalledWith(expect.objectContaining({ videoId: "g-ok" }));

    const j = await prisma.job.findUnique({ where: { id: jobId } });
    expect(j?.status).toBe("DONE");
    expect(j?.attempts).toBe(0); // no hubo fallo
  });

  it("error de RED -> el job vuelve a PENDING (reintento), no FAILED", async () => {
    const del = vi.fn(async () => {
      throw new Error("ETIMEDOUT: Bunny inaccesible");
    });
    const jobId = await encolarBorrado("g-red", 5);
    const now = new Date();
    const r = await procesarLote(prisma, registroCon(del), { workerToken: "w1", limit: 10, now });
    expect(r.fallidos).toBe(1);

    const j = await prisma.job.findUnique({ where: { id: jobId } });
    expect(j?.status).toBe("PENDING"); // REQUEUE: se reintenta
    expect(j?.attempts).toBe(1);
    expect(j!.runAt.getTime()).toBeGreaterThan(now.getTime()); // backoff hacia el futuro
  });

  it("fallo PERSISTENTE (agota maxAttempts) -> FAILED VISIBLE con el bunnyVideoId", async () => {
    const del = vi.fn(async () => {
      throw new Error("HTTP 500 persistente");
    });
    const jobId = await encolarBorrado("g-fail", 1); // un solo intento -> agota ya
    await procesarLote(prisma, registroCon(del), { workerToken: "w1", limit: 10, now: new Date() });

    const j = await prisma.job.findUnique({ where: { id: jobId } });
    expect(j?.status).toBe("FAILED");
    expect((j?.payload as { bunnyVideoId?: string }).bunnyVideoId).toBe("g-fail"); // qué quedó sin borrar
    expect(j?.lastError).toBeTruthy();
  });

  it("idempotencia: procesar dos jobs del mismo GUID -> DONE ambas, sin efectos", async () => {
    const del = vi.fn(async () => {});
    await encolarBorrado("g-dup");
    await procesarLote(prisma, registroCon(del), { workerToken: "w1", limit: 10, now: new Date() });
    // Segundo barrido del mismo objeto (p.ej. reintento tras un reaper): sigue siendo un no-op seguro.
    await encolarBorrado("g-dup");
    await procesarLote(prisma, registroCon(del), { workerToken: "w2", limit: 10, now: new Date() });

    const done = await prisma.job.count({ where: { type: "BUNNY_DELETE_VIDEO", status: "DONE" } });
    expect(done).toBe(2);
    expect(del).toHaveBeenCalledTimes(2);
  });
});
