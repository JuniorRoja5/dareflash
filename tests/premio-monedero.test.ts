/**
 * EL PREMIO LLEGA AL MONEDERO — Fase 7, pieza 1. Lo que se fija aquí es DINERO, así que los casos
 * ejecutan la ruta real contra la base de datos: ninguno escribe un `WalletLedger` a mano.
 *
 *  - SE PAGA UNA VEZ. Re-cerrar el reto, reintentar el barrido o resolver un empate después NO
 *    vuelve a pagar. La clave de idempotencia se deriva del HECHO (esta persona, este reto), no del
 *    momento ni de un contador: por eso repetir converge en vez de acumular.
 *  - EL IMPORTE SALE DE `ChallengeResult`, congelado en el cierre. Editar el premio del reto después
 *    no cambia lo que se debe, y leerlo del `Challenge` al pagar reabriría esa puerta.
 *  - QUIEN TIENE 0, NO COBRA. Con varios ganadores el importe va íntegro al rank 1 y 0 al resto —una
 *    decisión ya tomada y escrita en el cierre, no un provisional—. Un `CREDIT` de cero sería una
 *    fila de dinero que no mueve dinero.
 *  - EL CRÉDITO VA FUERA DE LA TRANSACCIÓN DEL CIERRE. Es el veto del deadlock, y se vigila por
 *    ESTRUCTURA: un test de comportamiento no puede ver dónde está escrita una llamada.
 *  - LA MONEDA SE COMPRUEBA ANTES DEL IMPORTE. `User.walletBalanceCents` es UN número y da por hecho
 *    que todos los movimientos de una persona van en la misma moneda; sumar dos monedas ahí no
 *    falla, da un número que parece dinero y no lo es.
 *
 * Para romperlo a propósito: hacer la clave aleatoria o por-ejecución (rojo: paga dos veces), mover
 * el `applyWallet` dentro del `$transaction` del cierre (rojo: el veto), o acreditar también a quien
 * tiene 0 (rojo).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";
import { clavePremioCierre } from "../src/lib/cierre-reto";
import {
  cerrarRetoVencido,
  cerrarRetosVencidos,
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

async function crearReto(opts: { premio?: number; winnersCount?: number; moneda?: string } = {}) {
  n += 1;
  return prisma.challenge.create({
    data: {
      title: `Reto ${n}`,
      slug: `reto-${n}`,
      publicCode: generarPublicCode(),
      category: "fitness",
      status: "PUBLISHED",
      prizeCurrency: opts.moneda ?? "USD",
      prizeAmountCents: opts.premio ?? 5000,
      winnersCount: opts.winnersCount ?? 1,
      startsAt: new Date(Date.now() - 86_400_000),
      deadline: new Date(Date.now() - 3_600_000), // ya vencido
      createdById: adminId,
    },
    select: { id: true },
  });
}

async function participar(challengeId: string, votos: number) {
  const userId = await crearUsuario(prisma);
  n += 1;
  const video = await prisma.video.create({
    data: { userId, bunnyVideoId: `guid-${n}-${Date.now()}`, status: "PUBLISHED" },
    select: { id: true },
  });
  const sub = await prisma.submission.create({
    data: { challengeId, userId, videoId: video.id, status: "PUBLISHED", voteCount: votos },
    select: { id: true },
  });
  return { userId, submissionId: sub.id };
}

const monederoDe = async (userId: string) =>
  prisma.walletLedger.findMany({
    where: { userId },
    select: { amountCents: true, entryType: true, currency: true, idempotencyKey: true },
  });

const saldoDe = async (userId: string): Promise<number> =>
  (
    await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { walletBalanceCents: true },
    })
  ).walletBalanceCents;

describe("el ganador cobra, y cobra una vez", () => {
  it("un ganador: un CREDIT por el premio entero, y el saldo lo refleja", async () => {
    const reto = await crearReto({ premio: 7500 });
    const g = await participar(reto.id, 3);

    await cerrarRetoVencido(prisma, reto.id);

    expect(await monederoDe(g.userId)).toEqual([
      {
        amountCents: 7500,
        entryType: "CREDIT",
        currency: "USD",
        idempotencyKey: clavePremioCierre({ challengeId: reto.id, userId: g.userId }),
      },
    ]);
    expect(await saldoDe(g.userId)).toBe(7500);
  });

  it("re-cerrar el reto NO vuelve a pagar", async () => {
    const reto = await crearReto({ premio: 5000 });
    const g = await participar(reto.id, 3);

    await cerrarRetoVencido(prisma, reto.id);
    await cerrarRetoVencido(prisma, reto.id);
    await cerrarRetosVencidos(prisma);

    expect((await monederoDe(g.userId)).length, "pagó más de una vez").toBe(1);
    expect(await saldoDe(g.userId)).toBe(5000);
  });

  it("y un cierre a MEDIAS se repara solo, sin duplicar lo ya pagado", async () => {
    // El caso real: el proceso muere después de pagar y antes de marcar `premiadosEn`. La siguiente
    // vuelta del barrido tiene que completar lo que falte sin volver a abonar lo que ya está.
    const reto = await crearReto({ premio: 5000 });
    const g = await participar(reto.id, 3);
    await cerrarRetoVencido(prisma, reto.id);

    await prisma.challenge.update({ where: { id: reto.id }, data: { premiadosEn: null } });
    await cerrarRetosVencidos(prisma);

    expect((await monederoDe(g.userId)).length).toBe(1);
    expect(await saldoDe(g.userId)).toBe(5000);
    expect(
      (await prisma.challenge.findUniqueOrThrow({ where: { id: reto.id } })).premiadosEn,
      "el cierre no volvió a marcarse como proyectado",
    ).not.toBeNull();
  });

  it("el reto que el admin DESEMPATA también paga", async () => {
    // Si la resolución del empate llamara solo a los puntos, estos retos se cerrarían sin pagar a
    // nadie y nada fallaría: el ganador existiría en `ChallengeResult` con su premio congelado y el
    // monedero vacío.
    const reto = await crearReto({ premio: 4000 });
    const a = await participar(reto.id, 5);
    await participar(reto.id, 5); // empate limpio

    await cerrarRetoVencido(prisma, reto.id);
    expect(await monederoDe(a.userId), "pagó antes de resolverse el empate").toEqual([]);

    await resolverEmpate(prisma, reto.id, [a.submissionId]);

    expect(await saldoDe(a.userId)).toBe(4000);
  });
});

describe("quien no tiene premio, no recibe una fila de dinero", () => {
  it("premio 0: ni un movimiento", async () => {
    const reto = await crearReto({ premio: 0 });
    const g = await participar(reto.id, 3);

    await cerrarRetoVencido(prisma, reto.id);

    expect(await monederoDe(g.userId)).toEqual([]);
    expect(await saldoDe(g.userId)).toBe(0);
  });

  it("con varios ganadores paga SOLO el rank 1: el reparto ya estaba decidido", async () => {
    // El importe se congela íntegro al rank 1 y 0 al resto (ver el cierre). Pagar el premio entero a
    // cada uno multiplicaría el coste del reto por el número de ganadores, y eso no lo ha decidido
    // nadie: aquí se paga lo congelado, ni más ni menos.
    const reto = await crearReto({ premio: 9000, winnersCount: 3 });
    const a = await participar(reto.id, 10);
    const b = await participar(reto.id, 8);
    const c = await participar(reto.id, 6);

    await cerrarRetoVencido(prisma, reto.id);

    expect(await saldoDe(a.userId)).toBe(9000);
    expect(await saldoDe(b.userId)).toBe(0);
    expect(await saldoDe(c.userId)).toBe(0);
    expect(await prisma.walletLedger.count(), "se escribió dinero de más").toBe(1);
  });
});

describe("la auditoría del pago", () => {
  it("una línea por pago, y ni una más al reintentar", async () => {
    const reto = await crearReto({ premio: 5000 });
    const g = await participar(reto.id, 3);

    await cerrarRetoVencido(prisma, reto.id);
    // ┌─ EL REINTENTO DE VERDAD, Y NO LLAMAR DOS VECES ───────────────────────────────────────────┐
    // │ La primera versión llamaba a `cerrarRetoVencido` otra vez y salía VERDE con la auditoría  │
    // │ rota: el segundo cierre no llega al pago —`closedAt` y `premiadosEn` ya están, así que     │
    // │ vuelve antes de empezar—, o sea que no reintentaba nada. El reintento real es el del      │
    // │ barrido sobre un cierre que quedó a medias, y eso se provoca borrando la marca.           │
    // └───────────────────────────────────────────────────────────────────────────────────────────┘
    await prisma.challenge.update({ where: { id: reto.id }, data: { premiadosEn: null } });
    await cerrarRetosVencidos(prisma);

    const lineas = await prisma.auditLog.findMany({
      where: { action: "WALLET_PRIZE_CREDIT", targetId: g.userId },
      select: { targetType: true, actorId: true, metadata: true },
    });
    expect(lineas.length, "la traza se duplicó al reintentar").toBe(1);
    expect(lineas[0]!.targetType).toBe("USER");
    // El actor es el SISTEMA: este pago no lo hizo nadie, lo hizo el reloj.
    expect(lineas[0]!.actorId).toBeNull();
    expect(lineas[0]!.metadata).toMatchObject({ challengeId: reto.id, amountCents: 5000 });
  });
});

describe("la moneda se comprueba ANTES del importe", () => {
  it("un premio congelado en otra moneda no se acredita", async () => {
    // `User.walletBalanceCents` es UN número: da por hecho que todos los movimientos de una persona
    // van en la misma moneda. Convertir "a ojo" o acreditar igual daría un saldo que parece dinero y
    // no lo es. Se deja sin pagar, y sin `premiadosEn` el barrido lo seguirá intentando — que es lo
    // que hace que alguien se entere.
    const reto = await crearReto({ premio: 5000, moneda: "EUR" });
    const g = await participar(reto.id, 3);

    await cerrarRetoVencido(prisma, reto.id);

    expect(await monederoDe(g.userId)).toEqual([]);
    expect(await saldoDe(g.userId)).toBe(0);
    expect(
      (await prisma.challenge.findUniqueOrThrow({ where: { id: reto.id } })).premiadosEn,
      "el cierre se dio por bueno con un premio sin pagar",
    ).toBeNull();
  });
});

/**
 * EL VETO DEL DEADLOCK, POR ESTRUCTURA. Acreditar bloquea la fila del `User` con `FOR UPDATE`; el
 * paso 1 del cierre ya tiene bloqueadas filas de CONTENIDO. Anidar lo uno dentro de lo otro es la
 * receta de un deadlock entre dos cierres concurrentes, y un test de comportamiento no lo ve: haría
 * falta provocar la carrera exacta. Lo que sí se puede comprobar es DÓNDE está escrita la llamada.
 */
