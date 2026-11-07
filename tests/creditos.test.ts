/**
 * CRÉDITOS DE PUBLICIDAD (Fase 9 · P4), contra la base de datos de verdad.
 *
 * Lo que se fija:
 *  1. EL PRIMITIVO: solo inserción, saldo = suma del ledger, idempotente, nunca negativo, y sin
 *     perder ni duplicar nada bajo CONCURRENCIA (diez a la vez sobre la misma empresa).
 *  2. EL REGALO DE SOCIO FUNDADOR: al verificarse a tiempo, en la transacción de la verificación, UNA
 *     vez por empresa aunque se rechace y se vuelva a verificar; el límite es inclusivo y en Madrid; y
 *     el correo de verificación lo cuenta.
 *  3. EL BACKFILL DE LA MIGRACIÓN, EJECUTADO: las ya verificadas a tiempo reciben su regalo, las demás
 *     no, re-ejecutarlo CONVERGE, y no se cruza con un regalo que ya diera la app. Más la coherencia
 *     de sus literales con las constantes (fecha, cifra, clave).
 *  4. EL AJUSTE DEL ADMIN: motivo obligatorio en la fila, `AuditLog` en la misma transacción, doble
 *     clic sin duplicar, y nunca por debajo de cero.
 *  5. LO QUE VE LA EMPRESA: su saldo y su historial por concepto, sin la nota del ajuste ni quién lo
 *     hizo (igualdad exacta de claves), y solo lo suyo.
 *  6. ESTRUCTURAL: el ledger de créditos no toca la tabla `User` (veto de deadlock) y en pantalla se
 *     llaman «créditos de publicidad», nunca «puntos».
 *
 * Para romperlo a propósito: escribir el saldo con un incremento sin FOR UPDATE (rojo la
 * concurrencia); quitar el regalo de `verificarEmpresa` (rojo el 2); usar una clave por verificación
 * en vez de por empresa (rojo el de rechazar y volver a verificar); cambiar la fecha del backfill
 * (rojo la coherencia); quitar el `AuditLog` del ajuste (rojo el 4); añadir `nota` al DTO del portal
 * (rojo el 5).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  SOCIO_FUNDADOR_CREDITOS,
  SOCIO_FUNDADOR_HASTA_ISO,
  claveRegaloSocioFundador,
} from "../src/config/constants";
import type { PrismaClient } from "../src/generated/prisma/client";
import { esSocioFundador } from "../src/lib/socio-fundador";
import {
  AjusteCreditosError,
  CreditosError,
  ajustarCreditosEmpresa,
  aplicarCreditos,
  misCreditos,
} from "../src/server/services/creditos";
import { rechazarEmpresa, verificarEmpresa } from "../src/server/services/empresas";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

let prisma: PrismaClient;
let admin: string;
const APP_URL = "https://dareflash.test";
const HASTA = new Date(SOCIO_FUNDADOR_HASTA_ISO);
const ANTES = new Date("2026-11-05T12:00:00.000Z");

beforeAll(() => {
  prisma = createTestPrisma();
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
  admin = await crearUsuario(prisma, { username: "admin_creditos" });
});

let n = 0;
async function unaEmpresa(estado = "PENDIENTE", verificadaEn: Date | null = null) {
  n += 1;
  const userId = await crearUsuario(prisma);
  const email = `empresa${n}@creditos.test`;
  await prisma.user.update({ where: { id: userId }, data: { email, esCuentaEmpresa: true } });
  const e = await prisma.empresa.create({
    data: {
      ownerUserId: userId,
      nombre: `Empresa ${n}`,
      tipoCuenta: "EMPRESA",
      tipoNegocio: "FISICO",
      estado,
      verificadaEn,
      paisIso: "ES",
      personaContacto: "Lucía",
    },
    select: { id: true },
  });
  return { empresaId: e.id, email };
}

/** El saldo guardado y la suma del ledger: tienen que ser SIEMPRE el mismo número. */
async function cuadra(empresaId: string) {
  const e = await prisma.empresa.findUniqueOrThrow({ where: { id: empresaId } });
  const suma = await prisma.creditoLedger.aggregate({
    where: { empresaId },
    _sum: { delta: true },
  });
  return { saldo: e.creditosSaldo, suma: suma._sum.delta ?? 0 };
}

// ---------------------------------------------------------------------------------------------------
// 1. El primitivo
// ---------------------------------------------------------------------------------------------------

