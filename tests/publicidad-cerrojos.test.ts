/**
 * UN SOLO ORDEN DE CERROJOS PARA TODA LA PUBLICIDAD (Fase 9 · P9), comprobado EJECUTANDO cada operación.
 *
 * Cada operación sobre una campaña —activar, pausar, reanudar, terminar, cobrar el día (con y sin
 * saldo), denunciar hasta el umbral, absolver y retirar— corre aquí con un cliente que APUNTA, por
 * transacción, qué tablas bloquea y en qué orden: un `SELECT … FOR UPDATE` y cualquier escritura
 * (INSERT, UPDATE, DELETE, por SQL o por el cliente de Prisma) coge cerrojo; las lecturas normales no.
 * El orden que aparece no puede volver atrás en `ORDEN_CERROJOS_PUBLICIDAD`.
 *
 * Por qué ejecutarlo y no leer el código: el orden de una transacción lo decide la suma de las funciones
 * que llama (la retirada llama a levantar, a devolver el día, al primitivo de créditos…), y ninguna de
 * ellas, leída sola, lo enseña. El fallo que esto caza ya existió: la retirada bloqueaba la campaña y
 * DESPUÉS las denuncias, al revés que `denunciar`.
 *
 * Para romperlo a propósito: en `retirarPublicidad`, bloquear la campaña antes que las denuncias (rojo);
 * en `denunciar`, quitar el `bloquearEmpresa` (la devolución del día bloquea la Empresa después de la
 * campaña: rojo).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";
import { aplicarCreditos } from "../src/server/services/creditos";
import { denunciar } from "../src/server/services/denuncias";
import {
  type DatosCampana,
  activarPublicidad,
  apuntarImagenPublicidad,
  crearBorrador,
  pausarPublicidad,
  reanudarPublicidad,
  terminarPublicidad,
} from "../src/server/services/publicidad";
import { ORDEN_CERROJOS_PUBLICIDAD } from "../src/server/services/publicidad-cerrojos";
import { cobrarPublicidadDeHoy } from "../src/server/services/publicidad-cobro";
import {
  absolverPublicidad,
  retirarPublicidad,
} from "../src/server/services/publicidad-moderacion";

import { createTestPrisma, crearUsuario, resetDb } from "./helpers/db";

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

// ---------------------------------------------------------------------------------------------------
// La grabadora
// ---------------------------------------------------------------------------------------------------

const ESCRITURAS = new Set([
  "create",
  "createMany",
  "createManyAndReturn",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "upsert",
  "delete",
  "deleteMany",
]);

/** El texto de una consulta cruda: plantilla etiquetada, `Prisma.sql` o cadena. */
function sqlDe(args: unknown[]): string {
  const a = args[0] as { raw?: unknown; strings?: string[] } | string | undefined;
  if (typeof a === "string") return a;
  if (Array.isArray(a)) return a.join("?");
  if (a && Array.isArray(a.strings)) return a.strings.join("?");
  return "";
}

/** La tabla que BLOQUEA una consulta cruda, o null si no bloquea (una lectura, un SAVEPOINT). */
function tablaQueBloquea(sql: string): string | null {
  const s = sql.replace(/\s+/g, " ").trim();
  if (/\bFOR UPDATE\b/i.test(s)) return /\bFROM `?(\w+)`?/i.exec(s)?.[1] ?? null;
  return /^(?:INSERT(?: IGNORE)? INTO|UPDATE|DELETE FROM) `?(\w+)`?/i.exec(s)?.[1] ?? null;
}

const tablaDeModelo = (m: string) => m.charAt(0).toUpperCase() + m.slice(1);

function grabarTx(tx: object, apunte: string[]): object {
  return new Proxy(tx, {
    get(t, prop) {
      const v = Reflect.get(t, prop) as unknown;
      if (typeof prop !== "string") return v;
      if (prop.startsWith("$query") || prop.startsWith("$execute")) {
        return (...args: unknown[]) => {
          const tabla = tablaQueBloquea(sqlDe(args));
          if (tabla) apunte.push(tabla);
          return (v as (...a: unknown[]) => unknown).apply(t, args);
        };
      }
      if (v && typeof v === "object" && !prop.startsWith("$")) {
        // Un modelo (`tx.publicidad`): sus escrituras bloquean su tabla.
        return new Proxy(v, {
          get(d, metodo) {
            const fn = Reflect.get(d, metodo) as unknown;
            if (typeof fn !== "function") return fn;
            return (...args: unknown[]) => {
              if (typeof metodo === "string" && ESCRITURAS.has(metodo)) {
                apunte.push(tablaDeModelo(prop));
              }
              return (fn as (...a: unknown[]) => unknown).apply(d, args);
            };
          },
        });
      }
      return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(t) : v;
    },
  });
}

