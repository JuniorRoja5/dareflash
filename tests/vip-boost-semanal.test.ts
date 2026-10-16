/**
 * EL REGALO SEMANAL DEL VIP (Fase 8 · P5) — y lo que de verdad se prueba es la IDEMPOTENCIA.
 *
 * Un reparto que acredita saldo y que se re-ejecuta por diseño —el worker reintenta, el reaper
 * reencola, dos barridos se solapan— solo es seguro si repetirlo no da un segundo boost. Y eso no
 * puede depender de un `if`: depende de la `idempotencyKey` por (persona, semana).
 *
 * ┌─ CADA CASO MIRA EL SALDO, NO EL ESTADO DEL JOB ─────────────────────────────────────────────┐
 * │ Un reparto que responde "ya estaba" y además inserta una fila estaría verde mirando solo lo │
 * │ que devuelve. Lo que no miente es `User.boostBalance` y el COUNT de filas del ledger.       │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Para romperlo a propósito: quitar la semana de la clave (rojo: el segundo run acredita otra
 * vez), cambiar el chokepoint por un `estado === "ACTIVA"` (rojo: la vencida cobra), o poner
 * `amountCents` en la fila (rojo: el regalo pasaría a ser una compra).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { RAZON_BOOST_VIP_SEMANAL, REF_BOOST_VIP, VIP_BOOST_SEMANAL } from "../src/config/constants";
import type { PrismaClient } from "../src/generated/prisma/client";
import { semanaIso } from "../src/lib/periodo";
import {
  arrancarRepartoSemanal,
  claveRegaloSemanal,
  encolarTramoSemanal,
  repartirBoostSemanal,
  TIPO_JOB_VIP_BOOST,
} from "../src/server/services/vip-boost-semanal";
import { registrarSuscripcion } from "../src/server/services/vip";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

let prisma: PrismaClient;

const AHORA = new Date("2026-06-15T12:00:00.000Z"); // lunes
const SEMANA = semanaIso(AHORA);
const SEMANA_SIGUIENTE = new Date("2026-06-22T12:00:00.000Z");

beforeAll(() => {
  prisma = createTestPrisma();
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
});

/** Un VIP con su suscripción. `vigente:false` = periodo ya pasado (el webhook de la baja se perdió). */
async function vip(
  username: string,
  { vigente = true, estado = "ACTIVA" }: { vigente?: boolean; estado?: string } = {},
): Promise<string> {
  const id = await crearUsuario(prisma, { username });
  await registrarSuscripcion(prisma, {
    userId: id,
    estado,
    periodoFin: new Date(AHORA.getTime() + (vigente ? 30 * 86_400_000 : -86_400_000)),
  });
  return id;
}

const saldo = async (id: string): Promise<number> =>
  (await prisma.user.findUniqueOrThrow({ where: { id }, select: { boostBalance: true } }))
    .boostBalance;

const filas = (id: string) =>
  prisma.boostLedger.count({ where: { userId: id, reason: RAZON_BOOST_VIP_SEMANAL } });

const repartir = (extra: { desde?: string | null; ahora?: Date; semana?: string } = {}) =>
  repartirBoostSemanal(prisma, {
    semana: extra.semana ?? SEMANA,
    desde: extra.desde ?? null,
    ahora: extra.ahora ?? AHORA,
  });

