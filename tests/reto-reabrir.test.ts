/**
 * REABRIR UN RETO CERRADO POR ERROR DE FECHAS — y NO reabrir ninguno más.
 *
 * ┌─ EL CANDADO ES TODA LA PIEZA ──────────────────────────────────────────────────────────────┐
 * │ El cierre es irreversible a propósito: escribe `ChallengeResult` con el premio CONGELADO,   │
 * │ recuenta las victorias del mes y las de por vida, da los puntos del top-20 y acredita el    │
 * │ premio en un monedero. Deshacer eso no es "volver a abrir": es corromper la contabilidad.    │
 * │                                                                                               │
 * │ Lo que SÍ se puede reabrir es el cierre que no otorgó NADA — el del reto publicado con el    │
 * │ plazo ya vencido. Por eso lo que se prueba aquí no es que reabrir funcione (una línea), sino │
 * │ CUÁNDO se niega.                                                                              │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ Y POR QUÉ NO SIRVE `premiadosEn` ─────────────────────────────────────────────────────────┐
 * │ Parece la columna obvia para "¿se repartió algo?" y es una trampa: `proyectarCierre` la      │
 * │ escribe TAMBIÉN cuando no había nada que repartir (cero premios y cero puntos son cero       │
 * │ fallos). O sea que el cierre vacío —el único que queremos poder reabrir— la tiene puesta.    │
 * │ El hecho que de verdad distingue es si existe algún `ChallengeResult`, y hay un caso abajo   │
 * │ que lo clava para que nadie "simplifique" el guard hacia la columna equivocada.              │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";
import { cerrarRetoVencido } from "../src/server/services/cierre-reto";
import { reabrirReto } from "../src/server/services/retos-admin";
import { generarPublicCode } from "../src/server/services/reto-codigo";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

let prisma: PrismaClient;
let admin: string;
let n = 0;

const DIA = 86_400_000;

beforeAll(() => {
  prisma = createTestPrisma();
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
  n = 0;
  admin = await crearUsuario(prisma, { username: "la_admin_reabrir" });
});

/** Un reto PUBLICADO con el cierre ya pasado: el que el barrido cerrará sin otorgar nada. */
async function retoVencido(opts: { minParticipaciones?: number } = {}): Promise<string> {
  n += 1;
  const r = await prisma.challenge.create({
    data: {
      title: `Reto ${n}`,
      slug: `reto-${n}`,
      publicCode: generarPublicCode(),
      category: "fitness",
      status: "PUBLISHED",
      prizeCurrency: "USD",
      prizeAmountCents: 5000,
      startsAt: new Date(Date.now() - 2 * DIA),
      deadline: new Date(Date.now() - DIA),
      createdById: admin,
      ...(opts.minParticipaciones ? { minParticipaciones: opts.minParticipaciones } : {}),
    },
    select: { id: true },
  });
  return r.id;
}

/** Una participación publicada: lo que el cierre mira para declarar ganador. */
async function participar(challengeId: string): Promise<string> {
  const userId = await crearUsuario(prisma);
  n += 1;
  const video = await prisma.video.create({
    data: { userId, bunnyVideoId: `re-${n}-${Date.now()}`, status: "PUBLISHED" },
    select: { id: true },
  });
  await prisma.submission.create({
    data: { challengeId, userId, videoId: video.id, status: "PUBLISHED", voteCount: 3 },
  });
  return userId;
}

/** Mueve el cierre al futuro, que es lo que el admin hace editando antes de reabrir. */
const arreglarFechas = (id: string) =>
  prisma.challenge.update({
    where: { id },
    data: { startsAt: new Date(Date.now() - 3600_000), deadline: new Date(Date.now() + 7 * DIA) },
  });

describe("el caso que la pieza existe para resolver", () => {
  it("un reto que cerró SIN otorgar nada se reabre, y vuelve a estar publicado", async () => {
    const id = await retoVencido();
    await cerrarRetoVencido(prisma, id);

    const cerrado = await prisma.challenge.findUniqueOrThrow({ where: { id } });
    expect(cerrado.status).toBe("CLOSED");
    expect(cerrado.closedAt).not.toBeNull();
    // SIN resultados: no hubo participaciones, así que no hay nada que deshacer.
    expect(await prisma.challengeResult.count({ where: { challengeId: id } })).toBe(0);

    await arreglarFechas(id);
    expect(await reabrirReto(prisma, id)).toEqual({ estado: "reabierto" });

    const vivo = await prisma.challenge.findUniqueOrThrow({ where: { id } });
    expect(vivo.status).toBe("PUBLISHED");
    // LAS CUATRO columnas del cierre, limpias: dejar una puesta sería un reto medio cerrado.
    expect(vivo.closedAt).toBeNull();
    expect(vivo.motivoCierre).toBeNull();
    expect(vivo.premiadosEn).toBeNull();
  });

  it("y el barrido NO lo vuelve a cerrar, porque su cierre ya es futuro", async () => {
    // Si no, la acción sería un espejismo: reabierto durante un tick y cerrado otra vez.
    const id = await retoVencido();
    await cerrarRetoVencido(prisma, id);
    await arreglarFechas(id);
    await reabrirReto(prisma, id);

    await cerrarRetoVencido(prisma, id);

    expect((await prisma.challenge.findUniqueOrThrow({ where: { id } })).status).toBe("PUBLISHED");
  });

  it("el `premiadosEn` limpio importa: sin él, un cierre futuro no repartiría nada", async () => {
    // `cerrarRetoVencido` corta en seco cuando hay `closedAt` Y `premiadosEn`. Si reabrir dejara
    // esa columna puesta, el reto se cerraría otra vez pero NO premiaría a nadie: un reto con
    // ganador y sin premio, que es peor que el bug original.
    const id = await retoVencido();
    await cerrarRetoVencido(prisma, id);
    expect(
      (await prisma.challenge.findUniqueOrThrow({ where: { id } })).premiadosEn,
      "el cierre vacío NO marcó premiadosEn: el caso de abajo ya no prueba nada",
    ).not.toBeNull();

    await arreglarFechas(id);
    await reabrirReto(prisma, id);

    expect((await prisma.challenge.findUniqueOrThrow({ where: { id } })).premiadosEn).toBeNull();
  });
});

