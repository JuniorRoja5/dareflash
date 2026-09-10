/**
 * CIERRE DE RETO (Fase 4): el reto vencido produce ganadores, puntos y nada más.
 *
 * Estos tests EJECUTAN la ruta real (`cerrarRetoVencido` / `cerrarRetosVencidos`) contra la base de
 * datos. Ninguno escribe `ChallengeResult` a mano: si el cierre no lo produce, no existe — que es la
 * única forma de que el test diga algo sobre el cierre y no sobre sí mismo.
 *
 * Para romperlos a propósito, que es la comprobación de verdad:
 *  - quitar `video: { is: { status: "PUBLISHED" } }` del filtro -> cuentan vídeos en cola y fallidos;
 *  - quitar la guarda `closedAt: null` del `updateMany` -> el cierre deja de ser idempotente;
 *  - quitar `premiadosEn` del barrido -> un cierre interrumpido no se repara nunca;
 *  - decidir el empate por `createdAt` -> se otorga un premio que nadie ha decidido.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { POINTS } from "@/config/constants";
import type { PrismaClient } from "../src/generated/prisma/client";
import {
  decidirCierre,
  top20DeParticipaciones,
  type ParticipacionCierre,
} from "../src/lib/cierre-reto";
import {
  cerrarRetosVencidos,
  cerrarRetoVencido,
  resolverEmpate,
} from "../src/server/services/cierre-reto";
import { generarPublicCode } from "../src/server/services/reto-codigo";
import { publicarParticipacionSiProcede } from "../src/server/services/participacion";

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

const HACE_UNA_HORA = () => new Date(Date.now() - 3_600_000);

async function crearReto(
  opts: { winnersCount?: number; minParticipaciones?: number; premio?: number } = {},
) {
  n += 1;
  return prisma.challenge.create({
    data: {
      title: `Reto ${n}`,
      slug: `reto-${n}`,
      publicCode: generarPublicCode(),
      category: "fitness",
      status: "PUBLISHED",
      prizeCurrency: "USD",
      prizeAmountCents: opts.premio ?? 5000,
      winnersCount: opts.winnersCount ?? 1,
      ...(opts.minParticipaciones === undefined
        ? {}
        : { minParticipaciones: opts.minParticipaciones }),
      startsAt: new Date(Date.now() - 86_400_000),
      // Ya VENCIDO: el cierre lo dispara el reloj, así que un reto de prueba nace pasado de plazo.
      deadline: HACE_UNA_HORA(),
      createdById: adminId,
    },
    select: { id: true },
  });
}

/**
 * Crea una participación con el estado que se quiera para su vídeo. `votos` va al `voteCount`
 * denormalizado, que es lo que ordena el cierre.
 */
async function participar(
  challengeId: string,
  opts: {
    votos?: number;
    videoEstado?: "PUBLISHED" | "PENDING" | "FAILED" | "REMOVED";
    subEstado?: "PUBLISHED" | "PENDING" | "REMOVED";
    creado?: Date;
  } = {},
) {
  const userId = await crearUsuario(prisma);
  n += 1;
  const video = await prisma.video.create({
    data: {
      userId,
      bunnyVideoId: `guid-${n}-${Date.now()}`,
      status: opts.videoEstado ?? "PUBLISHED",
    },
    select: { id: true },
  });
  const sub = await prisma.submission.create({
    data: {
      challengeId,
      userId,
      videoId: video.id,
      status: opts.subEstado ?? "PUBLISHED",
      voteCount: opts.votos ?? 0,
      ...(opts.creado ? { createdAt: opts.creado } : {}),
    },
    select: { id: true },
  });
  return { userId, videoId: video.id, submissionId: sub.id };
}

const puntosDe = async (userId: string): Promise<number> =>
  (await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { pointsBalance: true } }))
    .pointsBalance;

const ledgerDe = async (userId: string) =>
  prisma.pointsLedger.findMany({ where: { userId }, select: { delta: true, reason: true } });

