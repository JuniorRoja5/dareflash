/**
 * LA ZONA HORARIA DEL USUARIO SE GUARDA SOLO SI CAMBIA (Fase 11 · P2).
 *
 * `validateSession` es la consulta que corre en CADA petición autenticada, y es también donde se guarda
 * la zona que dice el navegador. Eso la hace barata —va en el `select` de siempre— y peligrosa: un
 * descuido convierte el camino más caliente del producto en una escritura por petición, o en una
 * consulta de más. Lo que se fija aquí, con la BD de verdad:
 *
 *  - NI UNA CONSULTA MÁS: misma zona → la validación es UNA consulta, la de siempre (contada con una
 *    extensión de Prisma que apunta cada operación).
 *  - Misma zona → CERO escrituras; zona inválida o demasiado larga → no llega a la BD; cookie ausente o
 *    inválida → la guardada se queda.
 *  - Sin sesión válida (sin token, caducada, inactiva, cuenta borrada o baneada) → no se escribe nada.
 *  - Dos dispositivos con zonas distintas → no escriben en cada petición: como mucho una vez por sesión
 *    y ventana de refresco; gana el último en refrescar.
 *  - Los nombres de una misma zona (`Europe/Kyiv`/`Europe/Kiev`, `Etc/UTC`/`UTC`) son el MISMO valor.
 *
 * Para romperlo: escribir sin comparar con la guardada (rojo «misma zona»), escribir `zonaDicha` aunque
 * sea null (rojo «ausente»), quitar `zonaParaGuardar` de la entrada (rojo «inválida»), leer la zona con
 * una consulta aparte (rojo «una consulta»), o mover la escritura antes de las comprobaciones de la
 * sesión (rojo «sin sesión válida»).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { SESION_REFRESCO_MIN_MS } from "../src/config/constants";
import type { PrismaClient } from "../src/generated/prisma/client";
import { zonaParaGuardar } from "../src/lib/zona-espectador";
import { createSession, validateSession } from "../src/server/auth/session";
import type { Db } from "../src/server/db/types";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

let prisma: PrismaClient;
let userId: string;

beforeAll(() => {
  prisma = createTestPrisma();
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
  userId = await crearUsuario(prisma);
});

/** Un cliente que apunta CADA operación (modelo.operación), también las crudas. */
function clienteQueCuenta(): { db: Db; ops: string[] } {
  const ops: string[] = [];
  const db = prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          ops.push(`${model}.${operation}`);
          return query(args);
        },
      },
      async $queryRaw({ args, query }) {
        ops.push("$queryRaw");
        return query(args);
      },
      async $executeRaw({ args, query }) {
        ops.push("$executeRaw");
        return query(args);
      },
    },
  }) as unknown as Db;
  return { db, ops };
}

const guardada = async (id = userId): Promise<string | null> =>
  (await prisma.user.findUniqueOrThrow({ where: { id }, select: { zonaHoraria: true } }))
    .zonaHoraria;

const fijar = (zona: string | null, id = userId) =>
  prisma.user.update({ where: { id }, data: { zonaHoraria: zona } });

/** El momento en que a una sesión creada en `t` ya le toca el refresco amortiguado. */
const trasRefresco = (t: Date, veces = 1) =>
  new Date(t.getTime() + veces * (SESION_REFRESCO_MIN_MS + 1_000));

const T0 = new Date("2026-11-21T10:00:00.000Z");

/**
 * Una sesión creada en T0 y con su ÚLTIMA ACTIVIDAD en T0. `createSession` deja `lastSeenAt` al reloj de
 * MariaDB (que no se mueve con el de Node, ver `reloj-adelantado`): sin fijarlo, que toque o no el
 * refresco dependería de la hora a la que corre el test.
 */
async function sesion() {
  const s = await createSession(prisma, userId, { now: T0 });
  await prisma.session.update({ where: { id: s.sessionId }, data: { lastSeenAt: T0 } });
  return s;
}