/** Un cliente que apunta, por transacción, la secuencia de tablas que bloquea. */
function grabadora(db: PrismaClient): { db: PrismaClient; transacciones: string[][] } {
  const transacciones: string[][] = [];
  const proxy = new Proxy(db, {
    get(t, prop) {
      if (prop === "$transaction") {
        return (fn: (tx: unknown) => Promise<unknown>, opciones?: unknown) => {
          const apunte: string[] = [];
          transacciones.push(apunte);
          return (t.$transaction as (f: unknown, o?: unknown) => Promise<unknown>)(
            (tx: object) => fn(grabarTx(tx, apunte)),
            opciones,
          );
        };
      }
      const v = Reflect.get(t, prop) as unknown;
      return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(t) : v;
    },
  });
  return { db: proxy, transacciones };
}

/**
 * Las veces que una transacción coge una tabla del orden DESPUÉS de una posterior. Volver a tocar una
 * tabla que ya tiene (la Empresa al escribir el saldo) no es un cerrojo nuevo y no cuenta.
 */
function inversiones(secuencia: string[]): string[] {
  const orden: readonly string[] = ORDEN_CERROJOS_PUBLICIDAD;
  const vistas = new Set<string>();
  let max = -1;
  const malas: string[] = [];
  for (const tabla of secuencia) {
    const r = orden.indexOf(tabla);
    if (r < 0 || vistas.has(tabla)) continue;
    if (r < max) malas.push(`${tabla} después de ${orden[max]}`);
    vistas.add(tabla);
    max = Math.max(max, r);
  }
  return malas;
}

/** Las tablas del orden que coge, en el orden en que las coge por primera vez. */
const primeras = (secuencia: string[]) =>
  [...new Set(secuencia)].filter((t) =>
    (ORDEN_CERROJOS_PUBLICIDAD as readonly string[]).includes(t),
  );

/** Ejecuta `op` con la grabadora y devuelve lo que bloqueó cada transacción. */
async function grabar(op: (db: PrismaClient) => Promise<unknown>): Promise<string[][]> {
  const g = grabadora(prisma);
  await op(g.db);
  return g.transacciones;
}

function sinInversiones(transacciones: string[][]): void {
  expect(transacciones.length, "la grabadora no vio ninguna transacción").toBeGreaterThan(0);
  for (const t of transacciones) expect(inversiones(t), t.join(" → ")).toEqual([]);
}

// ---------------------------------------------------------------------------------------------------
// Las operaciones
// ---------------------------------------------------------------------------------------------------

const DIA1 = new Date("2026-12-01T10:00:00.000Z");
const DIA2 = new Date("2026-12-02T00:01:00.000Z");
const APP = "https://dareflash.test";
const BASE: DatosCampana = {
  nombre: "Desayunos",
  alcance: "CIUDAD",
  ciudadId: 2509954,
  estadoCodigo: undefined,
  paises: [],
  texto: "Ven a probar nuestro pan",
  destinoUrl: "https://panaderia.example.com",
  fechaInicio: "2026-12-01",
  dias: 3,
};

let n = 0;
async function unaEmpresa(creditos = 50): Promise<string> {
  n += 1;
  const owner = await crearUsuario(prisma);
  await prisma.user.update({
    where: { id: owner },
    data: { email: `cerrojos${n}@empresa.test`, esCuentaEmpresa: true },
  });
  const e = await prisma.empresa.create({
    data: {
      ownerUserId: owner,
      nombre: `Panadería ${n}`,
      tipoCuenta: "EMPRESA",
      tipoNegocio: "FISICO",
      estado: "VERIFICADA",
      paisIso: "ES",
      personaContacto: "Lucía",
    },
    select: { id: true },
  });
  await aplicarCreditos(prisma, {
    empresaId: e.id,
    delta: creditos,
    reason: "AJUSTE_ADMIN",
    idempotencyKey: `test:${e.id}`,
    nota: "saldo de prueba",
  });
  return e.id;
}

async function unBorrador(e: string, datos: Partial<DatosCampana> = {}): Promise<string> {
  const { id } = await crearBorrador(prisma, e, { ...BASE, ...datos }, DIA1);
  await apuntarImagenPublicidad(prisma, e, id, `/portadas/publicidad-${id}.webp`);
  return id;
}

async function unaActiva(e: string, datos: Partial<DatosCampana> = {}): Promise<string> {
  const id = await unBorrador(e, datos);
  expect((await activarPublicidad(prisma, e, id, { ahora: DIA1 })).ok).toBe(true);
  return id;
}

async function denunciasHastaElUmbral(db: PrismaClient, id: string): Promise<void> {
  for (let i = 0; i < 3; i += 1) {
    await denunciar(db, {
      reporterId: await crearUsuario(prisma),
      targetType: "PUBLICIDAD",
      targetId: id,
      reason: "SPAM",
      ahora: DIA1,
    });
  }
}

