/**
 * LA SUSCRIPCIÓN VIP CONTRA LA BASE DE DATOS: el chokepoint, el registro desde Stripe y el raíl
 * INERTE.
 *
 * Lo que se fija:
 *  - EL ACCESO SALE DE LA FECHA, también leyéndolo de la tabla: una fila con el periodo vencido no
 *    da VIP por mucho que su estado diga ACTIVA.
 *  - UNA FILA POR PERSONA: resuscribirse actualiza, no duplica. Dos filas serían dos verdades.
 *  - EL PERIODO SE ESCRIBE EN ABSOLUTO: reprocesar el mismo evento deja la MISMA fecha, no un mes
 *    más. Es lo que hace que una reentrega de Stripe no regale VIP.
 *  - LA CONSULTA EN LOTE dice lo mismo que la de uno (y no es una segunda verdad).
 *
 * Para romperlo a propósito: sumar un mes en vez de escribir la fecha (rojo: el caso de la
 * reentrega), o hacer que `vipsActivosEntre` filtre por estado en vez de pasar por `esVipActivo`
 * (rojo: el caso de la CORTADA con periodo por delante).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PLAN_VIP } from "@/config/constants";
import type { PrismaClient } from "../src/generated/prisma/client";
import {
  esVipActivoDe,
  registrarSuscripcion,
  vipDe,
  vipsActivosEntre,
} from "../src/server/services/vip";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

let prisma: PrismaClient;
let userId: string;

const AHORA = new Date("2026-10-15T12:00:00Z");
const EN_UN_MES = new Date("2026-11-15T12:00:00Z");
const HACE_UN_MES = new Date("2026-09-15T12:00:00Z");

beforeAll(() => {
  prisma = createTestPrisma();
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
  userId = await crearUsuario(prisma);
});

const suscribir = (estado: string, periodoFin: Date, quien = "") =>
  registrarSuscripcion(prisma, { userId: quien || userId, estado, periodoFin });

describe("el acceso se lee de la fecha, no del estado", () => {
  it("sin suscripción, no es VIP", async () => {
    expect(await esVipActivoDe(prisma, userId, AHORA)).toBe(false);
  });

  it("con el periodo por delante, sí", async () => {
    await suscribir("ACTIVA", EN_UN_MES);
    expect(await esVipActivoDe(prisma, userId, AHORA)).toBe(true);
  });

  it("CON EL PERIODO VENCIDO, NO — aunque la fila diga ACTIVA", async () => {
    // El caso que un booleano guardado no distingue: la fila se quedó en ACTIVA porque el webhook
    // de baja no llegó, y aun así no hay VIP. Si esto pasa en verde con un flag, el flag está mal.
    await suscribir("ACTIVA", HACE_UN_MES);
    expect(await esVipActivoDe(prisma, userId, AHORA)).toBe(false);
  });

  it("CANCELADA con periodo por delante sigue siendo VIP; CORTADA no", async () => {
    await suscribir("CANCELADA", EN_UN_MES);
    expect(await esVipActivoDe(prisma, userId, AHORA)).toBe(true);

    await suscribir("CORTADA", EN_UN_MES);
    expect(await esVipActivoDe(prisma, userId, AHORA)).toBe(false);
  });

  it("y `vipDe` cuenta lo mismo, con el detalle de la pantalla", async () => {
    await registrarSuscripcion(prisma, {
      userId,
      estado: "CANCELADA",
      periodoFin: EN_UN_MES,
      canceladaEn: AHORA,
    });
    const v = await vipDe(prisma, userId, AHORA);
    expect(v.activo).toBe(true);
    expect(v.terminaAlFinal).toBe(true);
    expect(v.hasta?.toISOString()).toBe(EN_UN_MES.toISOString());
  });
});

describe("una fila por persona", () => {
  it("registrar dos veces actualiza, no duplica", async () => {
    await suscribir("ACTIVA", EN_UN_MES);
    await suscribir("CANCELADA", EN_UN_MES);

    expect(await prisma.subscription.count({ where: { userId } })).toBe(1);
    expect((await prisma.subscription.findUniqueOrThrow({ where: { userId } })).estado).toBe(
      "CANCELADA",
    );
  });

  it("y guarda el plan sin que quien llama tenga que decirlo", async () => {
    await suscribir("ACTIVA", EN_UN_MES);
    expect((await prisma.subscription.findUniqueOrThrow({ where: { userId } })).plan).toBe(
      PLAN_VIP,
    );
  });
});

describe("el periodo se escribe en ABSOLUTO", () => {
  it("reprocesar el mismo evento deja la MISMA fecha, no un mes más", async () => {
    // ┌─ LA REENTREGA DE STRIPE ────────────────────────────────────────────────────────────────┐
    // │ Stripe reenvía un webhook cuando duda de nuestra respuesta. Si el periodo se extendiera  │
    // │ sumando un mes al valor guardado, cada reentrega regalaría otro mes de VIP — y nadie lo  │
    // │ notaría hasta preguntarse por qué alguien lleva año y medio suscrito pagando tres meses. │
    // └──────────────────────────────────────────────────────────────────────────────────────────┘
    await suscribir("ACTIVA", EN_UN_MES);
    await suscribir("ACTIVA", EN_UN_MES);
    await suscribir("ACTIVA", EN_UN_MES);

    const s = await prisma.subscription.findUniqueOrThrow({ where: { userId } });
    expect(s.periodoFin.toISOString()).toBe(EN_UN_MES.toISOString());
  });

  it("y una renovación lo MUEVE hacia delante, que es lo que sí tiene que pasar", async () => {
    await suscribir("ACTIVA", EN_UN_MES);
    const siguiente = new Date("2026-12-15T12:00:00Z");
    await suscribir("ACTIVA", siguiente);

    const s = await prisma.subscription.findUniqueOrThrow({ where: { userId } });
    expect(s.periodoFin.toISOString()).toBe(siguiente.toISOString());
  });
});

describe("la consulta en lote dice lo mismo que la de uno", () => {
  it("devuelve solo a los que de verdad son VIP", async () => {
    const vigente = await crearUsuario(prisma, { username: "la_vigente" });
    const vencida = await crearUsuario(prisma, { username: "la_vencida" });
    const cortada = await crearUsuario(prisma, { username: "la_cortada" });
    const sin = await crearUsuario(prisma, { username: "la_sin_nada" });

    await suscribir("ACTIVA", EN_UN_MES, vigente);
    await suscribir("ACTIVA", HACE_UN_MES, vencida);
    // CORTADA con periodo POR DELANTE: la pasa el filtro de fecha de la consulta y la tiene que
    // tumbar `esVipActivo`. Si el lote filtrara solo por fecha, esta se colaría.
    await suscribir("CORTADA", EN_UN_MES, cortada);

    const vips = await vipsActivosEntre(prisma, [vigente, vencida, cortada, sin], AHORA);

    expect([...vips]).toEqual([vigente]);
    // Y lo mismo que diría preguntando de uno en uno: dos caminos, una sola respuesta.
    for (const id of [vigente, vencida, cortada, sin]) {
      expect(vips.has(id), id).toBe(await esVipActivoDe(prisma, id, AHORA));
    }
  });

  it("con la lista vacía no consulta nada", async () => {
    expect(await vipsActivosEntre(prisma, [], AHORA)).toEqual(new Set());
  });

  it("y un id repetido no la rompe", async () => {
    await suscribir("ACTIVA", EN_UN_MES);
    const vips = await vipsActivosEntre(prisma, [userId, userId, ""], AHORA);
    expect([...vips]).toEqual([userId]);
  });
});