describe("el pago va FUERA de la transacción del cierre (veto del deadlock)", () => {
  const FUENTE = readFileSync(
    path.resolve(__dirname, "..", "src", "server", "services", "cierre-reto.ts"),
    "utf8",
  );

  /** El cuerpo de cada `$transaction(...)`, emparejando llaves — un regex no sabe anidar. */
  function cuerposDeTransaccion(src: string): string[] {
    const cuerpos: string[] = [];
    for (const m of src.matchAll(/\$transaction\(/g)) {
      let i = src.indexOf("{", m.index!);
      if (i === -1) continue;
      let nivel = 0;
      const desde = i;
      for (; i < src.length; i++) {
        if (src[i] === "{") nivel += 1;
        else if (src[i] === "}") {
          nivel -= 1;
          if (nivel === 0) break;
        }
      }
      cuerpos.push(src.slice(desde, i + 1));
    }
    return cuerpos;
  }

  const cuerpos = cuerposDeTransaccion(FUENTE);

  it("se encontraron las transacciones del cierre (si no, lo de abajo no mira nada)", () => {
    expect(
      cuerpos.length,
      "no encuentro ningún `$transaction` en el cierre",
    ).toBeGreaterThanOrEqual(2);
  });

  it("ninguna transacción acredita dinero ni otorga puntos por dentro", () => {
    for (const [i, cuerpo] of cuerpos.entries()) {
      expect(cuerpo, `la transacción #${i + 1} acredita dinero por dentro`).not.toMatch(
        /applyWallet/,
      );
      expect(cuerpo, `la transacción #${i + 1} otorga puntos por dentro`).not.toMatch(
        /applyPoints/,
      );
    }
  });

  it("y el pago sí está en el servicio, fuera de ellas", () => {
    // El contrapeso: sin esto, borrar la llamada entera también dejaría el caso de arriba en verde.
    expect(FUENTE, "ya no se acredita el premio en ninguna parte").toMatch(/applyWallet\(/);
  });
});