describe("el orden de cerrojos de la publicidad, ejecutado", () => {
  it("la grabadora ve los cerrojos (si no viera nada, todo saldría verde)", () => {
    expect(tablaQueBloquea("SELECT `id` FROM `Empresa` WHERE `id` = ? FOR UPDATE")).toBe("Empresa");
    expect(tablaQueBloquea("\n INSERT IGNORE INTO `ZonaOcupacion` (`id`) VALUES ?")).toBe(
      "ZonaOcupacion",
    );
    expect(tablaQueBloquea("UPDATE `Empresa` SET `creditosSaldo` = ?")).toBe("Empresa");
    expect(tablaQueBloquea("SELECT `estado` FROM `Publicidad` WHERE `id` = ?")).toBeNull();
    expect(tablaQueBloquea("SAVEPOINT reanudar_tras_absolver")).toBeNull();
    expect(inversiones(["Publicidad", "ZonaOcupacion", "Report"])).toEqual([
      "Report después de ZonaOcupacion",
    ]);
    expect(inversiones(["Empresa", "Publicidad", "Empresa", "CreditoLedger"])).toEqual([]);
  });

  it("activar hoy (con su cobro): Empresa → campaña → ocupación → radio → ledger", async () => {
    const e = await unaEmpresa();
    const id = await unBorrador(e);
    const t = await grabar((db) => activarPublicidad(db, e, id, { ahora: DIA1 }));
    sinInversiones(t);
    expect(primeras(t.flat())).toEqual([
      "Empresa",
      "Publicidad",
      "ZonaOcupacion",
      "PublicidadCiudad",
      "CreditoLedger",
    ]);
  });

  it("pausar, reanudar y terminar", async () => {
    const e = await unaEmpresa();
    const id = await unaActiva(e);
    sinInversiones(await grabar((db) => pausarPublicidad(db, e, id, DIA1)));
    sinInversiones(await grabar((db) => reanudarPublicidad(db, e, id, { ahora: DIA1 })));
    sinInversiones(await grabar((db) => terminarPublicidad(db, e, id, DIA1)));
  });

  it("el cobro del día, con saldo y sin saldo", async () => {
    const e = await unaEmpresa();
    await unaActiva(e, { fechaInicio: "2026-12-02" });
    const conSaldo = await grabar((db) => cobrarPublicidadDeHoy(db, { appUrl: APP, ahora: DIA2 }));
    sinInversiones(conSaldo);
    expect(primeras(conSaldo.flat())).toEqual(["Empresa", "Publicidad", "CreditoLedger"]);

    const pobre = await unaEmpresa(3);
    await unaActiva(pobre, { fechaInicio: "2026-12-02" });
    await aplicarCreditos(prisma, {
      empresaId: pobre,
      delta: -3,
      reason: "AJUSTE_ADMIN",
      idempotencyKey: `test:vaciar:${pobre}`,
      nota: "corrección",
    });
    const sinSaldo = await grabar((db) => cobrarPublicidadDeHoy(db, { appUrl: APP, ahora: DIA2 }));
    sinInversiones(sinSaldo);
    expect(primeras(sinSaldo.flat())).toEqual(["Empresa", "Publicidad", "ZonaOcupacion"]);
  });

  it("denunciar hasta el umbral (que pausa y devuelve el día): Empresa → denuncia → campaña → ocupación → ledger", async () => {
    const e = await unaEmpresa();
    const id = await unaActiva(e);
    const t = await grabar((db) => denunciasHastaElUmbral(db, id));
    sinInversiones(t);
    expect(primeras(t.flat())).toEqual([
      "Empresa",
      "Report",
      "Publicidad",
      "ZonaOcupacion",
      "CreditoLedger",
    ]);
  });

  it("absolver (que reanuda y cobra hoy)", async () => {
    const admin = await crearUsuario(prisma);
    const e = await unaEmpresa();
    const id = await unaActiva(e);
    await denunciasHastaElUmbral(prisma, id);
    const t = await grabar((db) =>
      absolverPublicidad(db, {
        publicidadId: id,
        adminId: admin,
        appUrl: APP,
        ahora: new Date("2026-12-02T10:00:00.000Z"),
      }),
    );
    sinInversiones(t);
    expect(primeras(t.flat())).toEqual([
      "Empresa",
      "Report",
      "Publicidad",
      "ZonaOcupacion",
      "CreditoLedger",
    ]);
  });

  it("retirar (que devuelve el día): Empresa → denuncias → campaña → ocupación → ledger", async () => {
    const admin = await crearUsuario(prisma);
    const e = await unaEmpresa();
    const id = await unaActiva(e);
    const t = await grabar((db) =>
      retirarPublicidad(db, {
        publicidadId: id,
        adminId: admin,
        motivo: "ENGANOSA",
        appUrl: APP,
        ahora: DIA1,
      }),
    );
    sinInversiones(t);
    expect(primeras(t.flat())).toEqual([
      "Empresa",
      "Report",
      "Publicidad",
      "ZonaOcupacion",
      "CreditoLedger",
    ]);
  });
});