describe("qué participaciones CUENTAN", () => {
  it("solo las que están publicadas de verdad: Submission Y vídeo", async () => {
    const reto = await crearReto();
    const buena = await participar(reto.id, { votos: 10 });
    const enCola = await participar(reto.id, { votos: 99, videoEstado: "PENDING" });
    const fallida = await participar(reto.id, { votos: 98, videoEstado: "FAILED" });
    const retirada = await participar(reto.id, { votos: 97, subEstado: "REMOVED" });

    await cerrarRetoVencido(prisma, reto.id);

    const filas = await prisma.challengeResult.findMany({ where: { challengeId: reto.id } });
    // Las tres descartadas tienen MÁS votos que la buena a propósito: si el filtro fallara, ganarían
    // ellas y el fallo sería inmediato en vez de silencioso.
    expect(filas.map((f) => f.userId)).toEqual([buena.userId]);
    for (const fuera of [enCola, fallida, retirada]) {
      expect(await puntosDe(fuera.userId)).toBe(0);
      expect(await ledgerDe(fuera.userId)).toEqual([]);
    }
  });

  it("en cola y fallida se tratan IGUAL: ninguna de las dos cuenta", async () => {
    // El encargo lo pide sin ramas ni caso especial. Si alguien metiera una excepción para una de
    // ellas, estos dos cierres dejarían de parecerse.
    const a = await crearReto();
    await participar(a.id, { votos: 5, videoEstado: "PENDING" });
    const b = await crearReto();
    await participar(b.id, { votos: 5, videoEstado: "FAILED" });

    const ra = await cerrarRetoVencido(prisma, a.id);
    const rb = await cerrarRetoVencido(prisma, b.id);

    expect(ra.motivo).toBe(rb.motivo);
    expect(ra.ganadores).toBe(0);
    expect(rb.ganadores).toBe(0);
  });
});

describe("idempotencia y re-entrancia", () => {
  it("cerrar DOS veces deja un solo resultado y unos solos puntos", async () => {
    const reto = await crearReto();
    const ganador = await participar(reto.id, { votos: 3 });

    const primera = await cerrarRetoVencido(prisma, reto.id);
    const segunda = await cerrarRetoVencido(prisma, reto.id);

    expect(primera.cerradoAhora).toBe(true);
    expect(segunda.cerradoAhora).toBe(false);
    expect(await prisma.challengeResult.count({ where: { challengeId: reto.id } })).toBe(1);
    // El saldo cuadra con la suma del ledger: la garantía contable, no solo "no se duplicó".
    const movimientos = await ledgerDe(ganador.userId);
    expect(movimientos).toHaveLength(2); // WIN_CHALLENGE + TOP20
    const suma = movimientos.reduce((t, m) => t + m.delta, 0);
    expect(await puntosDe(ganador.userId)).toBe(suma);
    expect(suma).toBe(POINTS.WIN_CHALLENGE + POINTS.TOP20);
  });

  it("dos cierres A LA VEZ: solo uno gana, y el reto se cierra una sola vez", async () => {
    // ESTE es el test que le da dientes a la guarda `closedAt: null` del UPDATE. Llamar dos veces en
    // SERIE no la prueba: la segunda llamada sale antes por la comprobación de "ya cerrado y premiado".
    // La guarda existe para la carrera —dos workers, o un barrido lento y el tick siguiente—, donde
    // ambas ejecuciones leen `closedAt` a NULL antes de que ninguna escriba. Sin ella, las dos
    // escribirían el cierre y podrían duplicar resultados.
    const reto = await crearReto();
    const ganador = await participar(reto.id, { votos: 3 });

    const [a, b] = await Promise.all([
      cerrarRetoVencido(prisma, reto.id),
      cerrarRetoVencido(prisma, reto.id),
    ]);

    expect([a.cerradoAhora, b.cerradoAhora].filter(Boolean)).toHaveLength(1);
    expect(await prisma.challengeResult.count({ where: { challengeId: reto.id } })).toBe(1);
    const movimientos = await ledgerDe(ganador.userId);
    expect(movimientos).toHaveLength(2);
    expect(await puntosDe(ganador.userId)).toBe(POINTS.WIN_CHALLENGE + POINTS.TOP20);
  });

  it("un cierre interrumpido tras el HECHO se repara solo en el barrido siguiente", async () => {
    const reto = await crearReto();
    const ganador = await participar(reto.id, { votos: 3 });

    // Se simula la caída EXACTA que preocupa: el hecho quedó escrito y los premios no. Es el estado
    // real que deja morir el proceso entre la transacción y la proyección.
    await cerrarRetoVencido(prisma, reto.id);
    await prisma.pointsLedger.deleteMany({ where: { userId: ganador.userId } });
    await prisma.user.update({ where: { id: ganador.userId }, data: { pointsBalance: 0 } });
    await prisma.challenge.update({ where: { id: reto.id }, data: { premiadosEn: null } });

    // El barrido tiene que VOLVER a cogerlo aunque ya esté cerrado. Sin eso, la re-entrancia sería
    // cierta llamando a mano a la función y falsa en producción.
    const barrido = await cerrarRetosVencidos(prisma);

    expect(barrido.revisados).toBe(1);
    expect(await puntosDe(ganador.userId)).toBe(POINTS.WIN_CHALLENGE + POINTS.TOP20);
    expect(await prisma.challengeResult.count({ where: { challengeId: reto.id } })).toBe(1);
  });

  it("y una vez premiado, el barrido ya no lo toca", async () => {
    const reto = await crearReto();
    await participar(reto.id, { votos: 1 });
    await cerrarRetoVencido(prisma, reto.id);

    // Si siguiera cogiéndolo, recalcularía el top-20 en cada vuelta para siempre.
    expect((await cerrarRetosVencidos(prisma)).revisados).toBe(0);
  });
});

