/**
 * QUÉ RETO ENSEÑA /ranking: el ÚLTIMO cerrado que tiene participaciones que CUENTAN (submission y
 * vídeo PUBLISHED, la regla del más restrictivo). Un cierre más reciente pero vacío no le roba la
 * pestaña a uno anterior con participaciones.
 *
 * Los retos se cierran por la ruta REAL (`cerrarRetoVencido`, con el reloj inyectado para fijar el
 * orden de `closedAt`), no escribiendo `closedAt` a mano.
 *
 * Para romperlo a propósito: quitar la condición `submissions: { some: ... }` de `ultimoRetoConTop`
 * -> se cuela el reto vacío más reciente (rojo); relajar la regla a solo `status: PUBLISHED` de la
 * submission -> se cuela el de vídeo en cola (rojo).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";
import { cerrarRetoVencido } from "../src/server/services/cierre-reto";
import { topDelReto, ultimoRetoConTop } from "../src/server/services/ranking";
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

const HACE = (horas: number) => new Date(Date.now() - horas * 3_600_000);

async function crearReto(): Promise<string> {
  n += 1;
  const c = await prisma.challenge.create({
    data: {
      title: `Reto ${n}`,
      slug: `reto-${n}`,
      publicCode: generarPublicCode(),
      category: "fitness",
      status: "PUBLISHED",
      prizeCurrency: "USD",
      startsAt: HACE(100),
      deadline: HACE(50),
      createdById: adminId,
    },
    select: { id: true },
  });
  return c.id;
}

async function participar(
  challengeId: string,
  opts: { sub?: "PUBLISHED" | "REMOVED"; video?: "PUBLISHED" | "PENDING" | "FAILED" } = {},
): Promise<void> {
  const userId = await crearUsuario(prisma);
  n += 1;
  const video = await prisma.video.create({
    data: { userId, bunnyVideoId: `g-${n}`, status: opts.video ?? "PUBLISHED" },
    select: { id: true },
  });
  await prisma.submission.create({
    data: { challengeId, userId, videoId: video.id, status: opts.sub ?? "PUBLISHED", voteCount: 1 },
  });
}

/** Cierra por la ruta real, con el `closedAt` que se le diga (orden controlado). */
const cerrar = (id: string, horasAtras: number) => cerrarRetoVencido(prisma, id, HACE(horasAtras));

describe("ultimoRetoConTop", () => {
  it("el más reciente VACÍO no roba la pestaña: se elige el anterior con participaciones", async () => {
    const conTop = await crearReto();
    await participar(conTop);
    await cerrar(conTop, 10);

    const vacio = await crearReto();
    await cerrar(vacio, 1); // más reciente, y sin nadie

    const elegido = await ultimoRetoConTop(prisma);
    expect(elegido?.id).toBe(conTop);
    // Y su top NO está vacío: la pestaña lleva a algo.
    expect((await topDelReto(prisma, conTop)).length).toBeGreaterThan(0);
  });

  it("si el más reciente tiene participaciones, es ése", async () => {
    const viejo = await crearReto();
    await participar(viejo);
    await cerrar(viejo, 10);
    const nuevo = await crearReto();
    await participar(nuevo);
    await cerrar(nuevo, 1);

    expect((await ultimoRetoConTop(prisma))?.id).toBe(nuevo);
  });

  it("MISMA regla que el top: participaciones que no cuentan no hacen elegible un reto", async () => {
    const bueno = await crearReto();
    await participar(bueno);
    await cerrar(bueno, 10);

    // Más recientes, pero sin nada que cuente: vídeo en cola, vídeo fallido, participación retirada.
    for (const opts of [{ video: "PENDING" }, { video: "FAILED" }, { sub: "REMOVED" }] as const) {
      const r = await crearReto();
      await participar(r, opts);
      await cerrar(r, 1);
      expect(await topDelReto(prisma, r)).toEqual([]);
    }

    expect((await ultimoRetoConTop(prisma))?.id).toBe(bueno);
  });

  it("sin ningún reto cerrado con participaciones: null (y /ranking enseña solo 'Este mes')", async () => {
    const vacio = await crearReto();
    await cerrar(vacio, 1);
    const abierto = await crearReto();
    await participar(abierto); // tiene participaciones, pero no ha cerrado

    expect(await ultimoRetoConTop(prisma)).toBeNull();
  });

  it("un reto borrado o en camino de borrarse no se ofrece", async () => {
    const vivo = await crearReto();
    await participar(vivo);
    await cerrar(vivo, 10);
    const borrado = await crearReto();
    await participar(borrado);
    await cerrar(borrado, 1);
    await prisma.challenge.update({ where: { id: borrado }, data: { deletedAt: new Date() } });

    expect((await ultimoRetoConTop(prisma))?.id).toBe(vivo);
  });
});