describe("guardar la zona: solo si cambia, y solo una que valga", () => {
  it("la primera vez (guardada NULL) se escribe en el acto, en su forma canónica", async () => {
    const s = await sesion();
    const u = await validateSession(prisma, s.rawToken, T0, { zonaNavegador: "Europe/Madrid" });
    expect(u?.zonaHoraria).toBe("Europe/Madrid");
    expect(await guardada()).toBe("Europe/Madrid");
  });

  it("MISMA zona: una sola consulta (la de siempre) y CERO escrituras", async () => {
    await fijar("Europe/Madrid");
    const s = await sesion();
    const { db, ops } = clienteQueCuenta();
    // Sin refresco pendiente: la validación entera es UNA lectura de Session con su User.
    const u = await validateSession(db, s.rawToken, T0, { zonaNavegador: "Europe/Madrid" });
    expect(u?.zonaHoraria).toBe("Europe/Madrid");
    expect(ops).toEqual(["Session.findUnique"]);

    // Y con el refresco pendiente, la única escritura es la de `lastSeenAt` de siempre: ninguna a User.
    ops.length = 0;
    await validateSession(db, s.rawToken, trasRefresco(T0), { zonaNavegador: "Europe/Madrid" });
    expect(ops).toEqual(["Session.findUnique", "Session.updateMany"]);
  });

  it.each([
    ["inventada", "Marte/Olympus"],
    ["inyección", "UTC;DROP TABLE User"],
    ["demasiado larga (65)", `Europe/${"a".repeat(58)}`],
    ["vacía", ""],
  ])("una zona %s NO llega a la BD (ni con NULL ni sobre una guardada)", async (_n, raro) => {
    const s = await sesion();
    await validateSession(prisma, s.rawToken, T0, { zonaNavegador: raro });
    expect(await guardada()).toBeNull();

    await fijar("Europe/Madrid");
    await validateSession(prisma, s.rawToken, trasRefresco(T0), { zonaNavegador: raro });
    expect(await guardada()).toBe("Europe/Madrid");
  });

  it("el caso de 65 caracteres mide lo que dice (si no, no probaría el tope)", () => {
    expect(`Europe/${"a".repeat(58)}`).toHaveLength(65);
  });

  it.each([
    ["ausente", undefined],
    ["null", null],
    ["inválida", "no/vale"],
  ])("una cookie %s NUNCA borra la zona guardada", async (_n, cookie) => {
    await fijar("America/Bogota");
    const s = await sesion();
    const u = await validateSession(prisma, s.rawToken, trasRefresco(T0), {
      zonaNavegador: cookie,
    });
    expect(u?.zonaHoraria).toBe("America/Bogota");
    expect(await guardada()).toBe("America/Bogota");
  });

  it("con `tocar: false` (el sondeo de avisos) no escribe, ni siquiera sobre NULL", async () => {
    const s = await sesion();
    await validateSession(prisma, s.rawToken, trasRefresco(T0), {
      tocar: false,
      zonaNavegador: "Europe/Madrid",
    });
    expect(await guardada()).toBeNull();
  });
});

describe("sin sesión válida no se escribe nada", () => {
  it("sin token (un invitado): ni una consulta", async () => {
    const { db, ops } = clienteQueCuenta();
    expect(await validateSession(db, undefined, T0, { zonaNavegador: "Europe/Madrid" })).toBeNull();
    expect(ops).toEqual([]);
  });

  it("con un token que no existe: solo la lectura, ninguna escritura", async () => {
    const { db, ops } = clienteQueCuenta();
    expect(
      await validateSession(db, "token-que-no-existe", T0, { zonaNavegador: "Europe/Madrid" }),
    ).toBeNull();
    expect(ops).toEqual(["Session.findUnique"]);
  });

  it("sesión CADUCADA: no escribe la zona", async () => {
    const s = await createSession(prisma, userId, { now: T0, ttlMs: 60_000 });
    const despues = new Date(T0.getTime() + 120_000);
    expect(
      await validateSession(prisma, s.rawToken, despues, { zonaNavegador: "Europe/Madrid" }),
    ).toBeNull();
    expect(await guardada()).toBeNull();
  });

  it("sesión INACTIVA (borrada al validar): no escribe la zona", async () => {
    const s = await sesion();
    const muchoDespues = new Date(T0.getTime() + 20 * 24 * 60 * 60 * 1000);
    expect(
      await validateSession(prisma, s.rawToken, muchoDespues, { zonaNavegador: "Europe/Madrid" }),
    ).toBeNull();
    expect(await guardada()).toBeNull();
  });

  it.each([
    ["baneada", { bannedAt: T0 }],
    ["borrada", { deletedAt: T0 }],
  ])("cuenta %s: no escribe la zona", async (_n, marca) => {
    const s = await sesion();
    await prisma.user.update({ where: { id: userId }, data: marca });
    expect(
      await validateSession(prisma, s.rawToken, T0, { zonaNavegador: "Europe/Madrid" }),
    ).toBeNull();
    expect(await guardada()).toBeNull();
  });
});