describe("empate en la línea del premio", () => {
  it("no lo decide el sistema: cierra EMPATE_PENDIENTE, sin ganador y sin puntos", async () => {
    const reto = await crearReto({ winnersCount: 1 });
    const a = await participar(reto.id, { votos: 7, creado: new Date(Date.now() - 10_000) });
    const b = await participar(reto.id, { votos: 7, creado: new Date() });

    const r = await cerrarRetoVencido(prisma, reto.id);

    expect(r.motivo).toBe("EMPATE_PENDIENTE");
    expect(await prisma.challengeResult.count({ where: { challengeId: reto.id } })).toBe(0);
    // Ni siquiera el top-20: un cierre sin resultado válido no reparte NADA.
    expect(await puntosDe(a.userId)).toBe(0);
    expect(await puntosDe(b.userId)).toBe(0);
    // Y el reto SÍ queda cerrado: el empate no lo deja abierto para siempre.
    const c = await prisma.challenge.findUniqueOrThrow({ where: { id: reto.id } });
    expect(c.status).toBe("CLOSED");
    expect(c.closedAt).toBeInstanceOf(Date);
  });

  it("cuando el admin resuelve, ENTONCES se otorga, por el mismo camino", async () => {
    const reto = await crearReto({ winnersCount: 1 });
    const a = await participar(reto.id, { votos: 7 });
    await participar(reto.id, { votos: 7 });
    await cerrarRetoVencido(prisma, reto.id);

    const res = await resolverEmpate(prisma, reto.id, [a.submissionId]);

    expect(res).toEqual({ resuelto: true, ganadores: 1 });
    const fila = await prisma.challengeResult.findFirstOrThrow({ where: { challengeId: reto.id } });
    expect(fila.userId).toBe(a.userId);
    expect(fila.rank).toBe(1);
    expect(await puntosDe(a.userId)).toBe(POINTS.WIN_CHALLENGE + POINTS.TOP20);
    const c = await prisma.challenge.findUniqueOrThrow({ where: { id: reto.id } });
    expect(c.motivoCierre).toBe("CON_GANADORES");
  });

  it("resolver no es una puerta trasera: no reescribe un reto que ya tenía ganador", async () => {
    const reto = await crearReto({ winnersCount: 1 });
    const ganador = await participar(reto.id, { votos: 9 });
    const otro = await participar(reto.id, { votos: 1 });
    await cerrarRetoVencido(prisma, reto.id);

    expect(await resolverEmpate(prisma, reto.id, [otro.submissionId])).toEqual({
      resuelto: false,
      ganadores: 0,
    });
    const fila = await prisma.challengeResult.findFirstOrThrow({ where: { challengeId: reto.id } });
    expect(fila.userId).toBe(ganador.userId);
  });

  it("un empate FUERA de la línea de corte no bloquea nada", async () => {
    // Empatan el 2º y el 3º con winnersCount=1: el premio no está en disputa, así que el cierre sigue.
    const reto = await crearReto({ winnersCount: 1 });
    const primero = await participar(reto.id, { votos: 10 });
    await participar(reto.id, { votos: 4 });
    await participar(reto.id, { votos: 4 });

    const r = await cerrarRetoVencido(prisma, reto.id);

    expect(r.motivo).toBe("CON_GANADORES");
    expect(await puntosDe(primero.userId)).toBe(POINTS.WIN_CHALLENGE + POINTS.TOP20);
  });
});

