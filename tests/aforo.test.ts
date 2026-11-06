/**
 * EL AFORO POR ZONA Y EL AVISO DEL FICHERO DE IP (Fase 9 · P5, §5.3 y §4.2).
 *
 * Redis va con un doble en memoria que implementa lo que se usa (PFADD/PFCOUNT como conjuntos EXACTOS:
 * el ≈0,8 % del HyperLogLog es cosa de Redis, aquí se prueba la lógica).
 *
 * Lo que se fija:
 *  - Se cuenta a la persona en su ciudad, estado, país y global; dos visitas de la misma, una.
 *  - Materializar escribe el RECUENTO ABSOLUTO: reejecutar converge, nunca suma dos veces.
 *  - Sin Redis, o con Redis caído, nada lanza.
 *  - La mediana usa los 7 días COMPLETOS (hoy no), y la cascada sube de nivel solo si no hay datos.
 *  - El aviso del fichero de IP: uno al cruzar los 60 días (o si falta), re-armado al actualizarse.
 *  - Los VIP no cuentan (no ven publicidad): se excluyen al CONTAR, con el chokepoint de VIP.
 *
 * Para romperlo a propósito: materializar con `personas = personas + VALUES(personas)` (rojo el de
 * reejecutar); incluir hoy en la mediana (rojo); que la cascada devuelva el primer nivel aunque esté
 * vacío (rojo); umbral `>= 60` en vez de `> 60` (rojo el del día 60); quitar el `esVipActivoDe` de
 * `contarVisitaEnAforo` (rojo el de los VIP).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";
import type { EmailAdapter, EmailMessage } from "../src/server/email/adapter";
import {
  type RedisAforo,
  aforoEnCascada,
  contarEnAforo,
  materializarAforo,
  medianaAforo,
  medianasAforo,
} from "../src/server/services/aforo";
import { estadoFicheroIp, revisarFicheroGeoIp } from "../src/server/services/geoip-caducidad";
import type { RedisMemo } from "../src/server/geo/ubicacion";
import { contarVisitaEnAforo } from "../src/server/geo/visita";

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
  await prisma.systemState.deleteMany({ where: { key: "geoip:aviso" } });
});

const DIA = 24 * 60 * 60 * 1000;
const AHORA = new Date("2026-11-05T12:00:00.000Z");

/** Redis en memoria: lo justo de PFADD/PFCOUNT/SADD/SMEMBERS/EXPIRE (y GET/SET del memo de invitados,
 *  que aquí no se ejercita), con conjuntos exactos. */
function redisFalso(): RedisAforo & RedisMemo & { claves: Map<string, Set<string>> } {
  const claves = new Map<string, Set<string>>();
  const anadir = (k: string, ms: string[]) => {
    const s = claves.get(k) ?? new Set<string>();
    ms.forEach((m) => s.add(m));
    claves.set(k, s);
  };
  return {
    claves,
    pipeline() {
      const ops: (() => void)[] = [];
      const p = {
        pfadd: (k: string, ...ms: string[]) => ops.push(() => anadir(k, ms)),
        sadd: (k: string, ...ms: string[]) => ops.push(() => anadir(k, ms)),
        expire: () => ops.push(() => {}),
        exec: async () => ops.forEach((o) => o()),
      };
      return p;
    },
    async smembers(k) {
      return [...(claves.get(k) ?? [])];
    },
    async pfcount(k) {
      return claves.get(k)?.size ?? 0;
    },
    async get() {
      return null;
    },
    async set() {
      return "OK";
    },
  };
}

const VALENCIA = { paisIso: "ES", estadoCodigo: "ES.60", ciudadId: 2509954 };
const MADRID = { paisIso: "ES", estadoCodigo: "ES.29", ciudadId: 3117735 };

async function filas() {
  return prisma.aforoZonaDia.findMany({
    orderBy: [{ alcance: "asc" }, { zona: "asc" }],
    select: { alcance: true, zona: true, personas: true },
  });
}

