/**
 * A UNA EMPRESA NO SE LE CUENTA CÓMO SE REPARTE EL DINERO DENTRO DE DAREFLASH (Fase 9 · P3).
 *
 * Regla del analista: en NINGUNA pantalla, correo ni texto dirigido a una empresa aparecen
 * «comisión», «porcentaje» o «fee», ni un porcentaje junto a un importe, ni el desglose premio +
 * comisión. A la empresa se le dice lo que paga (total) y que quien gane cobra el premio entero. El
 * desglose vive solo en el panel.
 *
 * Censo de las CUATRO vías por las que algo le llega a una empresa:
 *  1. EL CÓDIGO DEL PORTAL (`src/app/(app)/(shell)/empresa/**`), sin comentarios: un comentario que
 *     EXPLICA la regla no le llega a nadie.
 *  2. LOS TEXTOS QUE ESE PORTAL PINTA desde `constants` (estado, motivos, pago, etiquetas).
 *  3. LOS CORREOS que se le escriben (decisión de su propuesta, de su verificación, el aviso de cuenta
 *     existente), generados DE VERDAD contra la base de datos y leídos de la cola.
 *  4. LOS DTO que viajan al portal: sus CLAVES (con igualdad exacta) y sus VALORES.
 *
 * Para romperlo a propósito: volver a pintar `comisionBps` en el extracto (rojo el 1); poner
 * «comisión» en `MSG_PAGO_PATROCINIO` (rojo el 2); añadir el desglose al correo de aprobación (rojo
 * el 3); añadir `comisionCents` a `extractoDeEmpresa` (rojo el 4).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import * as C from "../src/config/constants";
import type { PrismaClient } from "../src/generated/prisma/client";
import { extractoDeEmpresa } from "../src/server/services/patrocinios";
import { avisarCuentaExistente } from "../src/server/services/aviso-cuenta-existente";
import { rechazarEmpresa, verificarEmpresa } from "../src/server/services/empresas";
import {
  aprobarSolicitudReto,
  caducarPropuestasVencidas,
  crearSolicitudReto,
  misSolicitudesReto,
  rechazarSolicitudReto,
  solicitudRetoSchema,
} from "../src/server/services/retos-empresa";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

/**
 * LO PROHIBIDO de cara a una empresa. `%` junto a una cifra (o junto a un `{…}` de JSX que la pinte)
 * es "el 25 %"; `bps` es el nombre del campo en puntos básicos.
 */
// `%\s*\d(?![0-9a-f])`: un `%` seguido de cifra, PERO NO una codificación de URL (`%2F`, `%3D`…),
// que es lo que hay en un `?siguiente=%2Fempresa`. La lleva el control de abajo.
const PROHIBIDO = /comisi|porcentaje|\bfee\b|\d\s*%|%\s*\d(?![0-9a-f])|\}\s*%|bps/i;

const RAIZ = path.resolve(__dirname, "..");
const soloCodigo = (s: string) =>
  s.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "").replace(/^\s*\/\/.*$/gm, "");

function fuentes(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) return fuentes(p);
    return /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}

// ---------------------------------------------------------------------------------------------------
// 1 y 2. El portal y sus textos
// ---------------------------------------------------------------------------------------------------