describe("el primitivo", () => {
  it("aplica, es idempotente por clave, y el saldo es la suma del ledger", async () => {
    const { empresaId } = await unaEmpresa();
    const mov = { empresaId, delta: 30, reason: "AJUSTE_ADMIN" as const, idempotencyKey: "k1" };
    expect(await aplicarCreditos(prisma, mov)).toEqual({ aplicado: true, saldo: 30 });
    expect(await aplicarCreditos(prisma, mov)).toEqual({ aplicado: false, saldo: 30 });
    expect(await prisma.creditoLedger.count()).toBe(1);
    expect(await cuadra(empresaId)).toEqual({ saldo: 30, suma: 30 });
  });

  it("nunca por debajo de cero: lo rechaza y no escribe nada", async () => {
    const { empresaId } = await unaEmpresa();
    await aplicarCreditos(prisma, {
      empresaId,
      delta: 5,
      reason: "AJUSTE_ADMIN",
      idempotencyKey: "a",
    });
    await expect(
      aplicarCreditos(prisma, {
        empresaId,
        delta: -6,
        reason: "AJUSTE_ADMIN",
        idempotencyKey: "b",
      }),
    ).rejects.toMatchObject({ code: "SALDO_INSUFICIENTE" });
    expect(await cuadra(empresaId)).toEqual({ saldo: 5, suma: 5 });
  });

  it("una empresa que no existe: error claro, nada escrito", async () => {
    await expect(
      aplicarCreditos(prisma, {
        empresaId: "no-existe",
        delta: 1,
        reason: "AJUSTE_ADMIN",
        idempotencyKey: "x",
      }),
    ).rejects.toBeInstanceOf(CreditosError);
    expect(await prisma.creditoLedger.count()).toBe(0);
  });

  it("DIEZ A LA VEZ sobre la misma empresa: ni se pierde ni se duplica nada", async () => {
    const { empresaId } = await unaEmpresa();
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        aplicarCreditos(prisma, {
          empresaId,
          delta: 1,
          reason: "AJUSTE_ADMIN",
          idempotencyKey: `c${i}`,
        }),
      ),
    );
    // Y cinco a la vez con LA MISMA clave: una fila.
    await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        aplicarCreditos(prisma, {
          empresaId,
          delta: 7,
          reason: "AJUSTE_ADMIN",
          idempotencyKey: "misma",
        }),
      ),
    );
    expect(await prisma.creditoLedger.count({ where: { idempotencyKey: "misma" } })).toBe(1);
    expect(await cuadra(empresaId)).toEqual({ saldo: 17, suma: 17 });
  });
});

// ---------------------------------------------------------------------------------------------------
// 2. El regalo de Socio Fundador
// ---------------------------------------------------------------------------------------------------

