/**
 * RENDIMIENTO EN EL TIEMPO (Fase 4): `serieDiariaReto` cuenta de VERDAD contra la BD, por día UTC y
 * dentro de la ventana del reto [startsAt, closedAt ?? min(ahora, deadline)].
 *
 * Toda la actividad se siembra con fechas CONOCIDAS, así cada número esperado se puede comprobar a
 * mano. Para romperlo a propósito: quitar el acotado a la ventana (rojo), cortar una de las dos
 * series en otra zona horaria (rojo en el borde de día), o no acotar al reto (rojo).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";
import { serieDiariaReto } from "../src/server/services/panel-metricas";
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

const t = (iso: string) => new Date(iso);

async function crearReto(ventana: { startsAt: string; deadline: string; closedAt?: string }) {
  n += 1;
  const r = await prisma.challenge.create({
    data: {
      title: `Reto ${n}`,
      slug: `reto-${n}`,
      publicCode: generarPublicCode(),
      category: "fitness",
      status: ventana.closedAt ? "CLOSED" : "PUBLISHED",
      prizeCurrency: "USD",
      startsAt: t(ventana.startsAt),
      deadline: t(ventana.deadline),
      closedAt: ventana.closedAt ? t(ventana.closedAt) : null,
      createdById: adminId,
    },
    select: { id: true },
  });
  return r.id;
}

/** Una participación creada en `cuando` (usuario y vídeo nuevos: una por usuario y reto). */
async function participar(challengeId: string, cuando: string, estado = "PUBLISHED") {
  n += 1;
  const userId = await crearUsuario(prisma);
  const video = await prisma.video.create({
    data: {
      userId,
      bunnyVideoId: `serie-${n}`,
      status: estado === "REMOVED" ? "REMOVED" : "PUBLISHED",
    },
    select: { id: true },
  });
  const s = await prisma.submission.create({
    data: {
      challengeId,
      userId,
      videoId: video.id,
      status: estado as "PUBLISHED" | "REMOVED",
      createdAt: t(cuando),
    },
    select: { id: true },
  });
  return s.id;
}

/** Un voto emitido en `cuando` a `submissionId` (votante nuevo: un voto por usuario y reto). */
async function votar(challengeId: string, submissionId: string, cuando: string) {
  const userId = await crearUsuario(prisma);
  await prisma.vote.create({ data: { userId, challengeId, submissionId, createdAt: t(cuando) } });
}