describe("quién cobra", () => {
  it("un VIP activo recibe su boost", async () => {
    const id = await vip("la_vip");
    const r = await repartir();
    expect(r.acreditados).toBe(1);
    expect(await saldo(id)).toBe(VIP_BOOST_SEMANAL);
  });

  it("una suscripción ACTIVA con el periodo VENCIDO no cobra", async () => {
    // El caso que separa el chokepoint de un flag: el webhook de la baja se puede perder y la
    // fila se queda en ACTIVA. Lo único cierto es `periodoFin`.
    const id = await vip("caducada", { vigente: false });
    const r = await repartir();
    expect(r.acreditados).toBe(0);
    expect(await saldo(id)).toBe(0);
    expect(await filas(id)).toBe(0);
  });

  it("una CORTADA con el periodo por delante tampoco: el estado puede QUITAR", async () => {
    // Esta sí entra en la consulta (su periodo no ha pasado), así que es `esVipActivo` quien la
    // descarta. Es el caso que prueba que la decisión no está en el `where`.
    const id = await vip("cortada", { estado: "CORTADA" });
    const r = await repartir();
    expect(r.revisados, "la cortada no llegó a mirarse: el caso no mide nada").toBe(1);
    expect(r.acreditados).toBe(0);
    expect(await saldo(id)).toBe(0);
  });

  it("una CANCELADA con el periodo por delante SÍ: pagó el mes y lo tiene", async () => {
    const id = await vip("cancelada", { estado: "CANCELADA" });
    expect((await repartir()).acreditados).toBe(1);
    expect(await saldo(id)).toBe(VIP_BOOST_SEMANAL);
  });

  it("quien no tiene suscripción ni se mira", async () => {
    const plano = await crearUsuario(prisma, { username: "sin_plan" });
    const r = await repartir();
    expect(r.revisados).toBe(0);
    expect(await saldo(plano)).toBe(0);
  });
});

describe("IDEMPOTENCIA: la semana entra en la clave", () => {
  it("dos repartos de la MISMA semana dejan el saldo en +1, no en +2", async () => {
    const id = await vip("la_vip");
    expect((await repartir()).acreditados).toBe(1);
    const segundo = await repartir();
    expect(segundo.acreditados, "el segundo reparto acreditó otra vez").toBe(0);
    expect(await saldo(id)).toBe(VIP_BOOST_SEMANAL);
    expect(await filas(id)).toBe(1);
  });

  it("y la semana SIGUIENTE sí da otro", async () => {
    // Si la semana no estuviera en la clave, el VIP cobraría una vez en la vida.
    const id = await vip("la_vip");
    await repartir();
    const otra = await repartir({ semana: semanaIso(SEMANA_SIGUIENTE), ahora: SEMANA_SIGUIENTE });
    expect(otra.acreditados).toBe(1);
    expect(await saldo(id)).toBe(2 * VIP_BOOST_SEMANAL);
    expect(await filas(id)).toBe(2);
  });

  it("TRES repartos a la vez de la misma semana dejan UNO", async () => {
    // Lo que esto descarta es una lectura previa: tres barridos solapados leerían "no tiene" y
    // acreditarían tres. Lo corta la UNIQUE del ledger.
    const id = await vip("la_vip");
    await Promise.all([repartir(), repartir(), repartir()]);
    expect(await saldo(id)).toBe(VIP_BOOST_SEMANAL);
    expect(await filas(id)).toBe(1);
  });

  it("la clave es exactamente `vip-weekly:<usuario>:<semana>`", async () => {
    // Está escrita en el test a propósito: leerla de la función dejaría el caso siempre verde, y
    // esta clave es un contrato con las filas que ya existan en producción.
    const id = await vip("la_vip");
    await repartir();
    const fila = await prisma.boostLedger.findUniqueOrThrow({
      where: { idempotencyKey: `vip-weekly:${id}:${SEMANA}` },
      select: { delta: true },
    });
    expect(fila.delta).toBe(VIP_BOOST_SEMANAL);
    expect(claveRegaloSemanal(id, SEMANA)).toBe(`vip-weekly:${id}:${SEMANA}`);
  });
});

describe("es un REGALO, no una compra", () => {
  it("la fila va sin importe ni moneda, con su razón y su referencia", async () => {
    const id = await vip("la_vip");
    await repartir();
    const fila = await prisma.boostLedger.findFirstOrThrow({
      where: { userId: id },
      select: {
        delta: true,
        reason: true,
        amountCents: true,
        currency: true,
        refType: true,
        refId: true,
        nota: true,
      },
    });
    expect(fila).toEqual({
      delta: VIP_BOOST_SEMANAL,
      reason: RAZON_BOOST_VIP_SEMANAL,
      // SIN IMPORTE: el "valor 5 $" del maestro es copy de venta. Ponerlo aquí metería dinero que
      // nadie ha cobrado en cualquier cuenta que sume importes del ledger.
      amountCents: null,
      currency: null,
      refType: REF_BOOST_VIP,
      refId: SEMANA,
      // La nota es de los ajustes que escribe una persona; esto es automático.
      nota: null,
    });
  });
});

