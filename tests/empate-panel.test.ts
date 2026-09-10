/**
 * RESOLUCIÓN DE EMPATE: el admin ROMPE el empate, no ANULA los votos.
 *
 * Un empate en la línea del premio deja el reto cerrado y sin repartir, esperando decisión. Que la
 * decisión sea de una persona no significa que pueda decidir cualquier cosa: sin la guarda de estos
 * tests bastaba enviar el id de una participación con menos votos para coronarla campeona, o
 * reordenar a quien ya había ganado limpiamente por arriba. Es una acción con dinero detrás.
 *
 * Para romperlos a propósito:
 *  - quitar `validarResolucionEmpate` de `resolverEmpate` -> cae media suite;
 *  - dejar que la ruta responda ok ante un rechazo -> caen los de la ruta;
 *  - listar todos los cerrados en vez de los `EMPATE_PENDIENTE` -> cae el de la bandeja.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { POINTS } from "@/config/constants";
import type { PrismaClient } from "../src/generated/prisma/client";
import { analizarEmpate, validarResolucionEmpate } from "../src/lib/cierre-reto";
import { estadoRetoAdmin } from "../src/lib/estado-reto";
import {
  cerrarRetoVencido,
  empatePendienteDe,
  listarEmpatesPendientes,
  resolverEmpate,
} from "../src/server/services/cierre-reto";
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

async function crearReto(winnersCount = 1) {
  n += 1;
  return prisma.challenge.create({
    data: {
      title: `Reto ${n}`,
      slug: `reto-${n}`,
      publicCode: generarPublicCode(),
      category: "fitness",
      status: "PUBLISHED",
      prizeCurrency: "USD",
      prizeAmountCents: 5000,
      winnersCount,
      startsAt: new Date(Date.now() - 86_400_000),
      deadline: new Date(Date.now() - 3_600_000),
      createdById: adminId,
    },
    select: { id: true },
  });
}

async function participar(challengeId: string, votos: number, publicada = true) {
  const userId = await crearUsuario(prisma);
  n += 1;
  const video = await prisma.video.create({
    data: {
      userId,
      bunnyVideoId: `guid-${n}-${Date.now()}`,
      status: publicada ? "PUBLISHED" : "PENDING",
    },
    select: { id: true },
  });
  const sub = await prisma.submission.create({
    data: {
      challengeId,
      userId,
      videoId: video.id,
      status: publicada ? "PUBLISHED" : "PENDING",
      voteCount: votos,
    },
    select: { id: true },
  });
  return { userId, submissionId: sub.id };
}

const puntosDe = async (userId: string): Promise<number> =>
  (await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { pointsBalance: true } }))
    .pointsBalance;

/** Reto con 1 plaza y dos empatados a 7. El caso real: `winnersCount` 1, que es el de hoy. */
async function retoEmpatado() {
  const reto = await crearReto(1);
  const a = await participar(reto.id, 7);
  const b = await participar(reto.id, 7);
  const perdedor = await participar(reto.id, 1);
  await cerrarRetoVencido(prisma, reto.id);
  return { reto, a, b, perdedor };
}

