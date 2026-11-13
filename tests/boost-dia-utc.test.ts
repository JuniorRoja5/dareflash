/**
 * EL DÍA DE BOOST SE CALCULA EN UTC, SE MUESTRE COMO SE MUESTRE LA HORA (Fase 11 · P1).
 *
 * La Fase 11 cambia cómo se DICE la hora del reinicio («a las 09:00» en Tokio, «a las 01:00» en Madrid),
 * nunca cuándo se reinicia: el tope de `BOOST_DAILY_LIMIT` es por día UTC. Si alguien, al llevar la
 * hora local a la pantalla, se llevara también el CÁLCULO del día a la hora local, una persona en
 * UTC+10 tendría dos «días» dentro de un mismo día UTC y podría pasar del tope sin que nada fallara.
 *
 * EL ESCENARIO, con el proceso en `Australia/Brisbane` (UTC+10, sin horario de verano): tres
 * activaciones a las 23:30, 23:40 y 23:50 de Brisbane (13:30–13:50 UTC) y una cuarta a las 00:30 del día
 * siguiente de Brisbane (14:30 UTC). En UTC las cuatro son el MISMO día: la cuarta se rechaza. Con el día
 * local de Brisbane, la cuarta sería «otro día» y pasaría.
 *
 * Para romperlo a propósito: calcular el día de la activación con la hora LOCAL del proceso (p. ej.
 * `new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate())`) en vez de `diaUTC` (rojo).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { falso } from "./helpers/valores-falsos";

import { BOOST_DAILY_LIMIT } from "../src/config/constants";
import type { PrismaClient } from "../src/generated/prisma/client";
import { activarBoost } from "../src/server/services/boost-activacion";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

let prisma: PrismaClient;
let tzAntes: string | undefined;

beforeAll(() => {
  prisma = createTestPrisma();
  // El proceso, en UTC+10. Node vuelve a leer la zona al asignar `process.env.TZ`.
  tzAntes = process.env.TZ;
  process.env.TZ = "Australia/Brisbane";
});
afterAll(async () => {
  if (tzAntes === undefined) delete process.env.TZ;
  else process.env.TZ = tzAntes;
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
});

describe("un usuario en UTC+10 no pasa del tope en un mismo día UTC", () => {
  it("el escenario está bien montado: el proceso está en UTC+10 y la 4ª es «otro día» en local", () => {
    const ultima = new Date("2026-11-13T13:50:00.000Z");
    const cuarta = new Date("2026-11-13T14:30:00.000Z");
    // Si el proceso no estuviera de verdad en UTC+10, este test no probaría nada.
    expect(cuarta.getTimezoneOffset()).toBe(-600);
    expect(ultima.getDate()).toBe(13); // 23:50 del 13 en Brisbane
    expect(cuarta.getDate()).toBe(14); // 00:30 del 14 en Brisbane
    expect(cuarta.getUTCDate()).toBe(ultima.getUTCDate()); // pero el MISMO día UTC
  });

  it(`${BOOST_DAILY_LIMIT} a las 23:30–23:50 de Brisbane y la siguiente a las 00:30 se RECHAZA`, async () => {
    expect(BOOST_DAILY_LIMIT).toBe(3); // el escenario cuenta tres; si cambia el tope, se revisa
    const userId = await crearUsuario(prisma, { username: "en_brisbane", boostBalance: 9 });
    const horas = ["13:30", "13:40", "13:50"];
    for (const [i, h] of horas.entries()) {
      const r = await activarBoost(prisma, {
        userId,
        token: `t${i}`,
        ahora: new Date(`2026-11-13T${h}:00.000Z`),
      });
      expect(r.estado, `la activación de las ${h} UTC`).toBe("activado");
    }

    const cuarta = await activarBoost(prisma, {
      userId,
      token: falso("token-cuarta"),
      ahora: new Date("2026-11-13T14:30:00.000Z"),
    });
    expect(cuarta.estado).toBe("limite");
    const u = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(u.boostBalance).toBe(9 - BOOST_DAILY_LIMIT);
  });

  it("y al día UTC siguiente (las 10:00 de Brisbane del 14, 00:00 UTC) vuelve a poder", async () => {
    const userId = await crearUsuario(prisma, { username: "al_dia_siguiente", boostBalance: 9 });
    for (const [i, h] of ["13:30", "13:40", "13:50"].entries()) {
      await activarBoost(prisma, {
        userId,
        token: `t${i}`,
        ahora: new Date(`2026-11-13T${h}:00Z`),
      });
    }
    const r = await activarBoost(prisma, {
      userId,
      token: falso("token-nuevo-dia"),
      ahora: new Date("2026-11-14T00:00:00.000Z"),
    });
    expect(r.estado).toBe("activado");
  });
});
