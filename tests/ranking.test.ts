/**
 * RANKING MENSUAL Y TOP DEL RETO (Fase 4, capa de datos).
 *
 * Los datos NO se siembran: todos salen de ejecutar el cierre real. Si el cierre no produce una
 * victoria, aquí no existe — que es la única forma de que estos tests digan algo del sistema y no de
 * sí mismos.
 *
 * Para romperlos a propósito:
 *  - quitar `userId` del `orderBy` -> el orden deja de ser total y el keyset repite o salta;
 *  - cambiar el recuento a `increment` -> re-ejecutar un cierre infla las victorias;
 *  - quitar el filtro de periodo -> cuentan victorias de otros meses.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";
import { periodoDe, rangoDelPeriodo } from "../src/lib/periodo";
import { cerrarRetoVencido } from "../src/server/services/cierre-reto";
import {
  rankingMensual,
  recontarVictoriasDelPeriodo,
  topDelReto,
} from "../src/server/services/ranking";
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
      prizeAmountCents: 1000,
      winnersCount,
      startsAt: new Date(Date.now() - 86_400_000),
      deadline: new Date(Date.now() - 3_600_000),
      createdById: adminId,
    },
    select: { id: true },
  });
}

/** Participa con `userId` si se da; si no, crea uno nuevo. Publicada de verdad (cuenta al cierre). */
async function participar(challengeId: string, votos: number, userId?: string) {
  const uid = userId ?? (await crearUsuario(prisma));
  n += 1;
  const video = await prisma.video.create({
    data: { userId: uid, bunnyVideoId: `guid-${n}-${Date.now()}`, status: "PUBLISHED" },
    select: { id: true },
  });
  const sub = await prisma.submission.create({
    data: { challengeId, userId: uid, videoId: video.id, status: "PUBLISHED", voteCount: votos },
    select: { id: true },
  });
  return { userId: uid, submissionId: sub.id };
}

/** Gana `veces` retos distintos: la ruta real, un cierre por reto. */
async function ganarRetos(veces: number, userId?: string): Promise<string> {
  let uid = userId;
  for (let i = 0; i < veces; i += 1) {
    const reto = await crearReto();
    const g = await participar(reto.id, 10, uid);
    uid = g.userId;
    await participar(reto.id, 1); // alguien a quien ganar
    await cerrarRetoVencido(prisma, reto.id);
  }
  return uid as string;
}

