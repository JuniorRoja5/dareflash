/**
 * LA PORTADA Y SU RETO DESTACADO (Fase 9 · P14), contra la base de datos.
 *
 * DIENTES (los del encargo):
 *  - Dos marcados a la vez → queda UNO (un solo valor en SystemState, no un booleano por reto).
 *  - Destacar uno cerrado, en borrador o de empresa sin pagar → rechazado.
 *  - El destacado se cierra → la portada muestra el automático, y el panel lo da por CADUCADO.
 *  - Participantes y votos REALES en el hero; las cifras, de los retos abiertos de verdad.
 *  - Sin retos abiertos: ni cifras ni reto en el hero (nunca uno falso).
 * Y: el AuditLog de marcar y quitar; quitar devuelve el automático; la rejilla no repite el del hero.
 *
 * Para romperlo a propósito: quitar el filtro de «abierto» de `marcarDestacado` (rojo el de cerrado y
 * borrador); quitar el `retoAbiertoWhere` del elegido en `retoDestacadoPortada` (rojo el de caducado);
 * quitar el `OR` del pago (rojo el de empresa sin pagar).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { CLAVE_RETO_DESTACADO } from "../src/config/constants";
import type { PrismaClient } from "../src/generated/prisma/client";
import {
  datosPortada,
  datosPortadaCacheados,
  olvidarCachePortada,
  estadoDestacadoPanel,
  marcarDestacado,
  quitarDestacado,
} from "../src/server/services/portada";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

let prisma: PrismaClient;
let admin: string;
beforeAll(() => {
  prisma = createTestPrisma();
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
  olvidarCachePortada();
  admin = await crearUsuario(prisma);
});

const AHORA = new Date("2026-12-10T12:00:00.000Z");
const DIA = 86_400_000;
let n = 0;

/** Un reto. Por defecto, PUBLICADO y ABIERTO, de 100 $ y que cierra en 5 días. */
async function unReto(
  o: {
    premio?: number;
    categoria?: string;
    status?: string;
    cierraEnDias?: number;
    empiezaHaceDias?: number;
    empresaSinPagar?: boolean;
  } = {},
): Promise<string> {
  n += 1;
  let empresaId: string | null = null;
  if (o.empresaSinPagar) {
    const owner = await crearUsuario(prisma);
    empresaId = (
      await prisma.empresa.create({
        data: {
          ownerUserId: owner,
          nombre: `Empresa ${n}`,
          tipoCuenta: "EMPRESA",
          tipoNegocio: "FISICO",
          estado: "VERIFICADA",
          paisIso: "ES",
          personaContacto: "Lucía",
        },
        select: { id: true },
      })
    ).id;
  }
  const c = await prisma.challenge.create({
    data: {
      title: `Reto ${n}`,
      category: o.categoria ?? "humor",
      slug: `reto-${n}`,
      publicCode: `PORT${n}`,
      status: o.status ?? "PUBLISHED",
      prizeAmountCents: o.premio ?? 10_000,
      prizeCurrency: "USD",
      startsAt: new Date(AHORA.getTime() - (o.empiezaHaceDias ?? 1) * DIA),
      deadline: new Date(AHORA.getTime() + (o.cierraEnDias ?? 5) * DIA),
      createdById: admin,
      empresaId,
    },
    select: { id: true },
  });
  return c.id;
}

/** `cuantas` participaciones publicadas, cada una con `votos` votos. */
async function participaciones(challengeId: string, cuantas: number, votos: number) {
  for (let i = 0; i < cuantas; i += 1) {
    const u = await crearUsuario(prisma);
    const v = await prisma.video.create({
      data: { userId: u, bunnyVideoId: `b-${challengeId}-${i}`, status: "PUBLISHED" },
      select: { id: true },
    });
    await prisma.submission.create({
      data: { challengeId, userId: u, videoId: v.id, status: "PUBLISHED", voteCount: votos },
    });
  }
}

describe("las cifras y el reto del hero, con datos reales", () => {
  it("solo los abiertos cuentan (ni borradores, ni cerrados, ni de empresa sin pagar)", async () => {
    await unReto({ premio: 10_000, categoria: "humor" });
    await unReto({ premio: 20_000, categoria: "fitness" });
    await unReto({ status: "DRAFT", premio: 999_000 });
    await unReto({ cierraEnDias: -1, premio: 999_000 });
    await unReto({ empresaSinPagar: true, premio: 999_000 });
    const d = await datosPortada(prisma, AHORA);
    expect(d.cifras).toEqual({ retosAbiertos: 2, premiosCents: 30_000, categorias: 2 });
  });

  it("el hero: el abierto de mayor premio, con sus participantes y votos de verdad", async () => {
    await unReto({ premio: 10_000 });
    const grande = await unReto({ premio: 50_000 });
    await participaciones(grande, 3, 4);
    const d = await datosPortada(prisma, AHORA);
    expect(d.destacado?.elegido).toBe(false);
    expect(d.destacado?.reto.premioCents).toBe(50_000);
    expect(d.destacado?.reto).toMatchObject({ participantes: 3, votos: 12 });
    // La rejilla no repite el del hero.
    expect(d.rejilla.map((r) => r.premioCents)).toEqual([10_000]);
  });

  it("sin retos abiertos: ni cifras que enseñar ni reto en el hero", async () => {
    await unReto({ status: "DRAFT" });
    const d = await datosPortada(prisma, AHORA);
    expect(d.destacado).toBeNull();
    expect(d.rejilla).toEqual([]);
    expect(d.cifras.retosAbiertos).toBe(0);
  });
});

