/**
 * EL BARRIDO DE BORRADOS TIENE LLAMANTE DE VERDAD.
 *
 * Una función de mantenimiento sin nadie que la llame es una mentira: la UI promete algo y el sistema
 * no lo hace. Este test NO comprueba que exista el código — eso lo dice un `grep` y se equivoca —,
 * sino que EJECUTA el bucle real del worker y mira el efecto en la base de datos.
 *
 * Y fija el límite: consumar un borrado no puede tocar los vídeos de los participantes. La decisión
 * cerrada es que borrar un reto lo OCULTA; el contenido es de sus autores.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";
import { bucleWorker } from "../src/server/jobs/worker";
import { borrarReto } from "../src/server/services/retos-admin";
import { generarPublicCode } from "../src/server/services/reto-codigo";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

let prisma: PrismaClient;
let adminId: string;
let n = 0;

beforeAll(() => {
  prisma = createTestPrisma();
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
  n = 0;
  adminId = await crearUsuario(prisma);
});

async function crearReto() {
  n += 1;
  return prisma.challenge.create({
    data: {
      title: `Reto ${n}`,
      slug: `reto-${n}`,
      publicCode: generarPublicCode(),
      category: "fitness",
      status: "PUBLISHED",
      prizeCurrency: "USD",
      startsAt: new Date(Date.now() - 3_600_000),
      deadline: new Date(Date.now() + 86_400_000),
      createdById: adminId,
    },
    select: { id: true },
  });
}

/**
 * Una vuelta COMPLETA del bucle real. Se para en el hook de dormir, que corre al FINAL de la
 * iteración: parar antes se saltaría los barridos de mantenimiento (ya nos pasó una vez).
 */
async function unaVuelta(): Promise<void> {
  let vueltas = 0;
  await bucleWorker(
    prisma,
    {},
    {
      workerToken: "test",
      limit: 1,
      intervaloMs: 0,
      parar: () => vueltas > 0,
      dormir: async () => {
        vueltas += 1;
      },
    },
  );
}

describe("el worker consuma los borrados vencidos", () => {
  it("un borrado cuya gracia YA venció queda consumado tras una vuelta", async () => {
    const r = await crearReto();
    await borrarReto(prisma, r.id);
    await prisma.challenge.update({
      where: { id: r.id },
      data: { eliminacionProgramadaEn: new Date(Date.now() - 1000) },
    });

    await unaVuelta();

    const c = await prisma.challenge.findUniqueOrThrow({
      where: { id: r.id },
      select: { deletedAt: true, eliminacionProgramadaEn: true },
    });
    // Si nadie llamara al barrido, esto seguiría pendiente para siempre y el admin creería que borró.
    expect(c.deletedAt).toBeInstanceOf(Date);
    expect(c.eliminacionProgramadaEn).toBeNull();
  });

  it("uno que SIGUE en gracia no se toca: la ventana para arrepentirse es real", async () => {
    const r = await crearReto();
    await borrarReto(prisma, r.id);

    await unaVuelta();

    const c = await prisma.challenge.findUniqueOrThrow({
      where: { id: r.id },
      select: { deletedAt: true, eliminacionProgramadaEn: true },
    });
    expect(c.deletedAt).toBeNull();
    expect(c.eliminacionProgramadaEn).not.toBeNull();
  });

  it("consumar NO toca los vídeos de los participantes", async () => {
    const r = await crearReto();
    const autor = await crearUsuario(prisma);
    const video = await prisma.video.create({
      data: { userId: autor, bunnyVideoId: "g1", status: "PUBLISHED" },
      select: { id: true },
    });
    await prisma.submission.create({
      data: { challengeId: r.id, userId: autor, videoId: video.id, status: "PUBLISHED" },
    });
    await borrarReto(prisma, r.id);
    await prisma.challenge.update({
      where: { id: r.id },
      data: { eliminacionProgramadaEn: new Date(Date.now() - 1000) },
    });

    await unaVuelta();

    // El contenido es de su autor: borrar un reto lo OCULTA, nunca destruye vídeos de terceros.
    const v = await prisma.video.findUniqueOrThrow({
      where: { id: video.id },
      select: { status: true },
    });
    expect(v.status).toBe("PUBLISHED");
    expect(await prisma.submission.count({ where: { challengeId: r.id } })).toBe(1);
  });
});