describe("el recorrido es por KEYSET y reanudable", () => {
  it("con lotes pequeños recorre a TODOS en varios tramos", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 7; i += 1) ids.push(await vip(`vip${i}`));

    // Lote de 2 y UN lote por ejecución: hacen falta varios tramos, como en producción.
    let cursor: string | null = null;
    let total = 0;
    for (let i = 0; i < 10; i += 1) {
      const t: Awaited<ReturnType<typeof repartirBoostSemanal>> = await repartirBoostSemanal(
        prisma,
        { semana: SEMANA, desde: cursor, ahora: AHORA },
        { lote: 2, lotes: 1 },
      );
      total += t.acreditados;
      cursor = t.siguiente;
      if (!cursor) break;
    }
    expect(cursor, "el recorrido no terminó").toBeNull();
    expect(total).toBe(7);
    for (const id of ids) expect(await saldo(id)).toBe(VIP_BOOST_SEMANAL);
  });

  it("y reanudar desde un cursor viejo no acredita dos veces a quien ya cobró", async () => {
    // El caso del worker que muere a mitad de tramo: el job se reencola y vuelve a pasar por
    // gente que ya cobró. El cursor es eficiencia; la corrección la da la clave.
    const ids: string[] = [];
    for (let i = 0; i < 5; i += 1) ids.push(await vip(`vip${i}`));

    await repartirBoostSemanal(prisma, { semana: SEMANA, ahora: AHORA }, { lote: 2, lotes: 1 });
    // Desde el principio otra vez, el tramo entero.
    await repartirBoostSemanal(prisma, { semana: SEMANA, ahora: AHORA }, { lote: 50, lotes: 10 });

    for (const id of ids) {
      expect(await saldo(id)).toBe(VIP_BOOST_SEMANAL);
      expect(await filas(id)).toBe(1);
    }
  });

  it("un VIP que se suscribe a mitad de reparto cobra la semana SIGUIENTE, no dos veces", async () => {
    // La audiencia cambia mientras se recorre. Lo que no puede pasar es que alguien cobre dos
    // veces; quedarse fuera de ESTA semana es correcto y se arregla solo a la siguiente.
    const antes: string[] = [];
    for (let i = 0; i < 4; i += 1) antes.push(await vip(`a${i}`));

    const t1 = await repartirBoostSemanal(
      prisma,
      { semana: SEMANA, ahora: AHORA },
      { lote: 2, lotes: 1 },
    );
    expect(t1.siguiente).not.toBeNull();

    // Llega uno nuevo A MITAD. Su `userId` puede caer antes o después del cursor; lo que se
    // comprueba es que nadie acabe con dos filas.
    const nuevo = await vip("zz_nuevo");

    let cursor = t1.siguiente;
    while (cursor) {
      const t: Awaited<ReturnType<typeof repartirBoostSemanal>> = await repartirBoostSemanal(
        prisma,
        { semana: SEMANA, desde: cursor, ahora: AHORA },
        { lote: 2, lotes: 1 },
      );
      cursor = t.siguiente;
    }

    for (const id of [...antes, nuevo]) {
      expect(await filas(id), `${id} tiene filas de más`).toBeLessThanOrEqual(1);
      expect(await saldo(id)).toBeLessThanOrEqual(VIP_BOOST_SEMANAL);
    }
    // Y la semana siguiente cobran TODOS, el nuevo incluido.
    await repartirBoostSemanal(
      prisma,
      { semana: semanaIso(SEMANA_SIGUIENTE), ahora: SEMANA_SIGUIENTE },
      { lote: 50, lotes: 10 },
    );
    expect(await filas(nuevo)).toBeGreaterThanOrEqual(1);
  });
});