describe("el ranking mensual cuenta VICTORIAS, y solo las del mes", () => {
  it("sin victorias, la lista sale vacía (nada de rellenar con nadie)", async () => {
    const pagina = await rankingMensual(prisma);
    expect(pagina.filas).toEqual([]);
    expect(pagina.cursor).toBeNull();
  });

  it("ordena por victorias, de más a menos", async () => {
    const tres = await ganarRetos(3);
    const uno = await ganarRetos(1);

    const { filas } = await rankingMensual(prisma);

    expect(filas.map((f) => f.userId)).toEqual([tres, uno]);
    expect(filas[0]?.victorias).toBe(3);
    expect(filas[1]?.victorias).toBe(1);
  });

  it("una victoria de OTRO mes no cuenta en este", async () => {
    const ganador = await ganarRetos(1);
    const ahora = new Date();

    // Se mueve la victoria al mes pasado, que es lo que hace un reto cerrado en enero mirado en
    // febrero. El caché se recalcula desde el hecho, así que tiene que caer a 0.
    const mesPasado = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth() - 1, 15));
    await prisma.challengeResult.updateMany({
      where: { userId: ganador },
      data: { createdAt: mesPasado },
    });
    // Se fuerza el recuento por la vía real: cerrar otro reto del mismo usuario reescribe su fila.
    await ganarRetos(1, ganador);

    const esteMes = await rankingMensual(prisma);
    const anterior = await rankingMensual(prisma, { periodo: periodoDe(mesPasado) });

    // Dos victorias en total, pero solo UNA es de este mes.
    expect(await prisma.challengeResult.count({ where: { userId: ganador } })).toBe(2);
    expect(esteMes.filas.find((f) => f.userId === ganador)?.victorias).toBe(1);
    expect(anterior.filas).toEqual([]); // su caché de aquel mes nunca se escribió
  });

  it("re-ejecutar el cierre no cambia el recuento", async () => {
    const reto = await crearReto();
    const g = await participar(reto.id, 5);
    await participar(reto.id, 1);

    await cerrarRetoVencido(prisma, reto.id);
    await cerrarRetoVencido(prisma, reto.id);
    await cerrarRetoVencido(prisma, reto.id);

    const { filas } = await rankingMensual(prisma);
    expect(filas.find((f) => f.userId === g.userId)?.victorias).toBe(1);
  });

  it("el recuento es IDEMPOTENTE por sí mismo: llamarlo N veces da el mismo número", async () => {
    // El test de arriba NO prueba esto, y merece decirse: al re-cerrar, `cerrarRetoVencido` sale
    // antes y el recuento ni se vuelve a ejecutar. El invariante ("valor absoluto, nunca
    // `increment`") vive en esta función, así que se prueba llamándola a ella — el mismo motivo por
    // el que el ledger escribe el saldo calculado y no un incremento.
    const ganador = await ganarRetos(1);
    const periodo = periodoDe(new Date());

    for (let i = 0; i < 4; i += 1) {
      await recontarVictoriasDelPeriodo(prisma, [ganador], periodo);
    }

    const fila = await prisma.rankingMensual.findFirstOrThrow({ where: { userId: ganador } });
    expect(fila.victorias).toBe(1); // con `increment` valdría 5
  });

  it("el caché cuadra con el hecho: victorias == filas de ChallengeResult del mes", async () => {
    const a = await ganarRetos(2);
    const b = await ganarRetos(1);
    const { desde, hasta } = rangoDelPeriodo(periodoDe(new Date()));

    for (const userId of [a, b]) {
      const reales = await prisma.challengeResult.count({
        where: { userId, createdAt: { gte: desde, lt: hasta } },
      });
      const fila = await prisma.rankingMensual.findFirstOrThrow({ where: { userId } });
      expect(fila.victorias).toBe(reales);
    }
  });

  it("trae los puntos para derivar el nivel, y NO guarda ningún nivel", async () => {
    const ganador = await ganarRetos(1);
    const { filas } = await rankingMensual(prisma);

    const puntos = (
      await prisma.user.findUniqueOrThrow({
        where: { id: ganador },
        select: { pointsBalance: true },
      })
    ).pointsBalance;
    expect(filas[0]?.puntos).toBe(puntos);
    expect(puntos).toBeGreaterThan(0);
  });
});

describe("el nivel se DERIVA, nunca se guarda", () => {
  it("no existe ninguna columna de nivel en el esquema", () => {
    // Un nivel almacenado deriva a la deriva: los puntos suben por una vía (el ledger) y la columna
    // se queda con el valor viejo hasta que alguien se acuerde de recalcularla. Es la lección del
    // REMOVED otra vez. `nivelPorPuntos` es puro y se calcula al pintar; esto impide que vuelva.
    const esquema = readFileSync(
      path.resolve(__dirname, "..", "prisma", "schema.prisma"),
      "utf8",
    ).replace(/\/\/.*$/gm, ""); // fuera comentarios: la palabra "nivel" aparece en varios
    expect(esquema).not.toMatch(/^\s*(nivel|level|tier)\s+\w/im);
  });

  it("el ranking entrega PUNTOS, que es de donde sale el nivel", async () => {
    const ganador = await ganarRetos(1);
    const { filas } = await rankingMensual(prisma);
    expect(filas[0]?.userId).toBe(ganador);
    expect(typeof filas[0]?.puntos).toBe("number");
    // Y no entrega nivel: quien pinta decide, con la función pura.
    expect(filas[0]).not.toHaveProperty("nivel");
  });
});

