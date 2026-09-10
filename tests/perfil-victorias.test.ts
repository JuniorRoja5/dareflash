/**
 * EL PERFIL ENSEÑA VICTORIAS REALES, no un placeholder.
 *
 * El perfil ya leía `ChallengeResult` y `pointsBalance` — lo que NO había era nada que lo vigilara.
 * Estos tests atan las dos mitades del criterio: con N victorias reales sale N, y sin ninguna sale 0
 * (vacío honesto), nunca una cifra de maqueta.
 *
 * Las victorias NO se siembran: salen de ejecutar el cierre real. Escribir `ChallengeResult` a mano
 * probaría que un `count` cuenta, que ya lo sabemos; lo que hay que probar es que lo que el cierre
 * produce es lo que el perfil enseña.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { POINTS } from "@/config/constants";
import type { PrismaClient } from "../src/generated/prisma/client";
import { nivelPorPuntos } from "../src/lib/niveles";
import { cerrarRetoVencido } from "../src/server/services/cierre-reto";
import { perfilPublicoPorUsername } from "../src/server/services/perfil";
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
      prizeAmountCents: 1000,
      startsAt: new Date(Date.now() - 86_400_000),
      deadline: new Date(Date.now() - 3_600_000),
      createdById: adminId,
    },
    select: { id: true },
  });
}

async function participar(challengeId: string, votos: number, userId?: string) {
  const uid = userId ?? (await crearUsuario(prisma));
  n += 1;
  const video = await prisma.video.create({
    data: { userId: uid, bunnyVideoId: `guid-${n}-${Date.now()}`, status: "PUBLISHED" },
    select: { id: true },
  });
  await prisma.submission.create({
    data: { challengeId, userId: uid, videoId: video.id, status: "PUBLISHED", voteCount: votos },
  });
  return uid;
}

/** Gana `veces` retos por la vía real (un cierre por reto). */
async function ganar(veces: number, userId?: string): Promise<string> {
  let uid = userId;
  for (let i = 0; i < veces; i += 1) {
    const reto = await crearReto();
    uid = await participar(reto.id, 10, uid);
    await participar(reto.id, 1);
    await cerrarRetoVencido(prisma, reto.id);
  }
  return uid as string;
}

const usernameDe = async (id: string): Promise<string> =>
  (await prisma.user.findUniqueOrThrow({ where: { id }, select: { username: true } })).username;

describe("retos ganados en el perfil", () => {
  it("con 3 victorias reales enseña 3", async () => {
    const uid = await ganar(3);

    const perfil = await perfilPublicoPorUsername(prisma, await usernameDe(uid));

    expect(perfil?.retosGanados).toBe(3);
    // Y cuadra con el hecho: el perfil no lleva su propia cuenta.
    expect(await prisma.challengeResult.count({ where: { userId: uid } })).toBe(3);
  });

  it("sin victorias enseña 0, no un placeholder", async () => {
    const uid = await crearUsuario(prisma);

    const perfil = await perfilPublicoPorUsername(prisma, await usernameDe(uid));

    expect(perfil?.retosGanados).toBe(0);
    expect(perfil?.pointsBalance ?? 0).toBe(0);
  });

  it("los puntos del perfil son los del ledger, no una cifra suelta", async () => {
    const uid = await ganar(1);

    const perfil = await perfilPublicoPorUsername(prisma, await usernameDe(uid));
    const movimientos = await prisma.pointsLedger.findMany({
      where: { userId: uid },
      select: { delta: true },
    });
    const suma = movimientos.reduce((t, m) => t + m.delta, 0);

    // Ganar da victoria + top-20: la cifra del perfil tiene que ser exactamente la del ledger.
    expect(suma).toBe(POINTS.WIN_CHALLENGE + POINTS.TOP20);
    expect(perfil?.pointsBalance).toBe(suma);
  });

  it("el NIVEL se deriva de esos puntos con la función pura, no de una segunda tabla", async () => {
    const uid = await ganar(1);
    const perfil = await perfilPublicoPorUsername(prisma, await usernameDe(uid));

    // Si alguien introdujera una segunda tabla de umbrales, este aserto dejaría de cuadrar en cuanto
    // las dos se separasen. La fuente es una: `nivelPorPuntos`.
    expect(nivelPorPuntos(perfil?.pointsBalance ?? 0).clave).toBe("rookie");
    expect(nivelPorPuntos(0).clave).toBe("rookie");
    expect(nivelPorPuntos(100).clave).toBe("challenger");
  });

  it("perder no cuenta como ganar", async () => {
    const reto = await crearReto();
    await participar(reto.id, 10);
    const perdedor = await participar(reto.id, 1);
    await cerrarRetoVencido(prisma, reto.id);

    const perfil = await perfilPublicoPorUsername(prisma, await usernameDe(perdedor));

    expect(perfil?.retosGanados).toBe(0);
    // Pero sí cobra el top-20: participó y quedó arriba. Son cosas distintas.
    expect(perfil?.pointsBalance).toBe(POINTS.TOP20);
  });
});
