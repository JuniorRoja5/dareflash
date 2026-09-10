/**
 * HITO DE VÍDEOS: +5 por cada 3 vídeos PUBLICADOS, acumulado de por vida.
 *
 * Lo que estos tests vigilan, por orden de lo que más caro sale romperlo:
 *  - que un vídeo que NO existe para nadie (fallido, en cola) no dé puntos;
 *  - que el hito no se pague dos veces por reintentar;
 *  - que borrar un vídeo no re-arme un hito ya cobrado (sería una fábrica de puntos: publicar,
 *    borrar, publicar).
 *
 * Para romperlos a propósito: quitar el filtro `status: "PUBLISHED"` del recuento; poner el id del
 * vídeo en la clave de idempotencia en vez del número de hito.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { POINTS, RAZON_HITO_VIDEOS, VIDEOS_POR_HITO } from "@/config/constants";
import type { ModerationStatus, PrismaClient } from "../src/generated/prisma/client";
import {
  claveHitoVideos,
  hitosPara,
  otorgarHitosDeVideos,
} from "../src/server/services/hito-videos";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

let prisma: PrismaClient;
let userId: string;
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
  userId = await crearUsuario(prisma);
});

/** Crea un vídeo del usuario en el estado pedido y devuelve su id. */
async function video(estado: ModerationStatus = "PUBLISHED", de = userId): Promise<string> {
  n += 1;
  const v = await prisma.video.create({
    data: { userId: de, bunnyVideoId: `guid-${n}-${Date.now()}`, status: estado },
    select: { id: true },
  });
  return v.id;
}

const puntos = async (de = userId): Promise<number> =>
  (await prisma.user.findUniqueOrThrow({ where: { id: de }, select: { pointsBalance: true } }))
    .pointsBalance;

const movimientos = async (de = userId) =>
  prisma.pointsLedger.findMany({
    where: { userId: de, reason: RAZON_HITO_VIDEOS },
    select: { delta: true, idempotencyKey: true },
  });

describe("cuándo se otorga el hito", () => {
  it("al TERCER vídeo publicado, y una sola vez", async () => {
    for (let i = 0; i < 2; i += 1) {
      await video();
      await otorgarHitosDeVideos(prisma, userId);
      expect(await puntos()).toBe(0); // con 1 y con 2 todavía no
    }

    await video();
    const dados = await otorgarHitosDeVideos(prisma, userId);

    expect(dados).toBe(1);
    expect(await puntos()).toBe(POINTS.VIDEOS_PUBLICADOS_HITO);
    expect(await movimientos()).toHaveLength(1);
  });

  it("el 4º y el 5º no dan nada; el 6º da el segundo hito", async () => {
    for (let i = 0; i < 3; i += 1) await video();
    await otorgarHitosDeVideos(prisma, userId);

    for (const esperado of [1, 1]) {
      await video(); // 4º y 5º
      await otorgarHitosDeVideos(prisma, userId);
      expect(await movimientos()).toHaveLength(esperado);
    }

    await video(); // 6º
    await otorgarHitosDeVideos(prisma, userId);

    expect(await movimientos()).toHaveLength(2);
    expect(await puntos()).toBe(POINTS.VIDEOS_PUBLICADOS_HITO * 2);
  });

  it("un vídeo FALLIDO o en cola NO cuenta hacia el hito", async () => {
    await video("PUBLISHED");
    await video("FAILED");
    await video("PENDING");
    await video("REMOVED");

    await otorgarHitosDeVideos(prisma, userId);

    // Cuatro filas, un solo vídeo real: premiar los otros tres sería premiar algo que nadie ve.
    expect(await prisma.video.count({ where: { userId } })).toBe(4);
    expect(await puntos()).toBe(0);
  });

  it("los vídeos de OTRO usuario no cuentan", async () => {
    const otro = await crearUsuario(prisma);
    for (let i = 0; i < 3; i += 1) await video("PUBLISHED", otro);
    await video("PUBLISHED"); // uno solo mío

    await otorgarHitosDeVideos(prisma, userId);

    expect(await puntos()).toBe(0);
  });
});