describe("paginación KEYSET: ni repite ni salta, tampoco con empates", () => {
  it("recorrer por páginas devuelve a cada usuario UNA sola vez", async () => {
    // TODOS con las mismas victorias: el caso que rompe un keyset sin orden total. Si el desempate
    // no fuera estable, la página 2 repetiría a alguien de la 1 y se saltaría a otro.
    const ganadores: string[] = [];
    for (let i = 0; i < 7; i += 1) ganadores.push(await ganarRetos(1));

    const vistos: string[] = [];
    let cursor: string | null = null;
    let vueltas = 0;
    do {
      const pagina: Awaited<ReturnType<typeof rankingMensual>> = await rankingMensual(prisma, {
        limite: 2,
        cursor,
      });
      vistos.push(...pagina.filas.map((f) => f.userId));
      cursor = pagina.cursor;
      vueltas += 1;
    } while (cursor !== null && vueltas < 20);

    expect(new Set(vistos).size).toBe(vistos.length); // ninguno REPETIDO
    expect(vistos.sort()).toEqual([...ganadores].sort()); // ninguno SALTADO
  });

  it("la última página cierra el cursor en vez de girar para siempre", async () => {
    await ganarRetos(1);
    const pagina = await rankingMensual(prisma, { limite: 20 });
    expect(pagina.cursor).toBeNull();
  });

  it("el orden es TOTAL: dos llamadas idénticas dan la misma secuencia", async () => {
    for (let i = 0; i < 5; i += 1) await ganarRetos(1);
    const a = await rankingMensual(prisma, { limite: 5 });
    const b = await rankingMensual(prisma, { limite: 5 });
    expect(a.filas.map((f) => f.userId)).toEqual(b.filas.map((f) => f.userId));
  });

  it("un cursor corrupto no rompe: se sirve desde el principio", async () => {
    await ganarRetos(1);
    const pagina = await rankingMensual(prisma, { cursor: "basura" });
    expect(pagina.filas.length).toBe(1);
  });
});

describe("top del reto", () => {
  it("corta en 20 aunque haya más", async () => {
    const reto = await crearReto();
    for (let i = 0; i < 25; i += 1) await participar(reto.id, 100 - i);

    const top = await topDelReto(prisma, reto.id);

    expect(top).toHaveLength(20);
    expect(top[0]?.puesto).toBe(1);
    expect(top[19]?.puesto).toBe(20);
  });

  it("usa la MISMA regla de orden que el cierre: el 1º del top es el ganador", async () => {
    const reto = await crearReto();
    const favorito = await participar(reto.id, 9);
    await participar(reto.id, 4);
    await participar(reto.id, 2);
    await cerrarRetoVencido(prisma, reto.id);

    const top = await topDelReto(prisma, reto.id);
    const ganador = await prisma.challengeResult.findFirstOrThrow({
      where: { challengeId: reto.id },
    });

    // Si el top se ordenara con su propia regla, el podio que se enseña y el que cobró divergirían.
    expect(top[0]?.userId).toBe(favorito.userId);
    expect(top[0]?.userId).toBe(ganador.userId);
  });

  it("solo entran las que CUENTAN: un vídeo sin publicar no aparece", async () => {
    const reto = await crearReto();
    const buena = await participar(reto.id, 3);
    const enCola = await participar(reto.id, 99);
    await prisma.video.update({
      where: {
        id: (await prisma.submission.findUniqueOrThrow({ where: { id: enCola.submissionId } }))
          .videoId,
      },
      data: { status: "PENDING" },
    });

    const top = await topDelReto(prisma, reto.id);

    expect(top.map((t) => t.userId)).toEqual([buena.userId]);
  });

  it("un reto sin participaciones da lista vacía, no un hueco", async () => {
    const reto = await crearReto();
    expect(await topDelReto(prisma, reto.id)).toEqual([]);
  });
});

describe("periodo mensual en UTC", () => {
  it("el rango es semiabierto: el primer instante entra, el del mes siguiente no", () => {
    const { desde, hasta } = rangoDelPeriodo("2026-09");
    expect(desde.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(hasta.toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });

  it("diciembre pasa a enero del año siguiente", () => {
    expect(rangoDelPeriodo("2026-12").hasta.toISOString()).toBe("2027-01-01T00:00:00.000Z");
    expect(periodoDe(new Date("2026-12-31T23:59:59.999Z"))).toBe("2026-12");
    expect(periodoDe(new Date("2027-01-01T00:00:00.000Z"))).toBe("2027-01");
  });

  it("el corte es UTC, no la zona de quien mira", () => {
    // 23:30 del 31 en Madrid (UTC+2) es 21:30 UTC del MISMO día: sigue siendo agosto.
    expect(periodoDe(new Date("2026-08-31T21:30:00.000Z"))).toBe("2026-08");
    // Pero 01:30 del 1 en Madrid es 23:30 UTC del 31: agosto también, y ahí está el borde.
    expect(periodoDe(new Date("2026-08-31T23:30:00.000Z"))).toBe("2026-08");
  });
});