describe("el regalo de Socio Fundador", () => {
  it("verificarse a tiempo: 90 créditos, una fila con su clave, y el correo lo cuenta", async () => {
    const { empresaId, email } = await unaEmpresa();
    await verificarEmpresa(prisma, { empresaId, actorId: admin, appUrl: APP_URL, ahora: ANTES });

    const filas = await prisma.creditoLedger.findMany({ where: { empresaId } });
    expect(filas.map((f) => [f.reason, f.delta, f.idempotencyKey])).toEqual([
      ["SOCIO_FUNDADOR", SOCIO_FUNDADOR_CREDITOS, claveRegaloSocioFundador(empresaId)],
    ]);
    expect(await cuadra(empresaId)).toEqual({ saldo: 90, suma: 90 });

    const [job] = await prisma.job.findMany({
      where: { idempotencyKey: { startsWith: "empresa-decision:" } },
    });
    const p = job!.payload as { to: string; text: string };
    expect(p.to).toBe(email);
    expect(p.text).toContain(`${SOCIO_FUNDADOR_CREDITOS} créditos de publicidad`);
  });

  it("rechazarla y volver a verificarla NO lo cobra dos veces", async () => {
    const { empresaId } = await unaEmpresa();
    await verificarEmpresa(prisma, { empresaId, actorId: admin, appUrl: APP_URL, ahora: ANTES });
    await rechazarEmpresa(prisma, {
      empresaId,
      actorId: admin,
      motivo: "DATOS_INSUFICIENTES",
      appUrl: APP_URL,
    });
    await verificarEmpresa(prisma, { empresaId, actorId: admin, appUrl: APP_URL, ahora: ANTES });
    expect(await prisma.creditoLedger.count({ where: { empresaId } })).toBe(1);
    expect(await cuadra(empresaId)).toEqual({ saldo: 90, suma: 90 });
    // Y el segundo correo de verificación no vuelve a prometer un regalo que no se ha dado.
    const textos = (
      await prisma.job.findMany({ where: { idempotencyKey: { startsWith: "empresa-decision:" } } })
    ).map((j) => (j.payload as { text: string }).text);
    expect(textos.filter((t) => t.includes("créditos de publicidad"))).toHaveLength(1);
  });

  it("verificarse TARDE: sin regalo, y el correo no lo menciona", async () => {
    const { empresaId } = await unaEmpresa();
    const tarde = new Date(HASTA.getTime() + 1);
    await verificarEmpresa(prisma, { empresaId, actorId: admin, appUrl: APP_URL, ahora: tarde });
    expect(await prisma.creditoLedger.count()).toBe(0);
    const [job] = await prisma.job.findMany();
    expect((job!.payload as { text: string }).text).not.toContain("créditos de publicidad");
  });

  it("el límite es inclusivo y en Madrid: 23:59:59.999 del 30 de junio entra; un ms después, no", () => {
    expect(HASTA.toISOString()).toBe("2027-06-30T21:59:59.999Z");
    expect(esSocioFundador(HASTA)).toBe(true);
    expect(esSocioFundador(new Date(HASTA.getTime() + 1))).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------------
// 3. El backfill de la migración
// ---------------------------------------------------------------------------------------------------

const RAIZ = path.resolve(__dirname, "..");
const MIGRACION = (() => {
  const dir = path.join(RAIZ, "prisma", "migrations");
  const d = readdirSync(dir).find((x) => x.endsWith("_creditos_publicidad"))!;
  return readFileSync(path.join(dir, d, "migration.sql"), "utf8");
})();

/** Las sentencias del bloque BACKFILL, sin comentarios, listas para ejecutar. */
const BACKFILL = MIGRACION.slice(MIGRACION.indexOf("-- BACKFILL"))
  .split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n")
  .split(";")
  .map((s) => s.trim())
  .filter(Boolean);

async function ejecutarBackfill() {
  for (const s of BACKFILL) await prisma.$executeRawUnsafe(s);
}

describe("el backfill de la migración (ejecutado de verdad)", () => {
  it("regala a las verificadas a tiempo; no a las pendientes ni a las verificadas tarde", async () => {
    const aTiempo = await unaEmpresa("VERIFICADA", ANTES);
    const justo = await unaEmpresa("VERIFICADA", HASTA);
    const tarde = await unaEmpresa("VERIFICADA", new Date(HASTA.getTime() + 1));
    const pendiente = await unaEmpresa("PENDIENTE", null);
    // Verificada a tiempo y rechazada después: se verificó a tiempo, le toca.
    const rechazada = await unaEmpresa("RECHAZADA", ANTES);

    await ejecutarBackfill();

    const saldo = async (id: string) =>
      (await prisma.empresa.findUniqueOrThrow({ where: { id } })).creditosSaldo;
    expect(await saldo(aTiempo.empresaId)).toBe(90);
    expect(await saldo(justo.empresaId)).toBe(90);
    expect(await saldo(tarde.empresaId)).toBe(0);
    expect(await saldo(pendiente.empresaId)).toBe(0);
    expect(await saldo(rechazada.empresaId)).toBe(90);
    const fila = await prisma.creditoLedger.findFirstOrThrow({
      where: { empresaId: aTiempo.empresaId },
    });
    expect(fila).toMatchObject({
      reason: "SOCIO_FUNDADOR",
      delta: 90,
      idempotencyKey: claveRegaloSocioFundador(aTiempo.empresaId),
    });
  });

  it("re-ejecutarlo CONVERGE, y no se cruza con un regalo que ya dio la app ni pisa otros movimientos", async () => {
    const yaRegalada = await unaEmpresa("PENDIENTE");
    await verificarEmpresa(prisma, {
      empresaId: yaRegalada.empresaId,
      actorId: admin,
      appUrl: APP_URL,
      ahora: ANTES,
    });
    await aplicarCreditos(prisma, {
      empresaId: yaRegalada.empresaId,
      delta: 10,
      reason: "AJUSTE_ADMIN",
      idempotencyKey: "ajuste-previo",
    });

    await ejecutarBackfill();
    await ejecutarBackfill();

    expect(await prisma.creditoLedger.count({ where: { empresaId: yaRegalada.empresaId } })).toBe(
      2,
    );
    expect(await cuadra(yaRegalada.empresaId)).toEqual({ saldo: 100, suma: 100 });
  });

  it("sus literales dicen lo mismo que las constantes (fecha, cifra y clave)", () => {
    // La fecha en UTC con el formato de MariaDB, a partir de la constante con zona de Madrid.
    const utc = HASTA.toISOString().replace("T", " ").replace("Z", "");
    expect(MIGRACION).toContain(`'${utc}'`);
    expect(MIGRACION).toMatch(new RegExp(`\\n  ${SOCIO_FUNDADOR_CREDITOS},\\n  'SOCIO_FUNDADOR'`));
    expect(claveRegaloSocioFundador("X")).toBe("socio-fundador:X");
    expect(MIGRACION).toContain("CONCAT('socio-fundador:', e.`id`)");
  });
});

// ---------------------------------------------------------------------------------------------------
// 4. El ajuste del admin
// ---------------------------------------------------------------------------------------------------

describe("el ajuste manual del admin", () => {
  const CLAVE = "0d6a3e2b-1c4f-4b8a-9e7d-2f5c6a1b3d4e";

  it("deja el motivo EN LA FILA y su AuditLog, en la misma operación", async () => {
    const { empresaId } = await unaEmpresa();
    const r = await ajustarCreditosEmpresa(prisma, {
      adminId: admin,
      empresaId,
      delta: 30,
      nota: "Compensación por la incidencia del 3 de noviembre",
      clave: CLAVE,
    });
    expect(r).toEqual({ aplicado: true, saldo: 30 });
    const fila = await prisma.creditoLedger.findFirstOrThrow({ where: { empresaId } });
    expect(fila).toMatchObject({
      reason: "AJUSTE_ADMIN",
      refType: "ADMIN",
      refId: admin,
      nota: "Compensación por la incidencia del 3 de noviembre",
    });
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: "EMPRESA_CREDITOS_AJUSTE" },
    });
    expect(audit).toMatchObject({ actorId: admin, targetType: "EMPRESA", targetId: empresaId });
    expect(audit.metadata).toMatchObject({
      delta: 30,
      antes: 0,
      despues: 30,
      movimientoId: fila.id,
    });
  });

  it("doble clic (misma clave): un movimiento y un AuditLog", async () => {
    const { empresaId } = await unaEmpresa();
    const ajuste = {
      adminId: admin,
      empresaId,
      delta: 5,
      nota: "Prueba de doble clic",
      clave: CLAVE,
    };
    await ajustarCreditosEmpresa(prisma, ajuste);
    expect(await ajustarCreditosEmpresa(prisma, ajuste)).toEqual({ aplicado: false, saldo: 5 });
    expect(await prisma.creditoLedger.count()).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "EMPRESA_CREDITOS_AJUSTE" } })).toBe(1);
  });

  it("sin motivo, con cantidad inválida o dejándola en negativo: rechazado y nada escrito", async () => {
    const { empresaId } = await unaEmpresa();
    const base = { adminId: admin, empresaId, clave: CLAVE };
    await expect(
      ajustarCreditosEmpresa(prisma, { ...base, delta: 5, nota: "  " }),
    ).rejects.toMatchObject({ code: "NOTA_OBLIGATORIA" });
    await expect(
      ajustarCreditosEmpresa(prisma, { ...base, delta: 0, nota: "Motivo válido" }),
    ).rejects.toMatchObject({ code: "DELTA_INVALIDO" });
    await expect(
      ajustarCreditosEmpresa(prisma, { ...base, delta: 100000, nota: "Motivo válido" }),
    ).rejects.toMatchObject({ code: "DELTA_INVALIDO" });
    await expect(
      ajustarCreditosEmpresa(prisma, { ...base, delta: -1, nota: "Motivo válido" }),
    ).rejects.toBeInstanceOf(AjusteCreditosError);
    expect(await prisma.creditoLedger.count()).toBe(0);
    expect(await prisma.auditLog.count()).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------------
// 5. Lo que ve la empresa
// ---------------------------------------------------------------------------------------------------

describe("lo que ve la empresa", () => {
  it("su saldo y su historial por concepto; ni la nota ni quién lo hizo (claves exactas)", async () => {
    const { empresaId } = await unaEmpresa();
    await verificarEmpresa(prisma, { empresaId, actorId: admin, appUrl: APP_URL, ahora: ANTES });
    await ajustarCreditosEmpresa(prisma, {
      adminId: admin,
      empresaId,
      delta: -10,
      nota: "secreto del equipo",
      clave: "1a2b3c4d-1c4f-4b8a-9e7d-2f5c6a1b3d4e",
    });
    const c = await misCreditos(prisma, empresaId);
    expect(c.saldo).toBe(80);
    expect(Object.keys(c).sort()).toEqual(["movimientos", "nextCursor", "saldo"]);
    for (const m of c.movimientos) {
      // P11: `recibo` (null salvo en una compra). Ni nota ni quién: las claves, exactas.
      expect(Object.keys(m).sort()).toEqual(["concepto", "creadoMs", "delta", "id", "recibo"]);
    }
    expect(c.movimientos.map((m) => m.concepto).sort()).toEqual(
      ["Ajuste del equipo de DareFlash", "Regalo de Socio Fundador"].sort(),
    );
    expect(JSON.stringify(c)).not.toContain("secreto del equipo");
    expect(JSON.stringify(c)).not.toContain(admin);
  });

  it("solo lo suyo", async () => {
    const a = await unaEmpresa();
    const b = await unaEmpresa();
    await aplicarCreditos(prisma, {
      empresaId: b.empresaId,
      delta: 3,
      reason: "AJUSTE_ADMIN",
      idempotencyKey: "de-b",
    });
    const c = await misCreditos(prisma, a.empresaId);
    expect(c).toMatchObject({ saldo: 0, movimientos: [] });
  });
});

// ---------------------------------------------------------------------------------------------------
// 6. Estructural
// ---------------------------------------------------------------------------------------------------

const soloCodigo = (s: string) =>
  s.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "").replace(/^\s*\/\/.*$/gm, "");

describe("estructural", () => {
  it("el ledger de créditos no toca la tabla User (veto de deadlock)", () => {
    const src = soloCodigo(
      readFileSync(path.join(RAIZ, "src", "server", "services", "creditos.ts"), "utf8"),
    );
    expect(src).not.toMatch(/\\`User\\`|\.user\.|tx\.user|db\.user/);
    // Y el cerrojo que SÍ toma es el de la empresa.
    expect(src).toMatch(/FROM \\`Empresa\\` WHERE \\`id\\` = \$\{entrada\.empresaId\} FOR UPDATE/);
  });

  it("en pantalla son «créditos de publicidad», nunca «puntos»", () => {
    const ficheros = [
      ["src", "app", "panel", "empresas", "creditos-empresa.tsx"],
      ["src", "app", "(app)", "(shell)", "empresa", "page.tsx"],
      // fase9-diseno: su sección propia, con el historial entero.
      ["src", "app", "(app)", "(shell)", "empresa", "creditos", "page.tsx"],
    ];
    for (const f of ficheros) {
      const src = soloCodigo(readFileSync(path.join(RAIZ, ...f), "utf8"));
      expect(src, f.join("/")).not.toMatch(/punto/i);
      expect(src, f.join("/")).toMatch(/Créditos de publicidad/);
    }
    // Y los conceptos que ve la empresa, tampoco.
    const c = readFileSync(path.join(RAIZ, "src", "config", "constants.ts"), "utf8");
    const bloque = c.slice(
      c.indexOf("ETIQUETA_MOVIMIENTO_CREDITO"),
      c.indexOf("AJUSTE_CREDITOS_DELTA_MAX"),
    );
    expect(bloque).not.toMatch(/punto/i);
  });

  it("no hay más sitios que escriban el saldo que el primitivo", () => {
    const fuentes = (dir: string): string[] =>
      readdirSync(dir).flatMap((x) => {
        const p = path.join(dir, x);
        if (statSync(p).isDirectory()) return x === "generated" ? [] : fuentes(p);
        return /\.(ts|tsx)$/.test(x) ? [p] : [];
      });
    const escriben = fuentes(path.join(RAIZ, "src"))
      .filter((f) =>
        /creditosSaldo\s*[:=]|SET \\`creditosSaldo\\`/.test(soloCodigo(readFileSync(f, "utf8"))),
      )
      .map((f) => path.relative(RAIZ, f).split(path.sep).join("/"));
    expect(escriben).toEqual(["src/server/services/creditos.ts"]);
  });
});
