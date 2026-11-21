/**
 * LA ZONA GUARDADA SOLO CAMBIA CÓMO SE MUESTRA, NUNCA CÓMO SE CALCULA (Fase 11 · P2, invariante 5).
 *
 * Desde la P2 el usuario tiene una columna `zonaHoraria`. La tentación es evidente —«ya que la tenemos,
 * que su día de Boost empiece a SU medianoche»— y el daño también: en UTC+14 dos «días» caben dentro
 * de un mismo día UTC, y el tope diario de Boost o el «un toque a la misma persona al día» se duplican
 * sin que nada falle. Las claves de día y de mes (Boost, toques, racha, aforo, consumo y métricas de
 * publicidad, ranking mensual, regalo semanal VIP) siguen en UTC.
 *
 * DOS REDES:
 *  1. COMPORTAMIENTO, Boost y toques, con la zona más adelantada que existe GUARDADA en el usuario
 *     (`Pacific/Kiritimati`, UTC+14): lo que pasa a las 23:xx y a las 00:30 de Kiritimati es el MISMO
 *     día UTC, y el tope se aplica igual.
 *  2. CENSO: los ficheros que calculan claves de día o de mes no nombran la zona del usuario ni la de la
 *     petición. Si un día una pieza necesita la zona ahí, es para MOSTRAR, y eso va fuera del cálculo.
 *
 * Para romperlo: calcular el día de la activación de Boost (o la clave del toque) con la zona guardada
 * del usuario en vez de en UTC (rojo la red 1), o importar la zona en uno de esos ficheros (rojo la 2).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { falso } from "./helpers/valores-falsos";

import { BOOST_DAILY_LIMIT } from "../src/config/constants";
import type { PrismaClient } from "../src/generated/prisma/client";
import { activarBoost } from "../src/server/services/boost-activacion";
import { darToque } from "../src/server/services/toque";
import { registrarSuscripcion } from "../src/server/services/vip";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

let prisma: PrismaClient;

/** UTC+14 todo el año: las 10:00 UTC ya son las 00:00 del día siguiente allí. */
const KIRITIMATI = "Pacific/Kiritimati";

beforeAll(() => {
  prisma = createTestPrisma();
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
});

const enKiritimati = async (username: string, extra: { boostBalance?: number } = {}) => {
  const id = await crearUsuario(prisma, { username, ...extra });
  await prisma.user.update({ where: { id }, data: { zonaHoraria: KIRITIMATI } });
  return id;
};

describe("con la zona guardada en UTC+14, el día sigue siendo el UTC", () => {
  it("el escenario está bien montado: 09:50 y 10:30 UTC son días distintos en Kiritimati", () => {
    const dia = (iso: string) =>
      new Intl.DateTimeFormat("en-CA", { timeZone: KIRITIMATI, day: "2-digit" }).format(
        new Date(iso),
      );
    expect(dia("2026-11-13T09:50:00.000Z")).toBe("13");
    expect(dia("2026-11-13T10:30:00.000Z")).toBe("14");
  });

  it(`Boost: ${BOOST_DAILY_LIMIT} a las 23:30–23:50 de Kiritimati y la de las 00:30 se RECHAZA`, async () => {
    expect(BOOST_DAILY_LIMIT).toBe(3);
    const userId = await enKiritimati("boost_kiritimati", { boostBalance: 9 });
    for (const [i, h] of ["09:30", "09:40", "09:50"].entries()) {
      const r = await activarBoost(prisma, {
        userId,
        token: `t${i}`,
        ahora: new Date(`2026-11-13T${h}:00.000Z`),
      });
      expect(r.estado, `la de las ${h} UTC`).toBe("activado");
    }
    const cuarta = await activarBoost(prisma, {
      userId,
      token: falso("token-kiritimati"),
      ahora: new Date("2026-11-13T10:30:00.000Z"),
    });
    expect(cuarta.estado).toBe("limite");
  });

  it("toques: el de las 23:00 y el de las 00:30 de Kiritimati a la misma persona son el MISMO día", async () => {
    const vip = await enKiritimati("vip_kiritimati");
    const otro = await enKiritimati("otro_kiritimati");
    await registrarSuscripcion(prisma, {
      userId: vip,
      estado: "ACTIVA",
      periodoFin: new Date("2026-12-31T00:00:00.000Z"),
    });
    const primero = await darToque(prisma, {
      emisorId: vip,
      receptorId: otro,
      ahora: new Date("2026-11-13T09:00:00.000Z"),
    });
    expect(primero.estado).toBe("enviado");
    const segundo = await darToque(prisma, {
      emisorId: vip,
      receptorId: otro,
      ahora: new Date("2026-11-13T10:30:00.000Z"),
    });
    expect(segundo.estado).toBe("repetido");
    expect(await prisma.notification.count({ where: { userId: otro, tipo: "TOQUE" } })).toBe(1);
  });
});

describe("censo: lo que calcula días y meses no lee la zona del usuario", () => {
  const SRC = path.join(process.cwd(), "src");
  const CALCULAN_DIAS = [
    "server/services/boost-activacion.ts",
    "server/services/toque.ts",
    "server/services/racha.ts",
    "server/services/aforo.ts",
    "server/services/publicidad-cobro.ts",
    "server/services/publicidad-consumo.ts",
    "server/services/publicidad-metricas.ts",
    "server/services/ranking.ts",
    "server/services/vip-boost-semanal.ts",
    "server/services/vip.ts",
    "lib/racha.ts",
    "lib/publicidad.ts",
    "lib/serie-diaria.ts",
  ];

  it.each(CALCULAN_DIAS)("%s no nombra la zona del usuario ni la de la petición", (rel) => {
    const codigo = readFileSync(path.join(SRC, rel), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(codigo).not.toMatch(
      /zonaHoraria|ZonaHoraria|zonaDeLaPeticion|formato-peticion|zona-espectador|zonaParaGuardar/,
    );
  });
});
