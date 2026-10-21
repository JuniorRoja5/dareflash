/**
 * LA CONTABILIDAD DE PATROCINIOS Y EL EXPORT (Fase 9 · P1).
 *
 * ┌─ LO QUE SE FACTURA SALE DEL % DEL RETO, NO DE UNA CONSTANTE ─────────────────────────────────┐
 * │ Cada reto guarda el porcentaje que se pactó con esa marca ese mes. Si la contabilidad lo      │
 * │ leyera de una constante, cambiar la tarifa reescribiría el histórico y lo que se enseña aquí  │
 * │ dejaría de cuadrar con las facturas ya emitidas.                                               │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Lo demás:
 *  - KEYSET, nunca OFFSET: la lista crece sola y es la regla del repositorio.
 *  - ESTA PANTALLA NO MUEVE DINERO: el servicio solo lee. Un `update` aquí sería una segunda
 *    verdad sobre el mismo dinero.
 *  - EL EXPORT DE GANADORES usa el importe CONGELADO del resultado, no el premio del reto (que el
 *    admin puede editar después), y lleva el TIPO en columnas SEPARADAS: patrocinado, solo-VIP y
 *    nivel mínimo son ejes ortogonales y un reto puede ser los tres.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";
import { cerrarRetoVencido } from "../src/server/services/cierre-reto";
import {
  exportarGanadores,
  exportarPatrocinios,
  listarPatrocinios,
} from "../src/server/services/patrocinios";
import { generarPublicCode } from "../src/server/services/reto-codigo";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

let prisma: PrismaClient;
let adminId: string;
let n = 0;

const DIA = 86_400_000;

beforeAll(() => {
  prisma = createTestPrisma();
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
  n = 0;
  adminId = await crearUsuario(prisma, { username: "la_admin_sponsor" });
});

async function crearReto(opts: {
  premio: number;
  patrocinado?: boolean;
  marca?: string;
  bps?: number;
  soloVip?: boolean;
  nivelMinimo?: string;
  vencido?: boolean;
  creadoHaceMs?: number;
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
      startsAt: new Date(Date.now() - DIA),
      deadline: new Date(Date.now() + (opts.vencido ? -3_600_000 : 30 * DIA)),
      createdById: adminId,
      esPatrocinado: opts.patrocinado ?? false,
      ...(opts.patrocinado ? { sponsorNombre: opts.marca ?? "Marca S.A." } : {}),
      ...(opts.bps === undefined ? {} : { comisionBps: opts.bps }),
      soloVip: opts.soloVip ?? false,
      ...(opts.nivelMinimo ? { nivelMinimo: opts.nivelMinimo } : {}),
      ...(opts.creadoHaceMs ? { createdAt: new Date(Date.now() - opts.creadoHaceMs) } : {}),
    },
    select: { id: true },
  });
  return r.id;
}

/** Una participación publicada: lo que el cierre mira para decidir el ganador. */
async function participar(challengeId: string, votos: number): Promise<string> {
  const userId = await crearUsuario(prisma);
  n += 1;
  const video = await prisma.video.create({
    data: { userId, bunnyVideoId: `g-${n}-${Date.now()}`, status: "PUBLISHED" },
    select: { id: true },
  });
  await prisma.submission.create({
    data: { challengeId, userId, videoId: video.id, status: "PUBLISHED", voteCount: votos },
  });
  return userId;
}

describe("la lista de patrocinios", () => {
  it("solo trae los patrocinados, con premio, comisión y total", async () => {
    await crearReto({ premio: 100_000, patrocinado: true, marca: "Nexus", bps: 2500 });
    await crearReto({ premio: 5_000 });

    const { filas } = await listarPatrocinios(prisma);

    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({
      marca: "Nexus",
      premioCents: 100_000,
      comisionBps: 2500,
      comisionCents: 25_000,
      totalCents: 125_000,
      cerrado: false,
    });
  });

  it("y la comisión sale del % DE CADA RETO, no de uno común", async () => {
    await crearReto({ premio: 100_000, patrocinado: true, marca: "Cara", bps: 3000 });
    await crearReto({ premio: 100_000, patrocinado: true, marca: "Barata", bps: 1000 });

    const { filas } = await listarPatrocinios(prisma);
    const porMarca = new Map(filas.map((f) => [f.marca, f.comisionCents]));

    expect(porMarca.get("Cara")).toBe(30_000);
    expect(porMarca.get("Barata")).toBe(10_000);
  });

  it("pagina por KEYSET: la segunda página sigue donde acabó la primera, sin repetir", async () => {
    // Creados con fechas distintas: el cursor es la tupla `(createdAt, id)`.
    for (let i = 0; i < 5; i++) {
      await crearReto({
        premio: 1000 * (i + 1),
        patrocinado: true,
        marca: `Marca ${i}`,
        creadoHaceMs: i * 60_000,
      });
    }

    const p1 = await listarPatrocinios(prisma, { limite: 2 });
    expect(p1.filas).toHaveLength(2);
    expect(p1.proximoCursor).not.toBeNull();

    const p2 = await listarPatrocinios(prisma, { limite: 2, cursor: p1.proximoCursor });
    const ids = [...p1.filas, ...p2.filas].map((f) => f.id);
    expect(new Set(ids).size, "una fila sale en las dos páginas").toBe(ids.length);

    const p3 = await listarPatrocinios(prisma, { limite: 2, cursor: p2.proximoCursor });
    expect(p3.filas).toHaveLength(1);
    expect(p3.proximoCursor, "la última página dice que no hay más").toBeNull();
  });

  it("un cursor manipulado no revienta: vuelve a la primera página", async () => {
    await crearReto({ premio: 1000, patrocinado: true });
    const p = await listarPatrocinios(prisma, { cursor: "no-es-un-cursor" });
    expect(p.filas).toHaveLength(1);
  });

  it("y leer la contabilidad NO escribe nada", async () => {
    const reto = await crearReto({ premio: 100_000, patrocinado: true, bps: 2500 });
    const antes = await prisma.challenge.findUniqueOrThrow({ where: { id: reto } });

    await listarPatrocinios(prisma);
    await exportarPatrocinios(prisma);

    const despues = await prisma.challenge.findUniqueOrThrow({ where: { id: reto } });
    expect(despues.updatedAt.getTime()).toBe(antes.updatedAt.getTime());
    expect(await prisma.walletLedger.count()).toBe(0);
    expect(await prisma.auditLog.count(), "el servicio audita por su cuenta").toBe(0);
  });
});

