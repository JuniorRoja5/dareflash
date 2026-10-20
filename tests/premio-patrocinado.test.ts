/**
 * EL GANADOR DE UN RETO PATROCINADO COBRA EXACTAMENTE IGUAL (Fase 9 · P1).
 *
 * ┌─ LA COMISIÓN NO ES UN DESCUENTO AL GANADOR ─────────────────────────────────────────────────┐
 * │ Es un trato con la MARCA, que la paga aparte y por fuera. El ganador cobra el premio ÍNTEGRO │
 * │ por el rail de siempre. La forma barata de romper esto sería "ya que el reto trae un          │
 * │ porcentaje, aplicarlo al acreditar" — y el síntoma sería que alguien recibe 750 donde el reto │
 * │ anunciaba 1000, sin que nada falle. Por eso estos casos no miran el servicio de comisión:     │
 * │ miran EL CRÉDITO DEL MONEDERO.                                                                 │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Y el apunte tiene que seguir REFERENCIANDO su reto (`refType`/`refId`): es lo que permite, el día
 * que alguien cuadre la factura de una marca, reconstruir qué premio salió de qué reto. Ya lo hacía
 * antes de esta fase; aquí se fija para que no se pierda.
 *
 * Para romperlo: restar la comisión en `acreditarPremiosDelCierre` (rojo), o dejar de pasar
 * `refType: "CHALLENGE"` al apunte (rojo).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";
import { cerrarRetoVencido } from "../src/server/services/cierre-reto";
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

/** Un reto YA VENCIDO (el cierre lo dispara el reloj), patrocinado o no. */
async function crearReto(opts: {
  premio: number;
  patrocinado?: boolean;
  comisionBps?: number;
}): Promise<string> {
  n += 1;
  const r = await prisma.challenge.create({
    data: {
      title: `Reto ${n}`,
      slug: `reto-${n}`,
      publicCode: generarPublicCode(),
      category: "fitness",
      status: "PUBLISHED",
      prizeCurrency: "USD",
      prizeAmountCents: opts.premio,
      startsAt: new Date(Date.now() - 86_400_000),
      deadline: new Date(Date.now() - 3_600_000),
      createdById: adminId,
      esPatrocinado: opts.patrocinado ?? false,
      ...(opts.patrocinado ? { sponsorNombre: "Marca S.A." } : {}),
      ...(opts.comisionBps === undefined ? {} : { comisionBps: opts.comisionBps }),
    },
    select: { id: true },
  });
  return r.id;
}

/** Una participación publicada con sus votos: lo que el cierre mira para decidir. */
async function participar(challengeId: string, votos: number): Promise<string> {
  const userId = await crearUsuario(prisma);
  n += 1;
  const video = await prisma.video.create({
    data: { userId, bunnyVideoId: `guid-${n}-${Date.now()}`, status: "PUBLISHED" },
    select: { id: true },
  });
  await prisma.submission.create({
    data: { challengeId, userId, videoId: video.id, status: "PUBLISHED", voteCount: votos },
  });
  return userId;
}

const apuntesDe = (userId: string) =>
  prisma.walletLedger.findMany({
    where: { userId },
    select: { amountCents: true, entryType: true, currency: true, refType: true, refId: true },
  });

const saldoDe = async (userId: string): Promise<number> =>
  (
    await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { walletBalanceCents: true },
    })
  ).walletBalanceCents;

describe("el premio de un reto patrocinado se acredita ÍNTEGRO", () => {
  it("1000 con comisión del 25% se acreditan 1000, no 750", async () => {
    const reto = await crearReto({ premio: 1000, patrocinado: true, comisionBps: 2500 });
    const ganador = await participar(reto, 3);

    await cerrarRetoVencido(prisma, reto);

    expect(await saldoDe(ganador), "al ganador le han restado la comisión").toBe(1000);
    expect(await apuntesDe(ganador)).toEqual([
      {
        amountCents: 1000,
        entryType: "CREDIT",
        currency: "USD",
        // El apunte referencia SU reto: es lo que permite reconstruir el origen al cuadrar.
        refType: "CHALLENGE",
        refId: reto,
      },
    ]);
  });

  it("y es EL MISMO apunte que en un reto normal del mismo premio", async () => {
    // El diente de verdad: no "cobra algo", sino que patrocinado y normal son indistinguibles para
    // el ganador. Si alguien toca el rail para los patrocinados, aquí se ve la diferencia.
    const patrocinado = await crearReto({ premio: 7777, patrocinado: true, comisionBps: 3000 });
    const normal = await crearReto({ premio: 7777 });
    const ganadorA = await participar(patrocinado, 5);
    const ganadorB = await participar(normal, 5);

    await cerrarRetoVencido(prisma, patrocinado);
    await cerrarRetoVencido(prisma, normal);

    const sinRef = (f: { refId: string | null }) => ({ ...f, refId: null });
    expect((await apuntesDe(ganadorA)).map(sinRef)).toEqual(
      (await apuntesDe(ganadorB)).map(sinRef),
    );
    expect(await saldoDe(ganadorA)).toBe(await saldoDe(ganadorB));
  });

  it("el importe sale del CONGELADO del resultado, no del premio editado después", async () => {
    // Si la marca renegocia el premio tras el cierre, lo que se debe ya está decidido.
    const reto = await crearReto({ premio: 2500, patrocinado: true });
    const ganador = await participar(reto, 1);
    await cerrarRetoVencido(prisma, reto);

    await prisma.challenge.update({ where: { id: reto }, data: { prizeAmountCents: 99_999 } });
    // Un segundo barrido no puede repagar NI pagar la diferencia (clave de idempotencia).
    await cerrarRetoVencido(prisma, reto);

    expect(await saldoDe(ganador)).toBe(2500);
    expect(await apuntesDe(ganador)).toHaveLength(1);
  });

  it("y la comisión no deja NINGÚN rastro en el monedero de nadie", async () => {
    // Ni un apunte de más, ni un DEBIT, ni una fila "de la marca": la comisión no pasa por aquí.
    const reto = await crearReto({ premio: 4000, patrocinado: true, comisionBps: 2500 });
    const ganador = await participar(reto, 2);

    await cerrarRetoVencido(prisma, reto);

    expect(await prisma.walletLedger.count()).toBe(1);
    const todo = await prisma.walletLedger.findMany();
    expect(todo[0]?.userId).toBe(ganador);
    expect(todo.some((f) => f.entryType === "DEBIT")).toBe(false);
  });
});