describe("el admin solo puede ordenar DENTRO del grupo empatado", () => {
  it("promover a alguien con MENOS votos se rechaza", async () => {
    const { reto, perdedor } = await retoEmpatado();

    const r = await resolverEmpate(prisma, reto.id, [perdedor.submissionId]);

    // Sin esta guarda, un id en el cuerpo de la petición bastaba para coronar a quien perdió.
    expect(r.resuelto).toBe(false);
    expect(r.rechazo).toBe("FUERA_DEL_GRUPO");
    expect(await prisma.challengeResult.count({ where: { challengeId: reto.id } })).toBe(0);
    expect(await puntosDe(perdedor.userId)).toBe(0);
  });

  it("tocar a un ganador LIMPIO de arriba se rechaza, y se distingue del caso anterior", async () => {
    // 2 plazas: el primero gana limpio (10 votos) y el empate está entre el 2º y el 3º.
    const reto = await crearReto(2);
    const limpio = await participar(reto.id, 10);
    const a = await participar(reto.id, 4);
    await participar(reto.id, 4);
    await cerrarRetoVencido(prisma, reto.id);

    const r = await resolverEmpate(prisma, reto.id, [limpio.submissionId]);

    expect(r.resuelto).toBe(false);
    // Es un error DISTINTO de "no estaba empatado": el limpio sí ganó, lo que no se puede es moverlo.
    expect(r.rechazo).toBe("LIMPIOS_ALTERADOS");
    expect(await prisma.challengeResult.count({ where: { challengeId: reto.id } })).toBe(0);
    // Y con la elección correcta sí sale, conservando el limpio en el rank 1.
    const ok = await resolverEmpate(prisma, reto.id, [a.submissionId]);
    expect(ok.resuelto).toBe(true);
    const filas = await prisma.challengeResult.findMany({
      where: { challengeId: reto.id },
      orderBy: { rank: "asc" },
      select: { rank: true, userId: true },
    });
    expect(filas).toEqual([
      { rank: 1, userId: limpio.userId },
      { rank: 2, userId: a.userId },
    ]);
  });

  it("elegir menos (o más) de las plazas que hay se rechaza", async () => {
    const { reto, a, b } = await retoEmpatado();

    expect((await resolverEmpate(prisma, reto.id, [])).rechazo).toBe("CANTIDAD");
    expect((await resolverEmpate(prisma, reto.id, [a.submissionId, b.submissionId])).rechazo).toBe(
      "CANTIDAD",
    );
    expect(await prisma.challengeResult.count({ where: { challengeId: reto.id } })).toBe(0);
  });

  it("una participación de OTRO reto o no publicada se rechaza", async () => {
    const { reto } = await retoEmpatado();
    const otro = await crearReto(1);
    const ajena = await participar(otro.id, 99);
    const enCola = await participar(reto.id, 7, false);

    expect((await resolverEmpate(prisma, reto.id, [ajena.submissionId])).rechazo).toBe(
      "FUERA_DEL_GRUPO",
    );
    // Aunque tenga los MISMOS votos que los empatados: no cuenta, así que no puede ganar.
    expect((await resolverEmpate(prisma, reto.id, [enCola.submissionId])).rechazo).toBe(
      "FUERA_DEL_GRUPO",
    );
    expect(await prisma.challengeResult.count({ where: { challengeId: reto.id } })).toBe(0);
  });

  it("repetir la misma participación se rechaza", async () => {
    const reto = await crearReto(2);
    await participar(reto.id, 9);
    const a = await participar(reto.id, 4);
    await participar(reto.id, 4);
    await participar(reto.id, 4);
    await cerrarRetoVencido(prisma, reto.id);
    // Con 2 plazas y el 1º limpio... en realidad aquí el empate empieza en la plaza 2, así que hay 1
    // plaza en disputa. Se fuerza el caso pidiendo dos veces la misma para un reto con 2 en disputa.
    const reto2 = await crearReto(2);
    const x = await participar(reto2.id, 4);
    await participar(reto2.id, 4);
    await participar(reto2.id, 4);
    await cerrarRetoVencido(prisma, reto2.id);

    const r = await resolverEmpate(prisma, reto2.id, [x.submissionId, x.submissionId]);
    expect(r.rechazo).toBe("REPETIDA");
    expect(a).toBeDefined();
  });
});