describe("el portal no habla de comisiones", () => {
  it("el código del portal (sin comentarios)", () => {
    const portal = path.join(RAIZ, "src", "app", "(app)", "(shell)", "empresa");
    const culpables = fuentes(portal)
      .filter((f) => PROHIBIDO.test(soloCodigo(readFileSync(f, "utf8"))))
      .map((f) => path.relative(RAIZ, f));
    expect(culpables).toEqual([]);
  });

  it("los textos de constants que el portal y sus correos enseñan", () => {
    const textos: Record<string, string> = {
      MSG_PAGO_PATROCINIO: C.MSG_PAGO_PATROCINIO,
      MSG_EMPRESA_SOLO_MIRA: C.MSG_EMPRESA_SOLO_MIRA,
      MSG_CUENTA_EMPRESA_NO_PARTICIPA: C.MSG_CUENTA_EMPRESA_NO_PARTICIPA,
      ...Object.fromEntries(
        Object.entries(C.MSG_ESTADO_SOLICITUD).map(([k, v]) => [`MSG_ESTADO_SOLICITUD.${k}`, v]),
      ),
      ...Object.fromEntries(
        Object.entries(C.ETIQUETA_ESTADO_SOLICITUD).map(([k, v]) => [
          `ETIQUETA_ESTADO_SOLICITUD.${k}`,
          v,
        ]),
      ),
      ...Object.fromEntries(
        Object.entries(C.MSG_MOTIVO_RECHAZO_RETO).map(([k, v]) => [
          `MSG_MOTIVO_RECHAZO_RETO.${k}`,
          v,
        ]),
      ),
      ...Object.fromEntries(
        Object.entries(C.MSG_MOTIVO_RECHAZO_EMPRESA).map(([k, v]) => [
          `MSG_MOTIVO_RECHAZO_EMPRESA.${k}`,
          v,
        ]),
      ),
      ...Object.fromEntries(
        Object.entries(C.MSG_ESTADO_EMPRESA).map(([k, v]) => [
          `MSG_ESTADO_EMPRESA.${k}`,
          `${v.titulo} ${v.cuerpo}`,
        ]),
      ),
    };
    const culpables = Object.entries(textos)
      .filter(([, v]) => PROHIBIDO.test(v))
      .map(([k]) => k);
    expect(culpables).toEqual([]);
  });

  it("el detector muerde (control): con «comisión» o «25 %» dentro, salta", () => {
    expect(PROHIBIDO.test("El premio y nuestra comisión")).toBe(true);
    expect(PROHIBIDO.test("$150.00 + 25% = $187.50")).toBe(true);
    expect(PROHIBIDO.test("{f.comisionBps / 100}%")).toBe(true);
    expect(PROHIBIDO.test("% 25 de comisión")).toBe(true);
    expect(PROHIBIDO.test("Total a pagar: $187.50")).toBe(false);
    // Una URL codificada no es un porcentaje.
    expect(PROHIBIDO.test('redirect("/entrar?siguiente=%2Fempresa%2Fcuenta")')).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------------
// 3 y 4. Los correos y los DTO, contra la base de datos de verdad
// ---------------------------------------------------------------------------------------------------

let prisma: PrismaClient;
let admin: string;
const APP_URL = "https://dareflash.test";
const AHORA = new Date("2026-11-05T12:00:00.000Z");
const DIA = 24 * 60 * 60 * 1000;

beforeAll(() => {
  prisma = createTestPrisma();
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
  admin = await crearUsuario(prisma, { username: "admin_sin_comisiones" });
});

async function unaEmpresa(estado = "VERIFICADA") {
  const userId = await crearUsuario(prisma);
  const email = "lucia@laespiga.test";
  await prisma.user.update({ where: { id: userId }, data: { email, esCuentaEmpresa: true } });
  const e = await prisma.empresa.create({
    data: {
      ownerUserId: userId,
      nombre: "Panadería La Espiga",
      tipoCuenta: "EMPRESA",
      tipoNegocio: "FISICO",
      estado,
      paisIso: "ES",
      personaContacto: "Lucía",
    },
    select: { id: true },
  });
  return { empresaId: e.id, email };
}

const proponer = async (empresaId: string, premio = 15000) =>
  (
    await crearSolicitudReto(prisma, {
      empresaId,
      datos: solicitudRetoSchema(AHORA).parse({
        title: "Pan de masa madre",
        category: "fitness",
        prizeAmountCents: premio,
        startsAt: new Date(AHORA.getTime() + DIA),
        deadline: new Date(AHORA.getTime() + 10 * DIA),
        winnersCount: 1,
      }),
      aviso: { adminEmail: null, urlPanel: `${APP_URL}/panel/propuestas` },
      ahora: AHORA,
    })
  ).id;

/** Todo lo que la cola tiene para la empresa: asunto, texto y el HTML sin etiquetas ni estilos. */
async function correosA(email: string): Promise<string[]> {
  const jobs = await prisma.job.findMany();
  return jobs
    .map((j) => j.payload as { to?: string; subject?: string; text?: string; html?: string })
    .filter((p) => p.to === email)
    .map((p) =>
      [
        p.subject ?? "",
        p.text ?? "",
        (p.html ?? "").replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " "),
      ].join("\n"),
    );
}

describe("los correos a una empresa no hablan de comisiones", () => {
  it("la aprobación y el rechazo de su reto", async () => {
    const { empresaId, email } = await unaEmpresa();
    await aprobarSolicitudReto(prisma, {
      solicitudId: await proponer(empresaId),
      actorId: admin,
      appUrl: APP_URL,
      ahora: AHORA,
    });
    await rechazarSolicitudReto(prisma, {
      solicitudId: await proponer(empresaId),
      actorId: admin,
      motivo: "PREMIO_NO_ADECUADO",
      appUrl: APP_URL,
      ahora: AHORA,
    });
    const correos = await correosA(email);
    expect(correos).toHaveLength(2);
    for (const c of correos) expect(c).not.toMatch(PROHIBIDO);
    // Y el de aprobación cuenta lo que promete el copy: el pago se organiza y se publica al recibirlo.
    expect(correos.join("\n")).toMatch(/organizar el pago/);
    expect(correos.join("\n")).toMatch(/en cuanto lo recibamos/);
  });

  it("la verificación, el rechazo de la empresa y el aviso de cuenta existente", async () => {
    const { empresaId, email } = await unaEmpresa("PENDIENTE");
    await verificarEmpresa(prisma, { empresaId, actorId: admin, appUrl: APP_URL });
    const otra = await unaEmpresaOtra();
    await rechazarEmpresa(prisma, {
      empresaId: otra.empresaId,
      actorId: admin,
      motivo: "DATOS_INSUFICIENTES",
      appUrl: APP_URL,
    });
    await avisarCuentaExistente(prisma, {
      email,
      motivo: "EMPRESA",
      appUrl: APP_URL,
      ahora: AHORA,
    });
    const correos = [...(await correosA(email)), ...(await correosA(otra.email))];
    expect(correos.length).toBeGreaterThanOrEqual(3);
    for (const c of correos) expect(c).not.toMatch(PROHIBIDO);
  });
});

async function unaEmpresaOtra() {
  const userId = await crearUsuario(prisma);
  const email = "otra@empresa.test";
  await prisma.user.update({ where: { id: userId }, data: { email, esCuentaEmpresa: true } });
  const e = await prisma.empresa.create({
    data: {
      ownerUserId: userId,
      nombre: "Otra SL",
      tipoCuenta: "EMPRESA",
      tipoNegocio: "ONLINE",
      estado: "PENDIENTE",
      paisIso: "ES",
      personaContacto: "Ana",
    },
    select: { id: true },
  });
  return { empresaId: e.id, email };
}

describe("el aviso de propuesta caducada tampoco habla de dinero", () => {
  it("el correo que manda el barrido", async () => {
    const { empresaId, email } = await unaEmpresa();
    await proponer(empresaId);
    // Pasado el cierre propuesto (10 días): el barrido la caduca y avisa.
    await caducarPropuestasVencidas(prisma, {
      ahora: new Date(AHORA.getTime() + 11 * DIA),
      appUrl: APP_URL,
    });
    const correos = await correosA(email);
    expect(correos).toHaveLength(1);
    expect(correos[0]).not.toMatch(PROHIBIDO);
    expect(correos[0]).toMatch(/caducado/i);
  });
});

describe("los DTO del portal no llevan campos de comisión", () => {
  it("el extracto: dos cifras por reto, y las claves exactas", async () => {
    const { empresaId } = await unaEmpresa();
    await aprobarSolicitudReto(prisma, {
      solicitudId: await proponer(empresaId, 15000),
      actorId: admin,
      appUrl: APP_URL,
      ahora: AHORA,
    });
    const e = await extractoDeEmpresa(prisma, empresaId);
    expect(e.filas).toHaveLength(1);
    expect(Object.keys(e.filas[0]!).sort()).toEqual(
      ["cerrado", "deadlineMs", "id", "moneda", "premioCents", "titulo", "totalCents"].sort(),
    );
    expect(Object.keys(e.totales).sort()).toEqual(
      ["moneda", "premiosCents", "retos", "totalCents"].sort(),
    );
    expect(JSON.stringify(e)).not.toMatch(/comisi|bps|fee/i);
    // El total a pagar es el MISMO que el panel factura (misma consulta): premio + lo de DareFlash.
    expect(e.filas[0]!.totalCents).toBeGreaterThan(e.filas[0]!.premioCents);
  });

  it("sus propuestas: ninguna clave ni valor de comisión", async () => {
    const { empresaId } = await unaEmpresa();
    await proponer(empresaId);
    const { items } = await misSolicitudesReto(prisma, empresaId);
    for (const s of items) {
      expect(Object.keys(s).join(",")).not.toMatch(/comisi|bps|fee/i);
      expect(JSON.stringify(s)).not.toMatch(/comisi|bps|fee/i);
    }
  });
});
