/**
 * LO QUE SE LE PROMETE A UNA EMPRESA ES LO QUE PUEDE COMPRAR (fallo real en producción, Fase 9).
 *
 * `ALCANCES_POR_NEGOCIO` es una decisión cerrada: el negocio FÍSICO compra ciudad o región; el ONLINE y
 * la MARCA, país o todo el mundo. El copy no la respetaba: la cabecera de «Nueva campaña» le contaba a
 * un negocio online lo que cuesta «una ciudad», y el correo de la verificación le regalaba «días
 * anunciándote en tu ciudad». Ninguna de las dos cosas puede comprarlas.
 *
 * Lo que se fija:
 *  1. Para CADA tipo de negocio, la tarifa (`fraseQueEsUnCredito`) y el regalo
 *     (`fraseRegaloSocioFundador`) nombran SOLO alcances que ese negocio puede comprar, y la tarifa
 *     los nombra TODOS.
 *  2. Las cifras salen de `CREDITOS_POR_DIA` y `SOCIO_FUNDADOR_CREDITOS`: se cambia la tabla y la frase
 *     cambia con ella.
 *  3. EL CORREO DE VERDAD (verificarEmpresa contra la BD), para un negocio de cada tipo.
 *  4. Olvidar el tipo NO COMPILA (parámetro obligatorio); las frases públicas, con su propio nombre,
 *     solo donde se ha decidido usarlas (censo de abajo).
 *  5. Un tipo guardado FUERA DEL CATÁLOGO (la columna es un String) no deshace la verificación: se
 *     completa con las frases públicas, queda en el log saneado, y el DTO lo da como `null`.
 *
 * Para romperlo a propósito: volver a «en tu ciudad» fijo en el regalo (rojo el 1 y el 3 para ONLINE);
 * quitar el `tipoNegocio` del correo (rojo el 3); volver a `as TipoNegocio` sin validar en el correo
 * (rojo el 5); usar `fraseCreditoPublica()` en otra pantalla del portal (rojo el censo).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import * as c from "../src/config/constants";
import type { AlcancePublicidad, TipoNegocio } from "../src/config/constants";
import type { PrismaClient } from "../src/generated/prisma/client";
import { alcancesPermitidos, tipoNegocioDe } from "../src/lib/empresa";
import { fichaEmpresa, miEmpresa, verificarEmpresa } from "../src/server/services/empresas";
import { campanaSchema, crearBorrador, PublicidadError } from "../src/server/services/publicidad";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

const TIPOS = c.TipoNegocioSchema.options;
const ALCANCES = Object.keys(c.CREDITOS_POR_DIA) as AlcancePublicidad[];

/** Cómo se reconoce en un texto que se habla de cada alcance. */
const NOMBRA: Record<AlcancePublicidad, RegExp> = {
  CIUDAD: /ciudad/i,
  ESTADO: /regi[oó]n/i,
  PAIS: /pa[ií]s/i,
  GLOBAL: /todo el mundo/i,
};

const prohibidos = (t: TipoNegocio) => ALCANCES.filter((a) => !alcancesPermitidos(t).includes(a));

/** Alcances que el texto menciona y el negocio NO puede comprar. */
const promesasDeMas = (texto: string, t: TipoNegocio) =>
  prohibidos(t).filter((a) => NOMBRA[a].test(texto));