describe("resolver de verdad", () => {
  it("escribe el ganador, pasa a CON_GANADORES y otorga los puntos", async () => {
    const { reto, a, b } = await retoEmpatado();

    const r = await resolverEmpate(prisma, reto.id, [a.submissionId]);

    expect(r).toEqual({ resuelto: true, rechazo: null, ganadores: 1 });
    const fila = await prisma.challengeResult.findFirstOrThrow({ where: { challengeId: reto.id } });
    expect(fila.userId).toBe(a.userId);
    expect(fila.rank).toBe(1);
    // Premio congelado íntegro en el rank 1: resolver no inventa reparto.
    expect(fila.prizeAmountCents).toBe(5000);
    const c = await prisma.challenge.findUniqueOrThrow({ where: { id: reto.id } });
    expect(c.motivoCierre).toBe("CON_GANADORES");
    // El ganador cobra victoria + top-20; el otro empatado, solo el top-20 (participó y quedó arriba).
    expect(await puntosDe(a.userId)).toBe(POINTS.WIN_CHALLENGE + POINTS.TOP20);
    expect(await puntosDe(b.userId)).toBe(POINTS.TOP20);
  });

  it("reenviar NO paga dos veces ni reescribe el resultado", async () => {
    const { reto, a, b } = await retoEmpatado();
    await resolverEmpate(prisma, reto.id, [a.submissionId]);

    // Segundo intento, y encima cambiando de ganador: el reto ya no espera nada.
    const segunda = await resolverEmpate(prisma, reto.id, [b.submissionId]);

    expect(segunda.resuelto).toBe(false);
    expect(segunda.rechazo).toBe("NO_ESPERA");
    const filas = await prisma.challengeResult.findMany({ where: { challengeId: reto.id } });
    expect(filas).toHaveLength(1);
    expect(filas[0]?.userId).toBe(a.userId);
    expect(await puntosDe(a.userId)).toBe(POINTS.WIN_CHALLENGE + POINTS.TOP20);
    expect(await prisma.pointsLedger.count({ where: { userId: a.userId } })).toBe(2);
  });

  it("un reto que nunca estuvo en empate no se puede 'resolver'", async () => {
    const reto = await crearReto(1);
    const ganador = await participar(reto.id, 9);
    const otro = await participar(reto.id, 1);
    await cerrarRetoVencido(prisma, reto.id);

    const r = await resolverEmpate(prisma, reto.id, [otro.submissionId]);

    expect(r.rechazo).toBe("NO_ESPERA");
    const fila = await prisma.challengeResult.findFirstOrThrow({ where: { challengeId: reto.id } });
    expect(fila.userId).toBe(ganador.userId);
  });
});