describe("mínimo de participaciones", () => {
  it("por debajo del mínimo: cierra SIN_MINIMO, sin resultado, sin premio y sin puntos", async () => {
    const reto = await crearReto({ minParticipaciones: 3 });
    const a = await participar(reto.id, { votos: 5 });
    const b = await participar(reto.id, { votos: 4 });

    const r = await cerrarRetoVencido(prisma, reto.id);

    expect(r.motivo).toBe("SIN_MINIMO");
    expect(await prisma.challengeResult.count({ where: { challengeId: reto.id } })).toBe(0);
    expect(await puntosDe(a.userId)).toBe(0);
    expect(await puntosDe(b.userId)).toBe(0);
    expect((await prisma.challenge.findUniqueOrThrow({ where: { id: reto.id } })).status).toBe(
      "CLOSED",
    );
  });

  it("el mínimo se mide sobre las que CUENTAN, no sobre las filas que hay", async () => {
    // Tres participaciones, pero solo dos publicadas de verdad. Contar filas daría 3 y declararía
    // ganador; contar las que cuentan da 2 y no llega.
    const reto = await crearReto({ minParticipaciones: 3 });
    await participar(reto.id, { votos: 5 });
    await participar(reto.id, { votos: 4 });
    await participar(reto.id, { votos: 3, videoEstado: "PENDING" });

    expect((await cerrarRetoVencido(prisma, reto.id)).motivo).toBe("SIN_MINIMO");
  });

  it("sin participaciones que cuenten tampoco hay ganador", async () => {
    const reto = await crearReto();
    await participar(reto.id, { votos: 9, videoEstado: "PENDING" });

    const r = await cerrarRetoVencido(prisma, reto.id);

    expect(r.ganadores).toBe(0);
    expect(r.motivo).toBe("SIN_MINIMO");
  });
});