describe("el disparador del worker", () => {
  it("arranca el reparto UNA vez por semana", async () => {
    const primero = await arrancarRepartoSemanal(prisma, AHORA);
    expect(primero).toEqual({ semana: SEMANA, arrancado: true });
    // El siguiente barrido de la misma semana no arranca otro: lo para la clave del job.
    expect((await arrancarRepartoSemanal(prisma, AHORA)).arrancado).toBe(false);
    expect(await prisma.job.count({ where: { type: TIPO_JOB_VIP_BOOST } })).toBe(1);
  });

  it("y la semana siguiente arranca otro", async () => {
    await arrancarRepartoSemanal(prisma, AHORA);
    const otra = await arrancarRepartoSemanal(prisma, SEMANA_SIGUIENTE);
    expect(otra.arrancado).toBe(true);
    expect(otra.semana).not.toBe(SEMANA);
    expect(await prisma.job.count({ where: { type: TIPO_JOB_VIP_BOOST } })).toBe(2);
  });

  it("un worker que estuvo caído el lunes arranca igual el martes", async () => {
    // No hay cron: el barrido mira si la semana en curso ya se arrancó. Nadie pierde su boost por
    // que el proceso estuviera apagado en el instante exacto.
    const martes = new Date("2026-06-16T08:00:00.000Z");
    const r = await arrancarRepartoSemanal(prisma, martes);
    expect(r.semana).toBe(SEMANA);
    expect(r.arrancado).toBe(true);
  });

  it("la continuación de un tramo no se encola dos veces", async () => {
    expect(await encolarTramoSemanal(prisma, SEMANA, "u123", AHORA)).toBe(true);
    expect(await encolarTramoSemanal(prisma, SEMANA, "u123", AHORA)).toBe(false);
    expect(await prisma.job.count({ where: { type: TIPO_JOB_VIP_BOOST } })).toBe(1);
  });
});

describe("DE PUNTA A PUNTA: por la cola de verdad", () => {
  /**
   * Lo que esto comprueba y ninguno de los de arriba: que el job encolado lo DESPACHA el worker
   * y acredita. Entre el servicio y el saldo hay tres cables —el tipo del job, el handler en el
   * registro y el despacho— y los tres se pueden soltar sin que falle nada: los jobs se quedarían
   * PENDING para siempre y el beneficio no llegaría nunca.
   */
  it("arrancar + procesar el lote acredita a los VIP, y repetirlo no acredita más", async () => {
    const { procesarLote } = await import("../src/server/jobs/worker");
    const { construirRegistro } = await import("../src/server/jobs/registry");

    // CONTRA EL RELOJ DE VERDAD, y no contra `AHORA`: el handler del job no recibe un instante
    // inyectado —en producción no hay quien se lo pase— así que evalúa el VIP con `new Date()`.
    // Con las suscripciones del resto del fichero (ancladas a junio de 2026) nadie saldría activo
    // y este caso habría pasado en verde sin acreditar a nadie. Es lo que pasó al escribirlo.
    const ahoraReal = new Date();
    const ids: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const id = await crearUsuario(prisma, { username: `e2e${i}` });
      await registrarSuscripcion(prisma, {
        userId: id,
        estado: "ACTIVA",
        periodoFin: new Date(ahoraReal.getTime() + 30 * 86_400_000),
      });
      ids.push(id);
    }

    const registro = construirRegistro({
      db: prisma,
      // Ni correo ni Bunny se ejercitan aquí: stubs inertes que cumplen el tipo.
      emailAdapter: { name: "nulo", async send() {} },
      bunny: {
        cliente: {
          crearVideo: async () => ({ guid: "x" }),
          getVideo: async () => ({ status: 4, length: 0, thumbnailFileName: null }),
          listVideos: async () => ({ items: [], totalItems: 0 }),
          deleteVideo: async () => {},
          setThumbnail: async () => {},
        },
        config: { libraryId: "lib", apiKey: "key" },
      },
    });

    await arrancarRepartoSemanal(prisma, ahoraReal);
    const r = await procesarLote(prisma, registro, { workerToken: "w1", limit: 10 });
    expect(r.fallidos, "el tramo falló").toBe(0);
    expect(r.hechos).toBe(1);
    for (const id of ids) expect(await saldo(id)).toBe(VIP_BOOST_SEMANAL);

    // Y otra vuelta del barrido en la MISMA semana no encola nada ni acredita nada.
    await arrancarRepartoSemanal(prisma, ahoraReal);
    const segunda = await procesarLote(prisma, registro, { workerToken: "w1", limit: 10 });
    expect(segunda.hechos).toBe(0);
    for (const id of ids) expect(await saldo(id)).toBe(VIP_BOOST_SEMANAL);
  });
});