describe("serieDiariaReto", () => {
  it("cuenta participaciones y votos POR DÍA, con 0 real en los días de la ventana sin nada", async () => {
    const reto = await crearReto({
      startsAt: "2026-03-01T00:00:00Z",
      deadline: "2026-03-10T00:00:00Z",
      closedAt: "2026-03-05T12:00:00Z",
    });
    const a = await participar(reto, "2026-03-01T10:00:00Z");
    await participar(reto, "2026-03-01T15:00:00Z");
    const c = await participar(reto, "2026-03-03T09:00:00Z");
    await votar(reto, a, "2026-03-01T20:00:00Z");
    await votar(reto, c, "2026-03-03T10:00:00Z");
    await votar(reto, a, "2026-03-03T11:00:00Z");
    await votar(reto, c, "2026-03-04T23:59:59Z");

    const s = await serieDiariaReto(prisma, reto);

    expect(s?.dias).toEqual([
      { dia: "2026-03-01", participaciones: 2, votos: 1 },
      { dia: "2026-03-02", participaciones: 0, votos: 0 },
      { dia: "2026-03-03", participaciones: 1, votos: 2 },
      { dia: "2026-03-04", participaciones: 0, votos: 1 },
      { dia: "2026-03-05", participaciones: 0, votos: 0 },
    ]);
    expect(s?.total).toEqual({ participaciones: 3, votos: 4 });
  });

  it("lo de FUERA de la ventana no cuenta: ni antes de abrir ni después del cierre", async () => {
    // Apertura y cierre a MITAD de día, a propósito: lo de antes de abrir y lo de después de cerrar
    // cae en días que SÍ son de la ventana, así que solo el acotado POR HORA de la consulta lo deja
    // fuera (el cruce por días no lo vería).
    const reto = await crearReto({
      startsAt: "2026-03-01T10:00:00Z",
      deadline: "2026-03-10T00:00:00Z",
      closedAt: "2026-03-05T12:00:00Z",
    });
    await participar(reto, "2026-03-01T09:59:59Z"); // el día de apertura, antes de abrir
    await participar(reto, "2026-03-05T12:00:01Z"); // el día del cierre, después de cerrar
    const dentro = await participar(reto, "2026-03-02T12:00:00Z");
    await votar(reto, dentro, "2026-03-01T09:00:00Z"); // antes de abrir
    await votar(reto, dentro, "2026-03-05T12:00:01Z"); // un segundo después del cierre
    await votar(reto, dentro, "2026-03-07T09:00:00Z"); // cerrado, aunque antes del deadline

    const s = await serieDiariaReto(prisma, reto);

    expect(s?.total).toEqual({ participaciones: 1, votos: 0 });
    expect(s?.dias.map((d) => d.dia)).toEqual([
      "2026-03-01",
      "2026-03-02",
      "2026-03-03",
      "2026-03-04",
      "2026-03-05",
    ]);
  });

  it("los EXTREMOS de la ventana cuentan: el instante de apertura y el de cierre", async () => {
    const reto = await crearReto({
      startsAt: "2026-03-01T10:00:00Z",
      deadline: "2026-03-10T00:00:00Z",
      closedAt: "2026-03-03T12:00:00Z",
    });
    const primera = await participar(reto, "2026-03-01T10:00:00Z");
    await participar(reto, "2026-03-03T12:00:00Z");
    await votar(reto, primera, "2026-03-03T12:00:00Z");

    const s = await serieDiariaReto(prisma, reto);

    expect(s?.dias).toEqual([
      { dia: "2026-03-01", participaciones: 1, votos: 0 },
      { dia: "2026-03-02", participaciones: 0, votos: 0 },
      { dia: "2026-03-03", participaciones: 1, votos: 1 },
    ]);
  });

  it("abierto: la ventana acaba HOY, o en el deadline si ya pasó", async () => {
    const reto = await crearReto({
      startsAt: "2026-03-01T00:00:00Z",
      deadline: "2026-03-10T00:00:00Z",
    });
    const p = await participar(reto, "2026-03-02T08:00:00Z");
    await votar(reto, p, "2026-03-09T08:00:00Z");
    await votar(reto, p, "2026-03-12T08:00:00Z"); // después del deadline

    const aMitad = await serieDiariaReto(prisma, reto, t("2026-03-04T12:00:00Z"));
    expect(aMitad?.dias.map((d) => d.dia)).toEqual([
      "2026-03-01",
      "2026-03-02",
      "2026-03-03",
      "2026-03-04",
    ]);
    expect(aMitad?.total).toEqual({ participaciones: 1, votos: 0 }); // el voto del 9 aún no ha llegado

    const pasado = await serieDiariaReto(prisma, reto, t("2026-03-20T00:00:00Z"));
    expect(pasado?.dias.at(-1)?.dia).toBe("2026-03-10");
    expect(pasado?.total).toEqual({ participaciones: 1, votos: 1 }); // el del 12 queda fuera
  });

  it("día UTC en LAS DOS series: las 23:30 y las 00:30 siguientes caen en días distintos", async () => {
    const reto = await crearReto({
      startsAt: "2026-03-01T00:00:00Z",
      deadline: "2026-03-10T00:00:00Z",
      closedAt: "2026-03-03T00:00:00Z",
    });
    const tarde = await participar(reto, "2026-03-01T23:30:00Z");
    await participar(reto, "2026-03-02T00:30:00Z");
    await votar(reto, tarde, "2026-03-01T23:30:00Z");
    await votar(reto, tarde, "2026-03-02T00:30:00Z");

    const s = await serieDiariaReto(prisma, reto);

    expect(s?.dias.slice(0, 2)).toEqual([
      { dia: "2026-03-01", participaciones: 1, votos: 1 },
      { dia: "2026-03-02", participaciones: 1, votos: 1 },
    ]);
  });

  it("es ACTIVIDAD registrada: cuenta también lo que después se retiró", async () => {
    const reto = await crearReto({
      startsAt: "2026-03-01T00:00:00Z",
      deadline: "2026-03-10T00:00:00Z",
      closedAt: "2026-03-02T00:00:00Z",
    });
    const retirada = await participar(reto, "2026-03-01T10:00:00Z", "REMOVED");
    await votar(reto, retirada, "2026-03-01T11:00:00Z");

    const s = await serieDiariaReto(prisma, reto);
    expect(s?.total).toEqual({ participaciones: 1, votos: 1 });
  });

  it("solo ESTE reto: la actividad de otro, en los mismos días, no se cuela", async () => {
    const ventana = {
      startsAt: "2026-03-01T00:00:00Z",
      deadline: "2026-03-10T00:00:00Z",
      closedAt: "2026-03-02T00:00:00Z",
    };
    const reto = await crearReto(ventana);
    const otro = await crearReto(ventana);
    const mia = await participar(reto, "2026-03-01T10:00:00Z");
    await votar(reto, mia, "2026-03-01T11:00:00Z");
    const ajena = await participar(otro, "2026-03-01T10:00:00Z");
    await participar(otro, "2026-03-01T12:00:00Z");
    await votar(otro, ajena, "2026-03-01T11:00:00Z");
    await votar(otro, ajena, "2026-03-01T13:00:00Z");

    const s = await serieDiariaReto(prisma, reto);
    expect(s?.total).toEqual({ participaciones: 1, votos: 1 });
  });

  it("sin actividad: la ventana medida, con todos sus días a 0", async () => {
    const reto = await crearReto({
      startsAt: "2026-03-01T00:00:00Z",
      deadline: "2026-03-10T00:00:00Z",
      closedAt: "2026-03-03T00:00:00Z",
    });
    const s = await serieDiariaReto(prisma, reto);
    expect(s?.dias).toHaveLength(3);
    expect(s?.total).toEqual({ participaciones: 0, votos: 0 });
  });

  it("un reto que aún no ha abierto no tiene ventana: sin días", async () => {
    const reto = await crearReto({
      startsAt: "2026-03-10T00:00:00Z",
      deadline: "2026-03-20T00:00:00Z",
    });
    const s = await serieDiariaReto(prisma, reto, t("2026-03-05T00:00:00Z"));
    expect(s?.dias).toEqual([]);
    expect(s?.total).toEqual({ participaciones: 0, votos: 0 });
  });

  it("un reto que no existe da null", async () => {
    expect(await serieDiariaReto(prisma, "no-existe")).toBeNull();
  });
});