describe("premio y puntos", () => {
  it("el premio se CONGELA: editar el del reto después no cambia lo otorgado", async () => {
    const reto = await crearReto({ premio: 5000 });
    await participar(reto.id, { votos: 2 });
    await cerrarRetoVencido(prisma, reto.id);

    await prisma.challenge.update({ where: { id: reto.id }, data: { prizeAmountCents: 999_999 } });

    const fila = await prisma.challengeResult.findFirstOrThrow({ where: { challengeId: reto.id } });
    expect(fila.prizeAmountCents).toBe(5000);
    expect(fila.currency).toBe("USD");
  });

  it("con varios ganadores el importe va ÍNTEGRO al rank 1 y 0 al resto (no se inventa reparto)", async () => {
    const reto = await crearReto({ winnersCount: 3, premio: 9000 });
    await participar(reto.id, { votos: 10 });
    await participar(reto.id, { votos: 8 });
    await participar(reto.id, { votos: 6 });

    await cerrarRetoVencido(prisma, reto.id);

    const filas = await prisma.challengeResult.findMany({
      where: { challengeId: reto.id },
      orderBy: { rank: "asc" },
      select: { rank: true, prizeAmountCents: true },
    });
    expect(filas).toEqual([
      { rank: 1, prizeAmountCents: 9000 },
      { rank: 2, prizeAmountCents: 0 },
      { rank: 3, prizeAmountCents: 0 },
    ]);
  });

  it("el cierre NO mueve dinero: esta pieza registra lo debido, no paga", async () => {
    const reto = await crearReto();
    const ganador = await participar(reto.id, { votos: 2 });
    await cerrarRetoVencido(prisma, reto.id);

    expect(await prisma.walletLedger.count({ where: { userId: ganador.userId } })).toBe(0);
    expect(
      (
        await prisma.user.findUniqueOrThrow({
          where: { id: ganador.userId },
          select: { walletBalanceCents: true },
        })
      ).walletBalanceCents,
    ).toBe(0);
  });

  it("ganar y estar en el top-20 son DOS razones: dos filas de ledger, no una", async () => {
    const reto = await crearReto();
    const ganador = await participar(reto.id, { votos: 5 });

    await cerrarRetoVencido(prisma, reto.id);

    const filas = await ledgerDe(ganador.userId);
    expect(filas.map((f) => f.reason).sort()).toEqual(["TOP20", "WIN_CHALLENGE"]);
    expect(filas.find((f) => f.reason === "WIN_CHALLENGE")?.delta).toBe(POINTS.WIN_CHALLENGE);
    expect(filas.find((f) => f.reason === "TOP20")?.delta).toBe(POINTS.TOP20);
  });

  it("los declarados ganadores cobran los 30, todos ellos", async () => {
    const reto = await crearReto({ winnersCount: 3 });
    const p1 = await participar(reto.id, { votos: 10 });
    const p2 = await participar(reto.id, { votos: 8 });
    const p3 = await participar(reto.id, { votos: 6 });
    const cuarto = await participar(reto.id, { votos: 1 });

    await cerrarRetoVencido(prisma, reto.id);

    for (const g of [p1, p2, p3]) {
      expect(await puntosDe(g.userId)).toBe(POINTS.WIN_CHALLENGE + POINTS.TOP20);
    }
    // El cuarto no ganó, pero SÍ está en el top-20: cobra solo esos 10.
    expect(await puntosDe(cuarto.userId)).toBe(POINTS.TOP20);
  });

  it("top-20 con menos de 20 participaciones premia a las que hay, sin petar", async () => {
    const reto = await crearReto();
    const gente = [];
    for (let i = 0; i < 3; i += 1) gente.push(await participar(reto.id, { votos: 10 - i }));

    await cerrarRetoVencido(prisma, reto.id);

    for (const g of gente) expect(await puntosDe(g.userId)).toBeGreaterThanOrEqual(POINTS.TOP20);
  });

  it("el top-20 se corta en 20: el 21º no cobra", async () => {
    const reto = await crearReto();
    const gente = [];
    for (let i = 0; i < 21; i += 1) gente.push(await participar(reto.id, { votos: 100 - i }));

    await cerrarRetoVencido(prisma, reto.id);

    expect(await puntosDe(gente[19]!.userId)).toBe(POINTS.TOP20);
    expect(await puntosDe(gente[20]!.userId)).toBe(0);
  });
});

describe("nada se cuela después del cierre", () => {
  it("un vídeo que acaba de codificar tras el cierre no entra retroactivamente", async () => {
    const reto = await crearReto();
    const ganador = await participar(reto.id, { votos: 2 });
    const tardio = await participar(reto.id, {
      votos: 50,
      videoEstado: "PENDING",
      subEstado: "PENDING",
    });

    await cerrarRetoVencido(prisma, reto.id);

    // El worker confirma el vídeo tardío DESPUÉS: es el camino real, no una escritura a mano.
    await prisma.video.update({ where: { id: tardio.videoId }, data: { status: "PUBLISHED" } });
    await publicarParticipacionSiProcede(prisma, tardio.videoId);
    await cerrarRetoVencido(prisma, reto.id);

    const filas = await prisma.challengeResult.findMany({ where: { challengeId: reto.id } });
    expect(filas.map((f) => f.userId)).toEqual([ganador.userId]);
    expect(await puntosDe(tardio.userId)).toBe(0);
    // Y su participación NO queda listada como publicada en un reto ya cerrado.
    const sub = await prisma.submission.findUniqueOrThrow({ where: { id: tardio.submissionId } });
    expect(sub.status).toBe("PENDING");
  });

  it("un reto que aún no ha vencido no se cierra", async () => {
    const reto = await crearReto();
    await prisma.challenge.update({
      where: { id: reto.id },
      data: { deadline: new Date(Date.now() + 86_400_000) },
    });
    await participar(reto.id, { votos: 5 });

    expect((await cerrarRetoVencido(prisma, reto.id)).cerradoAhora).toBe(false);
    expect((await cerrarRetosVencidos(prisma)).revisados).toBe(0);
  });

  it("un reto en camino de ser borrado no reparte premios", async () => {
    const reto = await crearReto();
    await participar(reto.id, { votos: 5 });
    await prisma.challenge.update({
      where: { id: reto.id },
      data: { eliminacionProgramadaEn: new Date() },
    });

    expect((await cerrarRetoVencido(prisma, reto.id)).cerradoAhora).toBe(false);
  });
});