describe("y NO se reabre ningún otro", () => {
  it("uno CON GANADOR: el premio y los puntos ya están dados", async () => {
    const id = await retoVencido();
    await participar(id);
    await cerrarRetoVencido(prisma, id);
    expect(await prisma.challengeResult.count({ where: { challengeId: id } })).toBe(1);

    await arreglarFechas(id);

    expect(await reabrirReto(prisma, id)).toEqual({
      estado: "rechazado",
      motivo: "CON_RESULTADOS",
    });
    // Y sigue cerrado: un rechazo no puede dejar nada a medias.
    const sigue = await prisma.challenge.findUniqueOrThrow({ where: { id } });
    expect(sigue.status).toBe("CLOSED");
    expect(sigue.closedAt).not.toBeNull();
  });

  it("uno que espera a que el admin rompa un EMPATE: tiene su propio flujo", async () => {
    const id = await retoVencido();
    // Dos participaciones empatadas a votos en la línea del premio (winnersCount = 1).
    await participar(id);
    await participar(id);
    await cerrarRetoVencido(prisma, id);
    expect((await prisma.challenge.findUniqueOrThrow({ where: { id } })).motivoCierre).toBe(
      "EMPATE_PENDIENTE",
    );

    await arreglarFechas(id);

    expect(await reabrirReto(prisma, id)).toEqual({
      estado: "rechazado",
      motivo: "EMPATE_PENDIENTE",
    });
  });

  it("uno cuyo cierre SIGUE en el pasado: se volvería a cerrar al instante", async () => {
    const id = await retoVencido();
    await cerrarRetoVencido(prisma, id);

    // Sin arreglar las fechas.
    expect(await reabrirReto(prisma, id)).toEqual({
      estado: "rechazado",
      motivo: "CIERRE_PASADO",
    });
  });

  it("uno que NO está cerrado: no hay nada que reabrir", async () => {
    const id = await retoVencido();
    await arreglarFechas(id); // publicado y vivo

    expect(await reabrirReto(prisma, id)).toEqual({ estado: "rechazado", motivo: "NO_CERRADO" });
  });

  it("uno en camino de borrarse tampoco, aunque cumpla lo demás", async () => {
    // Reabrir algo que el admin está borrando es una contradicción, y el reto volvería al público.
    const id = await retoVencido();
    await cerrarRetoVencido(prisma, id);
    await arreglarFechas(id);
    await prisma.challenge.update({
      where: { id },
      data: { eliminacionProgramadaEn: new Date(Date.now() + 7 * DIA) },
    });

    expect(await reabrirReto(prisma, id)).toEqual({ estado: "rechazado", motivo: "NO_CERRADO" });
    expect((await prisma.challenge.findUniqueOrThrow({ where: { id } })).status).toBe("CLOSED");
  });

  it("y un id inexistente no revienta", async () => {
    expect(await reabrirReto(prisma, "no-existe")).toEqual({
      estado: "rechazado",
      motivo: "NO_CERRADO",
    });
  });
});

describe("reabrir no toca nada que no sea el cierre", () => {
  it("ni las victorias, ni el monedero, ni los puntos de nadie", async () => {
    // El reto que se reabre no otorgó nada, así que no hay nada que revertir — y esto lo fija:
    // si algún día reabrir intentara "limpiar" resultados, aquí se vería.
    const id = await retoVencido();
    await cerrarRetoVencido(prisma, id);
    await arreglarFechas(id);

    await reabrirReto(prisma, id);

    expect(await prisma.challengeResult.count()).toBe(0);
    expect(await prisma.walletLedger.count()).toBe(0);
    expect(await prisma.pointsLedger.count()).toBe(0);
    expect(await prisma.rankingMensual.count()).toBe(0);
  });

  it("y conserva el reto: mismo código público, mismo premio, mismo título", async () => {
    const id = await retoVencido();
    const antes = await prisma.challenge.findUniqueOrThrow({ where: { id } });
    await cerrarRetoVencido(prisma, id);
    await arreglarFechas(id);

    await reabrirReto(prisma, id);

    const despues = await prisma.challenge.findUniqueOrThrow({ where: { id } });
    expect(despues.publicCode).toBe(antes.publicCode);
    expect(despues.prizeAmountCents).toBe(antes.prizeAmountCents);
    expect(despues.title).toBe(antes.title);
  });
});