describe("el CSV de patrocinios", () => {
  it("lleva la cabecera, el total y el % como número", async () => {
    await crearReto({ premio: 100_000, patrocinado: true, marca: "Nexus", bps: 2550 });

    const r = await exportarPatrocinios(prisma);

    expect(r.filas).toBe(1);
    expect(r.truncada).toBe(false);
    const [cabecera, fila] = r.csv.split("\r\n");
    expect(cabecera).toContain("total_a_cobrar");
    expect(fila).toContain("Nexus");
    expect(fila).toContain("1000.00"); // premio
    expect(fila).toContain("25.5"); // el % como número, usable en una hoja
    expect(fila).toContain("255.00"); // comisión
    expect(fila).toContain("1255.00"); // total
  });

  it("y escapa una marca con coma y comilla", async () => {
    // Los dos caracteres que parten un CSV mal escapado, en un campo que escribe una persona.
    await crearReto({ premio: 1000, patrocinado: true, marca: 'Ruiz, S.L. "la buena"' });
    const r = await exportarPatrocinios(prisma);
    expect(r.csv).toContain('"Ruiz, S.L. ""la buena"""');
  });
});

describe("el CSV de ganadores", () => {
  it("el importe es el CONGELADO del resultado, no el premio editado después", async () => {
    const reto = await crearReto({ premio: 2500, patrocinado: true, vencido: true });
    const ganador = await participar(reto, 3);
    await cerrarRetoVencido(prisma, reto);
    // La marca renegocia el premio DESPUÉS del cierre: lo que se pagó ya está decidido.
    await prisma.challenge.update({ where: { id: reto }, data: { prizeAmountCents: 99_999 } });

    const r = await exportarGanadores(prisma);

    expect(r.filas).toBe(1);
    const fila = r.csv.split("\r\n")[1]!;
    expect(fila, "el CSV usa el premio actual en vez del congelado").toContain("25.00");
    expect(fila).not.toContain("999.99");
    const usuario = await prisma.user.findUniqueOrThrow({ where: { id: ganador } });
    expect(fila).toContain(usuario.username!);
  });

  it("el TIPO va en columnas SEPARADAS: un reto puede ser las tres cosas", async () => {
    const reto = await crearReto({
      premio: 10_000,
      patrocinado: true,
      marca: "Nexus",
      bps: 2500,
      soloVip: true,
      nivelMinimo: "pro",
      vencido: true,
    });
    const ganador = await participar(reto, 1);
    // El ganador tiene que alcanzar el nivel, o no habría participación válida que premiar.
    await prisma.user.update({ where: { id: ganador }, data: { pointsBalance: 100_000 } });
    await cerrarRetoVencido(prisma, reto);

    const r = await exportarGanadores(prisma);
    const cabecera = r.csv.split("\r\n")[0]!;
    const fila = r.csv.split("\r\n")[1]!;

    // Tres columnas, no una "tipo" que obligue a elegir una y perder las otras dos.
    for (const col of ["patrocinado", "sponsor", "comision", "solo_vip", "nivel_minimo"]) {
      expect(cabecera, `falta la columna ${col}`).toContain(col);
    }
    expect(fila).toContain("Nexus");
    expect(fila).toContain("pro");
    // patrocinado=si y solo_vip=si, los dos a la vez.
    expect(fila.split(",").filter((c) => c === "si").length).toBe(2);
    expect(fila).toContain("25.00"); // la comisión del reto
  });

  it("y en un reto NORMAL la comisión va VACÍA, no a cero", async () => {
    // Un 0 en una columna de dinero se suma; un hueco, no.
    const reto = await crearReto({ premio: 5_000, vencido: true });
    await participar(reto, 2);
    await cerrarRetoVencido(prisma, reto);

    const fila = (await exportarGanadores(prisma)).csv.split("\r\n")[1]!;
    const columnas = fila.split(",");
    // ...,patrocinado,sponsor,comision,solo_vip,nivel_minimo
    expect(columnas.at(-5)).toBe("no"); // patrocinado
    expect(columnas.at(-4)).toBe(""); // sponsor
    expect(columnas.at(-3)).toBe(""); // comision
    expect(columnas.at(-2)).toBe("no"); // solo_vip
    expect(columnas.at(-1)).toBe("rookie");
  });
});
