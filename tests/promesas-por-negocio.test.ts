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
 *  4. El censo: ninguna superficie que CONOCE el tipo de negocio (portal, panel, servicio del correo)
 *     llama a las frases sin él.
 *
 * Para romperlo a propósito: volver a «en tu ciudad» fijo en el regalo (rojo el 1 y el 3 para ONLINE);
 * quitar el `tipoNegocio` del correo o de la cabecera de «Nueva campaña» (rojo el 3 o el 4).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import * as c from "../src/config/constants";
import type { AlcancePublicidad, TipoNegocio } from "../src/config/constants";
import type { PrismaClient } from "../src/generated/prisma/client";
import { alcancesPermitidos } from "../src/lib/empresa";
import { verificarEmpresa } from "../src/server/services/empresas";

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
    const frase = c.fraseRegaloSocioFundador();
    expect(frase).toMatch(NOMBRA.CIUDAD);
    expect(frase).toMatch(NOMBRA.PAIS);
    expect(frase).toMatch(/online/i);
    expect(c.msgSocioFundador()).toContain(frase);
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

describe("el censo: donde se conoce el tipo, se pasa", () => {
  it("portal, panel de empresas y el servicio del correo no llaman a las frases sin tipo", () => {
    const donde = [
      ...ficheros(path.join(RAIZ, "src", "app", "(app)", "(shell)", "empresa")),
      ...ficheros(path.join(RAIZ, "src", "app", "panel", "empresas")),
      path.join(RAIZ, "src", "server", "services", "empresas.ts"),
    ];
    expect(donde.length).toBeGreaterThan(10);
    const sinTipo = donde
      .filter((f) =>
        /(?:fraseQueEsUnCredito|fraseRegaloSocioFundador)\(\s*\)/.test(
          soloCodigo(readFileSync(f, "utf8")),
        ),
      )
      .map((f) => path.relative(RAIZ, f));
    expect(sinTipo).toEqual([]);
  });

  it("y la cabecera de «Nueva campaña» la cuenta con SU tipo", () => {
    const pagina = soloCodigo(
      readFileSync(
        path.join(
          RAIZ,
          "src",
          "app",
          "(app)",
          "(shell)",
          "empresa",
          "publicidad",
          "nueva",
          "page.tsx",
        ),
        "utf8",
      ),
    );
    expect(pagina).toMatch(/fraseQueEsUnCredito\(empresa\?\.tipoNegocio\)/);
  });
});