/** La decisión, sin base de datos: los casos frontera se leen mejor aquí. */
describe("decidirCierre (pura)", () => {
  const p = (id: string, votos: number, ms = 0): ParticipacionCierre => ({
    submissionId: id,
    userId: `u-${id}`,
    voteCount: votos,
    createdAt: new Date(ms),
  });

  it("el orden es TOTAL: mismos datos, mismo resultado, venga como venga la lista", () => {
    const lista = [p("a", 5, 100), p("b", 5, 100), p("c", 9, 50)];
    const uno = decidirCierre({
      participaciones: lista,
      winnersCount: 3,
      minParticipaciones: null,
    });
    const otro = decidirCierre({
      participaciones: [...lista].reverse(),
      winnersCount: 3,
      minParticipaciones: null,
    });
    // Sin el tercer criterio de desempate, `sort` podría ordenar a y b de dos formas y el cierre no
    // sería reproducible — y un cierre no reproducible no se puede reintentar.
    expect(uno.ganadores).toEqual(otro.ganadores);
  });

  it("a igual voto gana la más RECIENTE (orden canónico)", () => {
    const d = decidirCierre({
      participaciones: [p("vieja", 5, 1000), p("nueva", 5, 2000), p("otra", 1, 0)],
      winnersCount: 2,
      minParticipaciones: null,
    });
    expect(d.ganadores.map((g) => g.submissionId)).toEqual(["nueva", "vieja"]);
  });

  it("los rank son correlativos desde 1 y sin huecos", () => {
    const d = decidirCierre({
      participaciones: [p("a", 9), p("b", 8), p("c", 7)],
      winnersCount: 3,
      minParticipaciones: null,
    });
    expect(d.ganadores.map((g) => g.rank)).toEqual([1, 2, 3]);
  });

  it("nunca se premian más posiciones que participaciones hay", () => {
    const d = decidirCierre({
      participaciones: [p("a", 9)],
      winnersCount: 5,
      minParticipaciones: null,
    });
    expect(d.motivo).toBe("CON_GANADORES");
    expect(d.ganadores).toHaveLength(1);
  });

  it("el top-20 NO depende del empate: es un orden, no un veredicto", () => {
    // REGRESIÓN. Cuando el top-20 venía dentro de la decisión, un reto en empate devolvía lista
    // vacía; tras resolver el admin, recalcular sobre unos votos que SIGUEN empatados seguía dando
    // vacío y el ganador se quedaba sin sus 10 puntos. El derecho a cobrar lo decide el motivo
    // guardado del reto (lo comprueba el test de resolución de empate); esto solo ordena.
    const empatados = [p("a", 3, 100), p("b", 3, 200)];
    expect(
      decidirCierre({ participaciones: empatados, winnersCount: 1, minParticipaciones: null })
        .motivo,
    ).toBe("EMPATE_PENDIENTE");
    expect(top20DeParticipaciones(empatados)).toEqual(["u-b", "u-a"]);
  });

  it("el top-20 se corta en 20 aunque haya más", () => {
    const muchas = Array.from({ length: 25 }, (_, i) => p(`s${i}`, 100 - i));
    expect(top20DeParticipaciones(muchas)).toHaveLength(20);
  });
});