describe("contar y materializar", () => {
  it("cada persona cuenta en su ciudad, estado, país y global; la misma dos veces, una", async () => {
    const r = redisFalso();
    await contarEnAforo(r, { quien: "u:ana", ubicacion: VALENCIA, ahora: AHORA });
    await contarEnAforo(r, { quien: "u:ana", ubicacion: VALENCIA, ahora: AHORA });
    await contarEnAforo(r, { quien: "u:luis", ubicacion: VALENCIA, ahora: AHORA });
    await contarEnAforo(r, { quien: "u:eva", ubicacion: MADRID, ahora: AHORA });
    await materializarAforo(prisma, r, AHORA);
    expect(await filas()).toEqual([
      { alcance: "CIUDAD", zona: "2509954", personas: 2 },
      { alcance: "CIUDAD", zona: "3117735", personas: 1 },
      { alcance: "ESTADO", zona: "ES.29", personas: 1 },
      { alcance: "ESTADO", zona: "ES.60", personas: 2 },
      { alcance: "GLOBAL", zona: "*", personas: 3 },
      { alcance: "PAIS", zona: "ES", personas: 3 },
    ]);
  });

  it("reejecutar converge: recuento ABSOLUTO, nunca suma dos veces", async () => {
    const r = redisFalso();
    await contarEnAforo(r, { quien: "u:ana", ubicacion: VALENCIA, ahora: AHORA });
    await materializarAforo(prisma, r, AHORA);
    await materializarAforo(prisma, r, AHORA);
    await contarEnAforo(r, { quien: "u:luis", ubicacion: VALENCIA, ahora: AHORA });
    await materializarAforo(prisma, r, AHORA);
    await materializarAforo(prisma, r, AHORA);
    const global = (await filas()).find((f) => f.alcance === "GLOBAL");
    expect(global?.personas).toBe(2);
  });

  it("materializa también AYER (la última hora de ayer se ve en la primera pasada de hoy)", async () => {
    const r = redisFalso();
    const ayer = new Date(AHORA.getTime() - DIA);
    await contarEnAforo(r, { quien: "u:ana", ubicacion: VALENCIA, ahora: ayer });
    await materializarAforo(prisma, r, AHORA);
    const dias = await prisma.aforoZonaDia.findMany({
      where: { alcance: "GLOBAL" },
      select: { dia: true },
    });
    expect(dias.map((d) => d.dia.toISOString().slice(0, 10))).toEqual(["2026-11-04"]);
  });

  it("sin Redis no hace nada y lo dice; con Redis caído, contar no lanza", async () => {
    await expect(
      contarEnAforo(null, { quien: "u:a", ubicacion: VALENCIA }),
    ).resolves.toBeUndefined();
    expect(await materializarAforo(prisma, null, AHORA)).toEqual({ filas: 0, sinRedis: true });
    const caido = {
      pipeline() {
        throw new Error("ECONNREFUSED");
      },
    } as unknown as RedisAforo;
    await expect(
      contarEnAforo(caido, { quien: "u:a", ubicacion: VALENCIA }),
    ).resolves.toBeUndefined();
  });

  it("no guarda quién: en Redis solo hay el identificador opaco, nunca una IP o un correo", async () => {
    const r = redisFalso();
    await contarEnAforo(r, { quien: "i:3f2a…hash", ubicacion: VALENCIA, ahora: AHORA });
    const todo = JSON.stringify([...r.claves.entries()].map(([k, v]) => [k, [...v]]));
    expect(todo).not.toMatch(/\d+\.\d+\.\d+\.\d+|@/);
  });
});