describe("dos dispositivos con zonas distintas: sin bucle de escrituras", () => {
  it("alternando cada minuto durante media hora, escriben como mucho una vez por sesión y ventana", async () => {
    await fijar("Europe/Madrid");
    const a = await sesion(); // el portátil, en Madrid
    const b = await sesion(); // el móvil, de viaje en Bogotá
    const { db, ops } = clienteQueCuenta();

    const MINUTOS = 30;
    for (let m = 1; m <= MINUTOS; m += 1) {
      const t = new Date(T0.getTime() + m * 60_000);
      await validateSession(db, a.rawToken, t, { zonaNavegador: "Europe/Madrid" });
      await validateSession(db, b.rawToken, new Date(t.getTime() + 1_000), {
        zonaNavegador: "America/Bogota",
      });
    }
    const escriturasUser = ops.filter((o) => o === "User.updateMany").length;
    const peticiones = 2 * MINUTOS;
    // Cada sesión refresca, como mucho, una vez cada `SESION_REFRESCO_MIN_MS` (aquí, cada 6 min).
    const tope = 2 * Math.ceil((MINUTOS * 60_000) / SESION_REFRESCO_MIN_MS);
    expect(escriturasUser).toBeGreaterThan(0); // sí se entera del viaje
    expect(escriturasUser).toBeLessThanOrEqual(tope);
    expect(escriturasUser).toBeLessThan(peticiones / 4);
  });

  it("gana la última en refrescar", async () => {
    await fijar("Europe/Madrid");
    const b = await sesion();
    await validateSession(prisma, b.rawToken, trasRefresco(T0), {
      zonaNavegador: "America/Bogota",
    });
    expect(await guardada()).toBe("America/Bogota");
  });

  it("dentro de la ventana, una zona distinta NO escribe (la guardada no es NULL)", async () => {
    await fijar("Europe/Madrid");
    const b = await sesion();
    await validateSession(prisma, b.rawToken, T0, { zonaNavegador: "America/Bogota" });
    expect(await guardada()).toBe("Europe/Madrid");
  });
});

describe("zonas renombradas y alias: un mismo valor", () => {
  it.each([
    ["Europe/Kyiv", "Europe/Kiev"],
    ["Etc/UTC", "UTC"],
    ["GMT", "UTC"],
    ["Asia/Kolkata", "Asia/Calcutta"],
    ["US/Eastern", "America/New_York"],
    ["europe/madrid", "Europe/Madrid"],
  ])("%s se guarda como %s (la canónica del ICU de Node)", (dicha, canonica) => {
    expect(zonaParaGuardar(dicha)).toBe(canonica);
    expect(zonaParaGuardar(canonica)).toBe(canonica); // y es estable: la canónica de la canónica
  });

  it("guardada «Europe/Kiev» y el navegador dice «Europe/Kyiv»: no escribe aunque toque el refresco", async () => {
    await fijar("Europe/Kiev");
    const s = await sesion();
    const { db, ops } = clienteQueCuenta();
    await validateSession(db, s.rawToken, trasRefresco(T0), { zonaNavegador: "Europe/Kyiv" });
    expect(ops).not.toContain("User.updateMany");
  });

  it("una guardada que ya no vale (un ICU nuevo la retiró) se lee como NULL y se repara", async () => {
    await fijar("Marte/Olympus");
    const s = await sesion();
    const sin = await validateSession(prisma, s.rawToken, T0, {});
    expect(sin?.zonaHoraria).toBeNull();
    await validateSession(prisma, s.rawToken, T0, { zonaNavegador: "Europe/Madrid" });
    expect(await guardada()).toBe("Europe/Madrid");
  });
});

describe("la columna mide lo que mide la regla", () => {
  it("VARCHAR(64) en el esquema y en la migración, NULL y sin DEFAULT; 64 es el tope de `zonaHoraria`", () => {
    const raiz = process.cwd();
    const esquema = readFileSync(path.join(raiz, "prisma", "schema.prisma"), "utf8");
    expect(esquema).toMatch(/^\s*zonaHoraria\s+String\?\s+@db\.VarChar\(64\)\s*$/m);
    const sql = readFileSync(
      path.join(
        raiz,
        "prisma",
        "migrations",
        "20261121002600_zona_horaria_usuario",
        "migration.sql",
      ),
      "utf8",
    );
    const codigo = sql.replace(/^\s*--.*$/gm, "");
    expect(codigo).toContain("ALTER TABLE `User` ADD COLUMN `zonaHoraria` VARCHAR(64) NULL;");
    expect(codigo).not.toMatch(/DEFAULT|UPDATE\s+`User`/i);
    // El tope de la REGLA es el de la columna: si uno se mueve sin el otro, o la BD trunca/rechaza lo
    // que la regla aceptó, o la regla deja fuera lo que la columna aguanta.
    const formato = readFileSync(path.join(raiz, "src", "lib", "formato.ts"), "utf8");
    expect(formato).toMatch(/valor\.length > 64\) return null;/);
  });
});