describe("la tarifa y el regalo, por tipo de negocio", () => {
  it("el detector distingue (si no, el resto no prueba nada)", () => {
    expect(promesasDeMas("hasta 90 días anunciándote en tu ciudad", "ONLINE")).toEqual(["CIUDAD"]);
    expect(promesasDeMas("5 créditos por país y 15 en todo el mundo", "FISICO")).toEqual([
      "PAIS",
      "GLOBAL",
    ]);
    expect(TIPOS.length).toBeGreaterThanOrEqual(3);
  });

  it.each(TIPOS)("%s: la tarifa nombra TODOS sus alcances y ninguno más", (t) => {
    const frase = c.fraseQueEsUnCredito(t);
    expect(promesasDeMas(frase, t), frase).toEqual([]);
    for (const a of alcancesPermitidos(t)) {
      expect(frase, a).toMatch(NOMBRA[a]);
      expect(frase, a).toContain(String(c.CREDITOS_POR_DIA[a]));
    }
  });

  it.each(TIPOS)("%s: el regalo no promete un alcance que no puede comprar", (t) => {
    const frase = c.fraseRegaloSocioFundador(t);
    expect(promesasDeMas(frase, t), frase).toEqual([]);
    expect(frase).toContain(`${c.SOCIO_FUNDADOR_CREDITOS} créditos de publicidad`);
  });

  it("los días del regalo: en una ciudad para el local, en un país para el resto", () => {
    const n = c.SOCIO_FUNDADOR_CREDITOS;
    expect(c.fraseRegaloSocioFundador("FISICO")).toContain(
      `hasta ${Math.floor(n / c.CREDITOS_POR_DIA.CIUDAD)} días anunciándote en tu ciudad`,
    );
    for (const t of ["ONLINE", "MARCA_O_DIGITAL"] as const) {
      expect(c.fraseRegaloSocioFundador(t)).toContain(
        `hasta ${Math.floor(n / c.CREDITOS_POR_DIA.PAIS)} días anunciándote en un país`,
      );
    }
  });

  it("las cifras salen de la TABLA: se cambia y la frase cambia con ella", () => {
    const antes = { ...c.CREDITOS_POR_DIA };
    try {
      c.CREDITOS_POR_DIA.PAIS = 9;
      c.CREDITOS_POR_DIA.GLOBAL = 40;
      c.CREDITOS_POR_DIA.ESTADO = 3;
      expect(c.fraseQueEsUnCredito("ONLINE")).toBe(
        "Un día de campaña cuesta 9 créditos por país y 40 en todo el mundo, y se descuenta cada día que se muestra.",
      );
      expect(c.fraseQueEsUnCredito("FISICO")).toBe(
        `Un día de campaña cuesta ${antes.CIUDAD} ${antes.CIUDAD === 1 ? "crédito" : "créditos"} en una ciudad y 3 en una región, y se descuenta cada día que se muestra.`,
      );
      expect(c.fraseRegaloSocioFundador("ONLINE")).toContain(
        `hasta ${Math.floor(c.SOCIO_FUNDADOR_CREDITOS / 9)} días`,
      );
    } finally {
      Object.assign(c.CREDITOS_POR_DIA, antes);
    }
  });

  it("el aviso PÚBLICO (sin tipo, antes del alta) cuenta los dos casos, no solo «tu ciudad»", () => {
    const frase = c.fraseRegaloPublico();
    expect(frase).toMatch(NOMBRA.CIUDAD);
    expect(frase).toMatch(NOMBRA.PAIS);
    expect(frase).toMatch(/online/i);
    expect(c.msgSocioFundador("es")).toContain(frase);
  });

  it("el catálogo: todo tipo de negocio compra ALGO (una lista vacía dejaría sin frase ni producto)", () => {
    for (const t of TIPOS) expect(alcancesPermitidos(t).length, t).toBeGreaterThan(0);
  });

  it("leer el tipo guardado: lo del catálogo pasa; lo de fuera es `null`, no se cree", () => {
    for (const t of TIPOS) expect(tipoNegocioDe(t)).toBe(t);
    for (const raro of ["XYZ", "", "fisico", "ONLINE "]) expect(tipoNegocioDe(raro)).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------------
// El correo de la verificación, de verdad
// ---------------------------------------------------------------------------------------------------

describe("el correo de la verificación (con el regalo), por tipo de negocio", () => {
  let prisma: PrismaClient;
  beforeAll(() => {
    prisma = createTestPrisma();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });
  beforeEach(async () => {
    await resetDb(prisma);
  });

  it.each(TIPOS)("%s: el correo no promete un alcance que no puede comprar", async (t) => {
    const admin = await crearUsuario(prisma);
    const dueno = await crearUsuario(prisma);
    await prisma.user.update({
      where: { id: dueno },
      data: { email: `promesas-${t.toLowerCase()}@empresa.test`, esCuentaEmpresa: true },
    });
    const e = await prisma.empresa.create({
      data: {
        ownerUserId: dueno,
        nombre: "Tienda",
        tipoCuenta: "EMPRESA",
        tipoNegocio: t,
        estado: "PENDIENTE",
        paisIso: "ES",
        personaContacto: "Lucía",
      },
      select: { id: true },
    });
    // Antes del fin de Socios Fundadores: el correo LLEVA el regalo (es la frase que mentía).
    await verificarEmpresa(prisma, {
      empresaId: e.id,
      actorId: admin,
      appUrl: "https://dareflash.test",
      ahora: new Date("2026-11-05T12:00:00.000Z"),
    });
    const [job] = await prisma.job.findMany({
      where: { idempotencyKey: { startsWith: "empresa-decision:" } },
    });
    const { text, html } = job!.payload as { text: string; html: string };
    expect(text).toContain(`${c.SOCIO_FUNDADOR_CREDITOS} créditos de publicidad`);
    expect(promesasDeMas(text, t), text).toEqual([]);
    expect(promesasDeMas(html, t)).toEqual([]);
  });

  it("un tipo FUERA DEL CATÁLOGO no deshace la verificación: se completa y el correo lleva las frases públicas", async () => {
    // Antes: `as TipoNegocio` lo daba por bueno, `ALCANCES_POR_NEGOCIO["XYZ"]` era `undefined` y la
    // frase lanzaba DENTRO de la transacción: la empresa se quedaba sin verificar por culpa de un texto.
    const admin = await crearUsuario(prisma);
    const dueno = await crearUsuario(prisma);
    await prisma.user.update({
      where: { id: dueno },
      data: { email: "promesas-raro@empresa.test", esCuentaEmpresa: true },
    });
    const e = await prisma.empresa.create({
      data: {
        ownerUserId: dueno,
        nombre: "Tienda rara",
        tipoCuenta: "EMPRESA",
        tipoNegocio: "XYZ",
        estado: "PENDIENTE",
        paisIso: "ES",
        personaContacto: "Lucía",
      },
      select: { id: true },
    });
    const avisos: string[] = [];
    const espia = vi.spyOn(console, "warn").mockImplementation((m: unknown) => {
      avisos.push(String(m));
    });
    try {
      await verificarEmpresa(prisma, {
        empresaId: e.id,
        actorId: admin,
        appUrl: "https://dareflash.test",
        ahora: new Date("2026-11-05T12:00:00.000Z"),
      });
    } finally {
      espia.mockRestore();
    }
    // La verificación se COMPLETÓ: estado, regalo y correo.
    const fila = await prisma.empresa.findUniqueOrThrow({ where: { id: e.id } });
    expect(fila.estado).toBe("VERIFICADA");
    expect(fila.creditosSaldo).toBe(c.SOCIO_FUNDADOR_CREDITOS);
    const [job] = await prisma.job.findMany({
      where: { idempotencyKey: { startsWith: "empresa-decision:" } },
    });
    const { text } = job!.payload as { text: string };
    expect(text).toContain(c.fraseRegaloPublico());
    expect(text).toContain(c.fraseCreditoPublica());
    // Y queda apuntado en el log, SANEADO: el id, no el valor.
    expect(avisos.some((a) => a.includes(e.id))).toBe(true);
    expect(avisos.join("\n")).not.toContain("XYZ");
  });

  it("un tipo VÁLIDO con su lista de alcances vacía tampoco deshace nada ni dice «NaN días»", async () => {
    const catalogo = c.ALCANCES_POR_NEGOCIO as Record<TipoNegocio, readonly AlcancePublicidad[]>;
    const antes = catalogo.MARCA_O_DIGITAL;
    const admin = await crearUsuario(prisma);
    const dueno = await crearUsuario(prisma);
    await prisma.user.update({
      where: { id: dueno },
      data: { email: "promesas-vacio@empresa.test", esCuentaEmpresa: true },
    });
    const e = await prisma.empresa.create({
      data: {
        ownerUserId: dueno,
        nombre: "Una marca",
        tipoCuenta: "EMPRESA",
        tipoNegocio: "MARCA_O_DIGITAL",
        estado: "PENDIENTE",
        paisIso: "ES",
        personaContacto: "Lucía",
      },
      select: { id: true },
    });
    try {
      catalogo.MARCA_O_DIGITAL = [];
      await verificarEmpresa(prisma, {
        empresaId: e.id,
        actorId: admin,
        appUrl: "https://dareflash.test",
        ahora: new Date("2026-11-05T12:00:00.000Z"),
      });
    } finally {
      catalogo.MARCA_O_DIGITAL = antes;
    }
    expect((await prisma.empresa.findUniqueOrThrow({ where: { id: e.id } })).estado).toBe(
      "VERIFICADA",
    );
    const [job] = await prisma.job.findMany({
      where: { idempotencyKey: { startsWith: "empresa-decision:" } },
    });
    const { text } = job!.payload as { text: string };
    expect(text).toContain(c.fraseRegaloPublico());
    expect(text).not.toMatch(/NaN|undefined/);
  });

  it("crear una campaña con un tipo FUERA DEL CATÁLOGO es un rechazo claro, no un 500", async () => {
    const dueno = await crearUsuario(prisma);
    const e = await prisma.empresa.create({
      data: {
        ownerUserId: dueno,
        nombre: "Tienda rara",
        tipoCuenta: "EMPRESA",
        tipoNegocio: "XYZ",
        estado: "VERIFICADA",
        paisIso: "ES",
        personaContacto: "Lucía",
      },
      select: { id: true },
    });
    const datos = campanaSchema.parse({
      nombre: "Otoño",
      alcance: "PAIS",
      paises: "ES",
      texto: "Zapatillas para correr",
      destinoUrl: "https://tienda.example",
      fechaInicio: new Date().toISOString().slice(0, 10),
      dias: 3,
    });
    const avisos: string[] = [];
    const espia = vi.spyOn(console, "warn").mockImplementation((m: unknown) => {
      avisos.push(String(m));
    });
    let error: unknown;
    try {
      await crearBorrador(prisma, e.id, datos);
    } catch (x) {
      error = x;
    } finally {
      espia.mockRestore();
    }
    // Un rechazo ESPERABLE (la ruta lo traduce a 4xx con su frase), no un TypeError sin capturar.
    expect(error).toBeInstanceOf(PublicidadError);
    expect(error).toMatchObject({
      code: "TIPO_NEGOCIO_DESCONOCIDO",
      message: c.MSG_TIPO_NEGOCIO_DESCONOCIDO,
    });
    expect(await prisma.publicidad.count()).toBe(0);
    expect(avisos.some((a) => a.includes(e.id))).toBe(true);
    expect(avisos.join("\n")).not.toContain("XYZ");
  });

  it("el DTO del portal (y del panel) da un tipo fuera del catálogo como `null`, para que quien pinta decida", async () => {
    const dueno = await crearUsuario(prisma);
    const e = await prisma.empresa.create({
      data: {
        ownerUserId: dueno,
        nombre: "Tienda rara",
        tipoCuenta: "EMPRESA",
        tipoNegocio: "XYZ",
        estado: "VERIFICADA",
        paisIso: "ES",
        personaContacto: "Lucía",
      },
      select: { id: true },
    });
    const espia = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect((await miEmpresa(prisma, e.id))?.tipoNegocio).toBeNull();
      expect((await fichaEmpresa(prisma, e.id))?.tipoNegocio).toBeNull();
    } finally {
      espia.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------------------------------
// El censo
// ---------------------------------------------------------------------------------------------------

const RAIZ = path.resolve(__dirname, "..");
function ficheros(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) return ficheros(p);
    return /\.tsx?$/.test(n) ? [p] : [];
  });
}
const soloCodigo = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * OLVIDAR EL TIPO YA NO COMPILA: `fraseQueEsUnCredito` y `fraseRegaloSocioFundador` lo exigen, así que
 * ese censo lo hace `tsc` (en el pre-commit). Lo que queda por vigilar es lo contrario: que las frases
 * PÚBLICAS —las de quien no sabe qué negocio es— no se cuelen donde sí se sabe. Cada sitio que las usa
 * está aquí con su motivo; uno nuevo se pone rojo y obliga a decidirlo.
 */
const PUBLICAS_PERMITIDAS: Record<string, string> = {
  // Donde se definen (y `msgSocioFundador`, el aviso público, las compone).
  "src/config/constants.ts": "las define",
  // Superficie ANÓNIMA: el alta de empresa, antes de saber qué negocio es.
  "src/app/(app)/(shell)/empezar/empresa/page.tsx": "alta pública",
  // RESPALDOS DECIDIDOS: sin empresa resuelta (correo sin confirmar) o con un tipo fuera del catálogo.
  "src/app/(app)/(shell)/empresa/page.tsx": "respaldo: tipo fuera del catálogo",
  "src/app/(app)/(shell)/empresa/creditos/page.tsx": "respaldo: sin empresa o tipo raro",
  "src/app/(app)/(shell)/empresa/publicidad/nueva/page.tsx": "respaldo: sin empresa o tipo raro",
  "src/app/panel/empresas/creditos-empresa.tsx": "respaldo: tipo fuera del catálogo",
  "src/server/services/empresas.ts": "respaldo del correo: tipo fuera del catálogo",
};

/** El aviso de Socios Fundadores con los dos casos: SOLO en las superficies anónimas. */
const AVISO_PUBLICO_PERMITIDO = [
  "src/config/constants.ts",
  "src/app/(app)/(shell)/empezar/page.tsx",
  "src/app/(app)/(shell)/empezar/empresa/page.tsx",
  "src/app/(app)/(shell)/inicio/page.tsx",
];

describe("el censo de las frases PÚBLICAS", () => {
  const todos = ficheros(path.join(RAIZ, "src"))
    .filter((f) => !f.includes(`${path.sep}generated${path.sep}`))
    .map((f) => ({
      rel: path.relative(RAIZ, f).split(path.sep).join("/"),
      codigo: soloCodigo(readFileSync(f, "utf8")),
    }));

  it("las frases sin tipo solo donde se ha decidido usarlas", () => {
    const usan = todos
      .filter((f) => /\b(?:fraseCreditoPublica|fraseRegaloPublico)\(/.test(f.codigo))
      .map((f) => f.rel);
    expect(usan.length).toBeGreaterThanOrEqual(3);
    expect(usan.filter((r) => !(r in PUBLICAS_PERMITIDAS))).toEqual([]);
  });

  it("el tipo de negocio leído de la BD se valida en UN sitio: ningún `as TipoNegocio` en src/", () => {
    // La columna es un String; `tipoNegocioDe` es la única puerta. Un `as` se lo cree todo, y con un
    // valor raro dejó una verificación deshecha (el correo) y un 500 (crear una campaña).
    const conAs = todos.filter((f) => /\bas\s+TipoNegocio\b/.test(f.codigo)).map((f) => f.rel);
    expect(conAs).toEqual([]);
  });

  it("el aviso público de Socios Fundadores, solo en /empezar, /empezar/empresa e /inicio", () => {
    const usan = todos.filter((f) => /\bmsgSocioFundador\(/.test(f.codigo)).map((f) => f.rel);
    expect(usan.length).toBeGreaterThanOrEqual(3);
    expect(usan.filter((r) => !AVISO_PUBLICO_PERMITIDO.includes(r))).toEqual([]);
  });
});
