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
 *  - EL TOTAL GENERAL (agregado en SQL) cuenta TODAS las filas, las mismas que la tabla, redondea
 *    igual que `lib/comision` —hay un bloque entero de reconciliación— y declara su moneda.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";
import { comisionCents, totalSponsorCents } from "../src/lib/comision";
import { cerrarRetoVencido } from "../src/server/services/cierre-reto";
import {
  exportarGanadores,
  exportarPatrocinios,
  listarPatrocinios,
  totalesPatrocinios,
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
  moneda?: string;
}): Promise<string> {
  n += 1;
  const r = await prisma.challenge.create({
    data: {
      title: `Reto ${n}`,
      slug: `reto-${n}`,
      publicCode: generarPublicCode(),
      category: "fitness",
      status: "PUBLISHED",
      prizeCurrency: opts.moneda ?? "USD",
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

/**
 * EL TOTAL GENERAL — el de TODO el conjunto, no el de la página.
 *
 * ┌─ POR QUÉ ESTE BLOQUE EXISTE ────────────────────────────────────────────────────────────────┐
 * │ Un total que suma solo lo que se ve diría 3.000 donde hay 30.000: una cifra plausible, en    │
 * │ grande, encima de una tabla — y es la que alguien copia a una factura. Lo que se fija aquí   │
 * │ es que el total mira TODAS las filas y que cuenta LAS MISMAS que la tabla.                    │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
describe("el total general", () => {
  it("incluye retos que NO caben en una página", async () => {
    for (let i = 0; i < 5; i++) {
      await crearReto({ premio: 10_000, patrocinado: true, bps: 2500, creadoHaceMs: i * 60_000 });
    }

    const pagina = await listarPatrocinios(prisma, { limite: 2 });
    const totales = await totalesPatrocinios(prisma);

    expect(pagina.filas).toHaveLength(2);
    // Si el total se calculara sobre la página, serían 20.000 y 5.000.
    expect(totales.retos).toBe(5);
    expect(totales.premiosCents).toBe(50_000);
    expect(totales.comisionCents).toBe(12_500);
    expect(totales.totalCents).toBe(62_500);
  });

  it("y cuenta LAS MISMAS filas que la tabla: solo patrocinados", async () => {
    await crearReto({ premio: 10_000, patrocinado: true });
    await crearReto({ premio: 90_000 });
    await crearReto({ premio: 70_000, soloVip: true });

    const totales = await totalesPatrocinios(prisma);
    const { filas } = await listarPatrocinios(prisma);

    expect(totales.retos).toBe(filas.length);
    expect(totales.premiosCents).toBe(10_000);
  });

  it("sin ningún patrocinado, todo a cero (y no `null`)", async () => {
    await crearReto({ premio: 5_000 });
    expect(await totalesPatrocinios(prisma)).toEqual({
      retos: 0,
      premiosCents: 0,
      comisionCents: 0,
      totalCents: 0,
      // Sin filas no hay moneda que declarar, y el cero no necesita una.
      moneda: null,
      monedas: 0,
    });
  });

  it("los importes son enteros: ni un decimal se escapa del agregado", async () => {
    await crearReto({ premio: 999, patrocinado: true, bps: 2500 });
    const t = await totalesPatrocinios(prisma);
    const numeros = Object.entries(t).filter(([, v]) => typeof v === "number");
    for (const [k, v] of numeros) {
      expect(Number.isInteger(v), `${k} = ${v}`).toBe(true);
    }
    // El bucle recorre lo que haya, así que si un día no hubiera cifras pasaría igual de verde.
    expect(numeros.length, "el agregado ha dejado de devolver cifras").toBe(5);
  });
});

/**
 * LA MONEDA DEL TOTAL — porque un número grande sin moneda vale para cualquiera.
 *
 * ┌─ Y PORQUE DOS MONEDAS NO SE SUMAN ──────────────────────────────────────────────────────────┐
 * │ Hoy todo el producto cobra en una sola moneda, así que esto nunca se dispara. Pero el día    │
 * │ que una marca pague en otra, `SUM(prizeAmountCents)` NO fallaría: devolvería un entero       │
 * │ perfectamente plausible que no es dinero —la misma trampa por la que el cierre se niega a    │
 * │ acreditar un premio congelado en otra moneda—. El agregado cuenta las monedas distintas y la │
 * │ pantalla se calla el total en vez de inventarse un cambio.                                    │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
describe("la moneda del total", () => {
  it("con una sola moneda, el total la DICE", async () => {
    await crearReto({ premio: 10_000, patrocinado: true, bps: 2500 });
    await crearReto({ premio: 20_000, patrocinado: true, bps: 2500 });

    const t = await totalesPatrocinios(prisma);

    expect(t.monedas).toBe(1);
    expect(t.moneda).toBe("USD");
    expect(t.totalCents).toBe(37_500);
  });

  it("con dos monedas NO hay total: `moneda` se queda en `null`", async () => {
    await crearReto({ premio: 10_000, patrocinado: true, bps: 2500 });
    await crearReto({ premio: 20_000, patrocinado: true, bps: 2500, moneda: "EUR" });

    const t = await totalesPatrocinios(prisma);

    expect(t.monedas, "el agregado no se ha enterado de que hay dos monedas").toBe(2);
    expect(t.moneda, "con dos monedas, elegir una sería etiquetar mal la suma").toBeNull();
    // La suma SE CALCULA igual (no se puede devolver `null` sin inventar otro contrato), y por eso
    // quien la pinta tiene que mirar `monedas` antes. Lo fija el test de la pantalla, abajo.
    expect(t.retos).toBe(2);
  });

  it("y la moneda del total es la MISMA que la de las filas", async () => {
    await crearReto({ premio: 10_000, patrocinado: true, bps: 2500, moneda: "EUR" });

    const t = await totalesPatrocinios(prisma);
    const fila = (await listarPatrocinios(prisma)).filas[0]!;

    expect(t.moneda).toBe(fila.moneda);
  });
});

/**
 * LA PANTALLA NO SUMA LO QUE NO SE PUEDE SUMAR.
 *
 * Estructural, no de píxeles: el servicio puede contar bien las monedas y la vista pintar el total
 * igual. Lo que se fija es que la cifra grande esté DENTRO de la rama que ya comprobó que hay una
 * sola moneda — y que el total lleve la moneda pegada, como cada fila de la tabla.
 */
describe("la vista del total", () => {
  const PAGINA = readFileSync(
    join(process.cwd(), "src", "app", "panel", "patrocinios", "page.tsx"),
    "utf8",
  );
  // Sobre el CÓDIGO: un comentario que explique la rama no es la rama.
  const CODIGO = PAGINA.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "").replace(/^\s*\/\/.*$/gm, "");

  it("mira cuántas monedas hay ANTES de pintar la cifra", () => {
    const rama = CODIGO.indexOf("totales.monedas > 1");
    const cifra = CODIGO.indexOf("totales.totalCents");

    expect(rama, "ha desaparecido la rama que comprueba la moneda").toBeGreaterThanOrEqual(0);
    expect(cifra, "ya no se pinta el total").toBeGreaterThanOrEqual(0);
    expect(cifra, "el total se pinta fuera de la comprobación de moneda").toBeGreaterThan(rama);
  });

  it("y el total lleva su moneda, como cada fila de la tabla", () => {
    // `(?!s)` NO es decorativo: `totales.monedas` —la rama de arriba— contiene `totales.moneda`,
    // así que un `toContain` se pondría verde con la etiqueta borrada. Pasó al escribir el test.
    expect(CODIGO, "el total se pinta sin decir en qué moneda está").toMatch(
      /totales\.moneda(?!s)/,
    );
  });
});

/**
 * LA RECONCILIACIÓN — el candado contra la desincronización.
 *
 * El total se agrega en SQL (`DIV`) y las filas se calculan en TypeScript (`Math.floor`). Son dos
 * implementaciones del mismo redondeo, y dos implementaciones se separan: basta cambiar una. Lo que
 * impide que eso pase en silencio es este bloque, que compara las dos sobre las MISMAS filas.
 *
 * SUMAR AL FINAL NO ES LO MISMO QUE SUMAR REDONDEADOS: con `/` en vez de `DIV`, el SQL sumaría
 * fracciones y redondearía una vez, y el total se separaría de lo que suman las facturas por unos
 * céntimos —sin que nada falle—. Por eso los premios de la fixture son NO REDONDOS a propósito: con
 * importes que dividen exacto, los dos caminos coinciden aunque uno esté mal.
 */
describe("el total SQL y `lib/comision` dicen lo mismo", () => {
  it("fila a fila, con premios y porcentajes que no dividen exacto", async () => {
    const casos = [
      { premio: 999, bps: 2500 }, // 249,75 -> 249
      { premio: 1, bps: 2500 }, // 0,25 -> 0
      { premio: 333, bps: 3333 }, // 110,9889 -> 110
      { premio: 100_001, bps: 1750 }, // 17.500,175 -> 17.500
      { premio: 7, bps: 9_999 }, // 6,9993 -> 6
    ];
    for (const c of casos) {
      await crearReto({ premio: c.premio, patrocinado: true, bps: c.bps });
    }

    const totales = await totalesPatrocinios(prisma);

    // La verdad de referencia es `lib/comision`, la misma función que usa el formulario al pactar
    // y la tabla al pintar. El SQL tiene que coincidir con ella, no al revés.
    const esperadoComision = casos.reduce((a, c) => a + comisionCents(c.premio, c.bps), 0);
    const esperadoPremios = casos.reduce((a, c) => a + c.premio, 0);

    expect(totales.comisionCents, "el agregado SQL se ha separado de `lib/comision`").toBe(
      esperadoComision,
    );
    expect(totales.premiosCents).toBe(esperadoPremios);
    expect(totales.totalCents).toBe(
      casos.reduce((a, c) => a + totalSponsorCents(c.premio, c.bps), 0),
    );
  });

  it("y coincide también con lo que pinta la TABLA, fila a fila", async () => {
    // El tercer camino: lo que el admin ve en cada línea. Los tres tienen que cuadrar o la suma de
    // la pantalla no sería la suma de la pantalla.
    for (const [premio, bps] of [
      [999, 2500],
      [12_345, 1234],
      [50_000, 2500],
    ] as const) {
      await crearReto({ premio, patrocinado: true, bps });
    }

    const { filas } = await listarPatrocinios(prisma);
    const totales = await totalesPatrocinios(prisma);

    expect(filas.reduce((a, f) => a + f.comisionCents, 0)).toBe(totales.comisionCents);
    expect(filas.reduce((a, f) => a + f.totalCents, 0)).toBe(totales.totalCents);
  });

  it("una fila con datos imposibles no separa los dos caminos", async () => {
    // `comisionBps` negativo no lo deja entrar el schema, pero sí un arreglo a mano en la base.
    // `Math.floor` redondea hacia -infinito y `DIV` trunca hacia cero: con negativos, los dos
    // caminos darían cosas distintas si no se recortaran igual en los dos sitios.
    const id = await crearReto({ premio: 10_000, patrocinado: true, bps: 2500 });
    await prisma.$executeRaw`UPDATE \`Challenge\` SET \`comisionBps\` = -500 WHERE \`id\` = ${id}`;

    const totales = await totalesPatrocinios(prisma);
    const fila = (await listarPatrocinios(prisma)).filas[0]!;

    expect(totales.comisionCents).toBe(0);
    expect(fila.comisionCents).toBe(0);
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