describe("lo que ve el panel", () => {
  it("la bandeja lista EXACTAMENTE los que esperan decisión, no todos los cerrados", async () => {
    const empatado = await retoEmpatado();
    // Un reto cerrado con ganador claro y otro cerrado sin mínimo: ninguno espera nada.
    const claro = await crearReto(1);
    await participar(claro.id, 9);
    await participar(claro.id, 2);
    await cerrarRetoVencido(prisma, claro.id);
    const vacio = await crearReto(1);
    await cerrarRetoVencido(prisma, vacio.id);

    const bandeja = await listarEmpatesPendientes(prisma);

    expect(bandeja.map((e) => e.challengeId)).toEqual([empatado.reto.id]);
    expect(bandeja[0]?.plazas).toBe(1);
    expect(bandeja[0]?.limpios).toBe(0);
    expect(bandeja[0]?.empatados).toHaveLength(2);
  });

  it("un reto YA resuelto no vuelve a la bandeja aunque hoy parezca empatado", async () => {
    // ESTE es el caso que le da dientes al filtro por `motivoCierre`. Sin él —listando todos los
    // CLOSED y fiándose solo de recalcular el empate— basta con que el resultado cambie DESPUÉS del
    // cierre para que un reto ya resuelto reaparezca pidiendo una decisión. Y esa decisión siempre
    // fallaría (`NO_ESPERA`), así que el panel ofrecería un botón que no puede funcionar.
    const reto = await crearReto(1);
    const ganador = await participar(reto.id, 9);
    const a = await participar(reto.id, 4);
    const b = await participar(reto.id, 4);
    await cerrarRetoVencido(prisma, reto.id);
    expect(await prisma.challengeResult.count({ where: { challengeId: reto.id } })).toBe(1);

    // Moderación retira al ganador DESPUÉS del cierre: ahora los dos que quedan empatan a 4.
    await prisma.submission.update({
      where: { id: ganador.submissionId },
      data: { status: "REMOVED", retiradaMotivo: "MODERACION", retiradaEn: new Date() },
    });

    expect(await listarEmpatesPendientes(prisma)).toEqual([]);
    expect(await empatePendienteDe(prisma, reto.id)).toBeNull();
    expect(a.submissionId).not.toBe(b.submissionId);
  });

  it("la ficha da el grupo en disputa, y nada si no hay empate", async () => {
    const { reto, a, b, perdedor } = await retoEmpatado();

    const pendiente = await empatePendienteDe(prisma, reto.id);
    expect(pendiente?.empatados.sort()).toEqual([a.submissionId, b.submissionId].sort());
    // El perdedor NO se ofrece para elegir: si apareciera, la UI invitaría a un rechazo del servidor.
    expect(pendiente?.empatados).not.toContain(perdedor.submissionId);

    await resolverEmpate(prisma, reto.id, [a.submissionId]);
    expect(await empatePendienteDe(prisma, reto.id)).toBeNull();
  });

  it("la lista del panel NO pinta 'Cerrado' a un reto que espera decisión", async () => {
    // Pintarlos igual dejaba la tarea invisible y el reto se quedaba atascado en silencio.
    const base = {
      status: "CLOSED",
      startsAt: new Date(0),
      deadline: new Date(0),
      eliminacionProgramadaEn: null,
      deletedAt: null,
    };
    expect(estadoRetoAdmin({ ...base, motivoCierre: "EMPATE_PENDIENTE" })).toBe("empate-pendiente");
    expect(estadoRetoAdmin({ ...base, motivoCierre: "CON_GANADORES" })).toBe("cerrado");
    expect(estadoRetoAdmin({ ...base, motivoCierre: null })).toBe("cerrado");
  });
});

/** La guarda, sin base de datos: los casos frontera se leen mejor aquí. */
describe("validarResolucionEmpate (pura)", () => {
  const p = (id: string, votos: number, ms = 0) => ({
    submissionId: id,
    userId: `u-${id}`,
    voteCount: votos,
    createdAt: new Date(ms),
  });

  it("el grupo empatado incluye a los de FUERA del corte que empatan con los de dentro", () => {
    // Si el grupo se cortara en `winnersCount`, el de fuera no sería elegible y el empate no tendría
    // sentido: es precisamente él quien lo provoca.
    const e = analizarEmpate({
      participaciones: [p("a", 9), p("b", 5), p("c", 5), p("d", 5), p("e", 1)],
      winnersCount: 2,
    });
    expect(e?.limpios.map((x) => x.submissionId)).toEqual(["a"]);
    expect(e?.empatados.map((x) => x.submissionId).sort()).toEqual(["b", "c", "d"]);
    expect(e?.plazas).toBe(1);
  });

  it("sin empate en el corte no hay nada que resolver", () => {
    expect(analizarEmpate({ participaciones: [p("a", 9), p("b", 5)], winnersCount: 1 })).toBeNull();
  });

  it("con varias plazas en disputa, el orden elegido se respeta tras los limpios", () => {
    const r = validarResolucionEmpate({
      participaciones: [p("a", 9), p("b", 5), p("c", 5), p("d", 5)],
      winnersCount: 3,
      elegidas: ["d", "b"],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ganadores).toEqual([
      { submissionId: "a", userId: "u-a", rank: 1 },
      { submissionId: "d", userId: "u-d", rank: 2 },
      { submissionId: "b", userId: "u-b", rank: 3 },
    ]);
  });

  it("un empate que llega hasta arriba no deja ningún limpio", () => {
    const e = analizarEmpate({ participaciones: [p("a", 5), p("b", 5)], winnersCount: 1 });
    expect(e?.limpios).toEqual([]);
    expect(e?.plazas).toBe(1);
  });
});