describe("idempotencia y monotonía", () => {
  it("re-ejecutar el otorgamiento no suma dos veces", async () => {
    for (let i = 0; i < 3; i += 1) await video();

    for (let i = 0; i < 5; i += 1) await otorgarHitosDeVideos(prisma, userId);

    expect(await movimientos()).toHaveLength(1);
    expect(await puntos()).toBe(POINTS.VIDEOS_PUBLICADOS_HITO);
  });

  it("dos otorgamientos A LA VEZ dan UN solo hito (aquí es donde salva la clave)", async () => {
    // ESTE es el test que le da dientes a la clave de idempotencia. En SERIE no la prueba: la
    // segunda llamada sale antes por el recuento de movimientos ya cobrados, así que `applyPoints`
    // ni se ejecuta. La clave existe para la CARRERA — dos vídeos del mismo usuario confirmados a la
    // vez, ambos leyendo "0 cobrados" antes de que ninguno escriba— y ahí el UNIQUE es lo único que
    // impide pagar el mismo hito dos veces.
    for (let i = 0; i < 3; i += 1) await video();

    await Promise.all([otorgarHitosDeVideos(prisma, userId), otorgarHitosDeVideos(prisma, userId)]);

    expect(await movimientos()).toHaveLength(1);
    expect(await puntos()).toBe(POINTS.VIDEOS_PUBLICADOS_HITO);
  });

  it("publicar, borrar y volver a publicar NO re-arma el hito (no es una fábrica de puntos)", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 3; i += 1) ids.push(await video());
    await otorgarHitosDeVideos(prisma, userId);
    expect(await puntos()).toBe(POINTS.VIDEOS_PUBLICADOS_HITO);

    // El dueño borra uno (queda REMOVED) y sube otro. Vuelve a haber 3 publicados.
    await prisma.video.update({ where: { id: ids[0] as string }, data: { status: "REMOVED" } });
    await otorgarHitosDeVideos(prisma, userId);
    await video();
    await otorgarHitosDeVideos(prisma, userId);

    // Sigue siendo el hito 1: su clave ya está usada. Con la clave por VÍDEO esto valdría el doble.
    expect(await movimientos()).toHaveLength(1);
    expect(await puntos()).toBe(POINTS.VIDEOS_PUBLICADOS_HITO);
  });

  it("borrar un vídeo NO retira los puntos ya dados", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 3; i += 1) ids.push(await video());
    await otorgarHitosDeVideos(prisma, userId);

    for (const id of ids) {
      await prisma.video.update({ where: { id }, data: { status: "REMOVED" } });
    }
    await otorgarHitosDeVideos(prisma, userId);

    // Un hito es un LOGRO alcanzado, no un saldo de vídeos vivos. Y el ledger es de solo inserción.
    expect(await puntos()).toBe(POINTS.VIDEOS_PUBLICADOS_HITO);
  });

  it("un hito PERDIDO se recupera en la siguiente publicación, sin duplicar el ya cobrado", async () => {
    // Simula que el worker murió entre publicar el 6º vídeo y dar sus puntos: hay 6 publicados y
    // solo un hito cobrado. La siguiente publicación tiene que completar el que falta.
    for (let i = 0; i < 6; i += 1) await video();
    await prisma.pointsLedger.deleteMany({ where: { userId } });
    await prisma.user.update({ where: { id: userId }, data: { pointsBalance: 0 } });
    await otorgarHitosDeVideos(prisma, userId);

    expect(await movimientos()).toHaveLength(2);
    expect(await puntos()).toBe(POINTS.VIDEOS_PUBLICADOS_HITO * 2);
  });

  it("la clave lleva el número de HITO, no el del vídeo", async () => {
    for (let i = 0; i < 6; i += 1) await video();
    await otorgarHitosDeVideos(prisma, userId);

    const claves = (await movimientos()).map((m) => m.idempotencyKey).sort();
    expect(claves).toEqual([claveHitoVideos(userId, 1), claveHitoVideos(userId, 2)].sort());
  });
});

describe("hitosPara (pura)", () => {
  it("cuenta hitos completos, nunca a medias", () => {
    expect(hitosPara(0)).toBe(0);
    expect(hitosPara(VIDEOS_POR_HITO - 1)).toBe(0);
    expect(hitosPara(VIDEOS_POR_HITO)).toBe(1);
    expect(hitosPara(VIDEOS_POR_HITO * 2 - 1)).toBe(1);
    expect(hitosPara(VIDEOS_POR_HITO * 2)).toBe(2);
  });

  it("es total: un número absurdo no la rompe", () => {
    expect(hitosPara(-5)).toBe(0);
  });
});