describe("los VIP no forman parte del público de una zona", () => {
  // El aforo es el público de la PUBLICIDAD y un VIP no la ve: se le excluye AL CONTAR, para que el
  // dato guardado ya sea el bueno. Se prueba por la puerta del feed (`contarVisitaEnAforo`), que es la
  // que decide, y no por `contarEnAforo`, que cuenta a quien le digan.
  const vip = async (periodoFin: Date, estado = "ACTIVA") => {
    const userId = await crearUsuario(prisma);
    await prisma.subscription.create({
      data: { userId, plan: "VIP_MYTHIC", estado, periodoFin },
    });
    return userId;
  };
  const visitar = async (r: ReturnType<typeof redisFalso>, userId: string) =>
    contarVisitaEnAforo(prisma, { userId, ubicacion: VALENCIA }, { redis: r, ahora: AHORA });

  it("la visita de un VIP no incrementa el aforo; la de quien no lo es, sí", async () => {
    const r = redisFalso();
    await visitar(r, await vip(new Date(AHORA.getTime() + 10 * DIA)));
    await materializarAforo(prisma, r, AHORA);
    expect(await filas()).toEqual([]);

    await visitar(r, await crearUsuario(prisma));
    await materializarAforo(prisma, r, AHORA);
    expect((await filas()).find((f) => f.alcance === "GLOBAL")?.personas).toBe(1);
  });

  it("un VIP CANCELADO con el periodo por delante sigue sin contar; uno VENCIDO ya cuenta", async () => {
    const r = redisFalso();
    await visitar(r, await vip(new Date(AHORA.getTime() + DIA), "CANCELADA"));
    await visitar(r, await vip(new Date(AHORA.getTime() - DIA)));
    await materializarAforo(prisma, r, AHORA);
    expect((await filas()).find((f) => f.alcance === "GLOBAL")?.personas).toBe(1);
  });
});

describe("la mediana y la cascada", () => {
  // AHORA (2026-11-05) es anterior al despliegue de P5: estos casos fijan su propio «midiendo desde».
  // El de producción tiene su test aparte, abajo.
  const MIDE = { midiendoDesde: new Date("2026-10-01T00:00:00.000Z") };
  const sembrar = async (alcance: string, zona: string, porDia: Record<number, number>) => {
    for (const [hace, personas] of Object.entries(porDia)) {
      const dia = new Date(Date.UTC(2026, 10, 5) - Number(hace) * DIA);
      await prisma.aforoZonaDia.create({ data: { alcance, zona, dia, personas } });
    }
  };
  /** Marca como MEDIDOS esos días (hace N días): la fila GLOBAL es la que dice que se midió. */
  const medidos = (...hace: number[]) =>
    sembrar("GLOBAL", "*", Object.fromEntries(hace.map((h) => [h, 1000])));

  it("mediana de los días COMPLETOS medidos: hoy no cuenta, ni lo de hace más de 7 días", async () => {
    // hace=0 es HOY (a medias): no entra. hace=8 es demasiado viejo: no entra.
    await medidos(0, 1, 2, 3, 4, 8);
    await sembrar("CIUDAD", "2509954", { 0: 9999, 1: 10, 2: 50, 3: 20, 4: 30, 8: 9999 });
    expect(await medianaAforo(prisma, { nivel: "CIUDAD", zona: "2509954" }, AHORA, MIDE)).toBe(25);
  });

  it("una zona con 1 visita en 7 días medidos da mediana 0 (los días sin fila cuentan como 0)", async () => {
    // EL FALLO QUE SE CORRIGIÓ: antes solo contaban los días con fila, y esta ciudad salía con 1.
    await medidos(1, 2, 3, 4, 5, 6, 7);
    await sembrar("CIUDAD", "2509954", { 3: 1 });
    expect(await medianaAforo(prisma, { nivel: "CIUDAD", zona: "2509954" }, AHORA, MIDE)).toBe(0);
  });

  it("un día SIN fila GLOBAL no se midió: no cuenta como 0, se salta", async () => {
    // Redis caído los días 4-7: solo se midieron 1-3. La ciudad tuvo 10, 20 y 30 esos días.
    await medidos(1, 2, 3);
    await sembrar("CIUDAD", "2509954", { 1: 10, 2: 20, 3: 30 });
    expect(await medianaAforo(prisma, { nivel: "CIUDAD", zona: "2509954" }, AHORA, MIDE)).toBe(20);
  });

  it("sin ningún día medido: null (no 0)", async () => {
    expect(await medianaAforo(prisma, { nivel: "CIUDAD", zona: "1" }, AHORA, MIDE)).toBeNull();
  });

  it("antes del despliegue de P5 no se midió nada: ni un día anterior al 2026-11-07 cuenta", async () => {
    // Filas sembradas el 2026-11-04..06 (incluido el día del despliegue, medido a medias): con el
    // «midiendo desde» de producción, nada de eso es un día medido.
    await medidos(1, 2, 3);
    await sembrar("CIUDAD", "2509954", { 1: 10, 2: 20, 3: 30 });
    expect(await medianaAforo(prisma, { nivel: "CIUDAD", zona: "2509954" }, AHORA)).toBeNull();
    const dia8 = new Date("2026-11-08T12:00:00.000Z");
    expect(
      await medianaAforo(prisma, { nivel: "CIUDAD", zona: "2509954" }, dia8),
      "el 2026-11-06 está medido a medias: tampoco entra",
    ).toBeNull();
  });

  it("varias zonas a la vez dan lo mismo que una a una", async () => {
    await medidos(1, 2, 3);
    await sembrar("CIUDAD", "1", { 1: 5, 2: 7, 3: 9 });
    await sembrar("CIUDAD", "2", { 2: 4 });
    const m = await medianasAforo(prisma, "CIUDAD", ["1", "2", "3"], AHORA, MIDE);
    expect(Object.fromEntries(m)).toEqual({ "1": 7, "2": 0, "3": 0 });
  });

  it("la cascada sube de nivel si no hay tráfico (null o 0), y dice de qué nivel es la cifra", async () => {
    await medidos(1, 2, 3);
    await sembrar("PAIS", "CO", { 1: 300, 2: 310, 3: 290 });
    const local = [
      { nivel: "CIUDAD" as const, zona: "3674962" },
      { nivel: "ESTADO" as const, zona: "CO.02" },
      { nivel: "PAIS" as const, zona: "CO" },
    ];
    expect(await aforoEnCascada(prisma, local, AHORA, MIDE)).toEqual({
      nivel: "PAIS",
      zona: "CO",
      personas: 300,
    });
    // Una visita en tres días medidos: mediana 0, y con 0 se sube igual que sin datos.
    await sembrar("CIUDAD", "3674962", { 1: 40 });
    expect(await aforoEnCascada(prisma, local, AHORA, MIDE)).toMatchObject({ nivel: "PAIS" });
    await sembrar("CIUDAD", "3674962", { 2: 40, 3: 40 });
    expect(await aforoEnCascada(prisma, local, AHORA, MIDE)).toMatchObject({
      nivel: "CIUDAD",
      personas: 40,
    });
    expect(await aforoEnCascada(prisma, [{ nivel: "PAIS", zona: "XX" }], AHORA, MIDE)).toBeNull();
  });
});