describe("el destacado que elige el admin", () => {
  it("marcado, sale en el hero aunque no sea el de mayor premio; quitarlo vuelve al automático", async () => {
    await unReto({ premio: 90_000 });
    const pequeno = await unReto({ premio: 1_000 });
    expect(
      await marcarDestacado(prisma, { challengeId: pequeno, adminId: admin, ahora: AHORA }),
    ).toEqual({
      estado: "hecho",
    });
    let d = await datosPortada(prisma, AHORA);
    expect(d.destacado).toMatchObject({ elegido: true, reto: { premioCents: 1_000 } });
    expect(await quitarDestacado(prisma, { adminId: admin })).toEqual({ estado: "hecho" });
    d = await datosPortada(prisma, AHORA);
    expect(d.destacado).toMatchObject({ elegido: false, reto: { premioCents: 90_000 } });
    const auditoria = await prisma.auditLog.findMany({
      where: { actorId: admin },
      orderBy: { createdAt: "asc" },
      select: { action: true, targetId: true },
    });
    expect(auditoria).toEqual([
      { action: "PORTADA_DESTACADO_MARCADO", targetId: pequeno },
      { action: "PORTADA_DESTACADO_QUITADO", targetId: pequeno },
    ]);
  });

  it("DOS MARCADOS A LA VEZ → queda UNO", async () => {
    const a = await unReto();
    const b = await unReto();
    // Los dos terminan bien (el segundo reintenta su 1020), y queda uno.
    const r = await Promise.all([
      marcarDestacado(prisma, { challengeId: a, adminId: admin, ahora: AHORA }),
      marcarDestacado(prisma, { challengeId: b, adminId: admin, ahora: AHORA }),
    ]);
    expect(r.map((x) => x.estado)).toEqual(["hecho", "hecho"]);
    const filas = await prisma.systemState.findMany({ where: { key: CLAVE_RETO_DESTACADO } });
    expect(filas).toHaveLength(1);
    expect([a, b]).toContain(filas[0]?.value);
    // Y marcar otro SUSTITUYE al anterior.
    const c = await unReto();
    await marcarDestacado(prisma, { challengeId: c, adminId: admin, ahora: AHORA });
    expect(
      (await prisma.systemState.findMany({ where: { key: CLAVE_RETO_DESTACADO } })).map(
        (f) => f.value,
      ),
    ).toEqual([c]);
  });

  it("destacar uno CERRADO, en BORRADOR, que aún no ABRE o de EMPRESA SIN PAGAR → rechazado", async () => {
    for (const id of [
      await unReto({ cierraEnDias: -1 }),
      await unReto({ status: "DRAFT" }),
      await unReto({ empiezaHaceDias: -2 }),
      await unReto({ empresaSinPagar: true }),
    ]) {
      expect(
        await marcarDestacado(prisma, { challengeId: id, adminId: admin, ahora: AHORA }),
      ).toEqual({
        estado: "rechazado",
        motivo: "NO_ABIERTO",
      });
    }
    expect(await prisma.systemState.count({ where: { key: CLAVE_RETO_DESTACADO } })).toBe(0);
  });

  it("el destacado SE CIERRA → la portada muestra el automático y el panel lo da por caducado", async () => {
    const elegido = await unReto({ premio: 1_000, cierraEnDias: 1 });
    const automatico = await unReto({ premio: 70_000, cierraEnDias: 9 });
    await marcarDestacado(prisma, { challengeId: elegido, adminId: admin, ahora: AHORA });
    const despues = new Date(AHORA.getTime() + 2 * DIA);
    const d = await datosPortada(prisma, despues);
    expect(d.destacado).toMatchObject({ elegido: false, reto: { premioCents: 70_000 } });
    const panel = await estadoDestacadoPanel(prisma, despues);
    expect(panel).toMatchObject({
      elegido: { id: elegido },
      caducado: true,
      enPortada: { id: automatico },
    });
  });
});

describe("la caché corta de la portada", () => {
  it("marcar el destacado se ve en la SIGUIENTE visita, sin esperar a que caduque", async () => {
    await unReto({ premio: 90_000 });
    const pequeno = await unReto({ premio: 1_000 });
    expect((await datosPortadaCacheados(prisma, AHORA)).destacado?.reto.premioCents).toBe(90_000);
    await marcarDestacado(prisma, { challengeId: pequeno, adminId: admin, ahora: AHORA });
    expect((await datosPortadaCacheados(prisma, AHORA)).destacado?.reto.premioCents).toBe(1_000);
    await quitarDestacado(prisma, { adminId: admin });
    expect((await datosPortadaCacheados(prisma, AHORA)).destacado?.reto.premioCents).toBe(90_000);
  });

  it("un reto que cierra dentro de la ventana no sale de la caché (ni en el hero ni en la rejilla)", async () => {
    // El del hero cierra en 10 s; uno de la rejilla, en 5 s.
    const hero = await prisma.challenge.findUniqueOrThrow({
      where: { id: await unReto({ premio: 90_000 }) },
      select: { id: true },
    });
    await prisma.challenge.update({
      where: { id: hero.id },
      data: { deadline: new Date(AHORA.getTime() + 10_000) },
    });
    const breve = await unReto({ premio: 5_000 });
    await prisma.challenge.update({
      where: { id: breve },
      data: { deadline: new Date(AHORA.getTime() + 5_000) },
    });
    await unReto({ premio: 1_000 });
    expect((await datosPortadaCacheados(prisma, AHORA)).rejilla).toHaveLength(2);
    const a7s = await datosPortadaCacheados(prisma, new Date(AHORA.getTime() + 7_000));
    expect(a7s.rejilla.map((r) => r.premioCents)).toEqual([1_000]);
    const a12s = await datosPortadaCacheados(prisma, new Date(AHORA.getTime() + 12_000));
    expect(a12s.destacado?.reto.premioCents).toBe(1_000);
  });
});