describe("el aviso del fichero de IP", () => {
  it("puro: más de 60 días es viejo; 60 justos, no; sin fichero, viejo", () => {
    const ahora = AHORA.getTime();
    expect(estadoFicheroIp(ahora - 60 * DIA, ahora)).toEqual({ dias: 60, viejo: false });
    expect(estadoFicheroIp(ahora - 61 * DIA, ahora)).toEqual({ dias: 61, viejo: true });
    expect(estadoFicheroIp(null, ahora)).toEqual({ dias: null, viejo: true });
  });

  it("un correo al cruzar, silencio mientras sigue viejo, y re-armado al actualizarse", async () => {
    const enviados: EmailMessage[] = [];
    const adapter = {
      name: "test",
      send: async (m: EmailMessage) => void enviados.push(m),
    } as unknown as EmailAdapter;
    let fecha: number | null = AHORA.getTime() - 61 * DIA;
    const revisar = () =>
      revisarFicheroGeoIp(prisma, {
        ruta: "/srv/geoip/x.mmdb",
        adapter,
        adminEmail: "admin@dareflash.test",
        ahora: AHORA,
        fechaFichero: async () => fecha,
      });
    expect((await revisar()).avisado).toBe(true);
    expect((await revisar()).avisado).toBe(false);
    expect(enviados).toHaveLength(1);
    expect(enviados[0]?.subject).toMatch(/61 días/);
    fecha = AHORA.getTime() - 2 * DIA; // el cron volvió a correr
    expect((await revisar()).avisado).toBe(false);
    fecha = null; // y luego alguien borra el fichero
    expect((await revisar()).avisado).toBe(true);
    expect(enviados[1]?.subject).toMatch(/no hay fichero/);
  });
});
