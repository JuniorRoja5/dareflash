/**
 * ANUNCIOS: enviar, repartir y revisar (Fase 4). Contra la BD, y el reparto por el runner REAL
 * (`procesarLote` + el registro de jobs), como corre en producción.
 *
 * LA IDEMPOTENCIA DEL REPARTO, CON LUPA. Exactamente un aviso por cuenta de la audiencia, pase lo que
 * pase: re-ejecutar el job, reanudarlo tras una caída, correr varios repartos a la vez, reanudar por
 * tramos. Y enviar no reparte: la petición no escribe ni un aviso.
 *
 * Para romperlo a propósito: repartir dentro del envío (rojo el primero); quitar `skipDuplicates`
 * (rojo: re-ejecución, repartos a la vez, reanudación); quitar el corte de audiencia (rojo); una clave
 * de tramo sin cursor (rojo); ordenar el keyset al revés (rojo).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { ANUNCIO_TEXTO_MAX } from "../src/config/constants";
import type { PrismaClient } from "../src/generated/prisma/client";
import { leerFiltrosInspector } from "../src/lib/filtros-inspector";
import {
  avisoAnuncio,
  avisoSubisteNivel,
  avisoVideoListo,
  avisoVotoRecibido,
} from "../src/lib/notificaciones";
import { construirRegistro } from "../src/server/jobs/registry";
import { procesarLote } from "../src/server/jobs/worker";
import {
  claveTramo,
  encolarTramo,
  enviarAnuncio,
  inspeccionarNotificaciones,
  listarAnuncios,
  repartirAnuncio,
  TIPO_JOB_FANOUT,
} from "../src/server/services/anuncios";
import { emitirAviso, listarNotificaciones } from "../src/server/services/notificaciones";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

let prisma: PrismaClient;
let admin: string;

beforeAll(() => {
  prisma = createTestPrisma();
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
  admin = await crearUsuario(prisma, { username: "admin_anuncios" });
});

const TEXTO = "Mantenimiento programado el sábado de 10:00 a 11:00 (UTC).";

/**
 * Un instante unos segundos POR DELANTE del reloj. Las cuentas del test nacen con la hora de la BD
 * (otro reloj) y el corte de audiencia es `createdAt <= envío`: así ninguna se queda fuera por un
 * desfase de milisegundos entre los dos relojes.
 */
const enElFuturo = (ms = 5_000) => new Date(Date.now() + ms);

const enviar = (texto = TEXTO, clave: string = crypto.randomUUID()) =>
  enviarAnuncio(prisma, { adminId: admin, texto, clave }, enElFuturo());

const avisosDe = (id: string) =>
  prisma.notification.count({ where: { tipo: "ANUNCIO", refType: "ANUNCIO", refId: id } });

const porCuenta = async (id: string) =>
  (
    await prisma.notification.groupBy({
      by: ["userId"],
      where: { refId: id },
      _count: { _all: true },
    })
  ).map((c) => ({ userId: c.userId, n: c._count._all }));

async function cuentas(n: number): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < n; i += 1) ids.push(await crearUsuario(prisma));
  return ids;
}

const registro = () =>
  construirRegistro({
    db: prisma,
    emailAdapter: { name: "inerte", async send() {} },
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

/** El worker REAL, hasta vaciar la cola de repartos. Con tope: un bucle sin fin sería un fallo. */
async function vaciarCola(): Promise<void> {
  const luego = enElFuturo(60_000);
  for (let i = 0; i < 30; i += 1) {
    await procesarLote(prisma, registro(), {
      workerToken: `w-${i}-${crypto.randomUUID()}`,
      limit: 10,
      now: luego,
    });
    const quedan = await prisma.job.count({
      where: { type: TIPO_JOB_FANOUT, status: "PENDING", runAt: { lte: luego } },
    });
    if (quedan === 0) return;
  }
  throw new Error("la cola de repartos no se vació");
}

describe("enviar: crea el anuncio y encola su reparto, y NO reparte", () => {
  it("UN anuncio, UN job con su anuncio en el payload, y CERO avisos en la petición", async () => {
    await cuentas(3);
    const r = await enviar();

    expect(r).toMatchObject({ creado: true, targetCount: 4 }); // 3 + el admin
    expect(await prisma.announcement.count()).toBe(1);
    const jobs = await prisma.job.findMany({ where: { type: TIPO_JOB_FANOUT } });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      status: "PENDING",
      payload: { announcementId: r.id },
      idempotencyKey: claveTramo(r.id, null),
    });
    expect(await prisma.notification.count()).toBe(0);
  });

  it("la foto de la audiencia no cuenta cuentas borradas ni baneadas", async () => {
    const [borrada, baneada] = await cuentas(3);
    await prisma.user.update({ where: { id: borrada! }, data: { deletedAt: new Date() } });
    await prisma.user.update({ where: { id: baneada! }, data: { bannedAt: new Date() } });
    expect((await enviar()).targetCount).toBe(2); // la tercera + el admin
  });

  it("reenviar con la MISMA clave (doble clic) no crea otro anuncio ni otro job", async () => {
    const clave = crypto.randomUUID();
    const a = await enviar(TEXTO, clave);
    const b = await enviar(TEXTO, clave);

    expect(b).toEqual({ id: a.id, targetCount: a.targetCount, creado: false });
    expect(await prisma.announcement.count()).toBe(1);
    expect(await prisma.job.count({ where: { type: TIPO_JOB_FANOUT } })).toBe(1);
  });

  it("tres envíos A LA VEZ con la misma clave: un anuncio y un job", async () => {
    const clave = crypto.randomUUID();
    const r = await Promise.all([1, 2, 3].map(() => enviar(TEXTO, clave)));

    expect(new Set(r.map((x) => x.id)).size).toBe(1);
    expect(r.filter((x) => x.creado)).toHaveLength(1);
    expect(await prisma.announcement.count()).toBe(1);
    expect(await prisma.job.count({ where: { type: TIPO_JOB_FANOUT } })).toBe(1);
  });

  it("sin texto, solo espacios o demasiado largo: no se crea nada", async () => {
    for (const texto of ["", "    ", "x".repeat(ANUNCIO_TEXTO_MAX + 1)]) {
      await expect(enviar(texto)).rejects.toMatchObject({ code: "TEXTO_INVALIDO" });
    }
    expect(await prisma.announcement.count()).toBe(0);
    expect(await prisma.job.count()).toBe(0);
  });
});

describe("repartir (FANOUT_ANUNCIO): uno por cuenta, se ejecute las veces que se ejecute", () => {
  it("entrega EXACTAMENTE un aviso por cuenta de la audiencia, y el recuento llega al objetivo", async () => {
    const [, borrada, baneada] = await cuentas(5);
    await prisma.user.update({ where: { id: borrada! }, data: { deletedAt: new Date() } });
    await prisma.user.update({ where: { id: baneada! }, data: { bannedAt: new Date() } });
    const a = await enviar();

    await vaciarCola();

    const recibidos = await porCuenta(a.id);
    expect(recibidos.every((c) => c.n === 1)).toBe(true);
    expect(recibidos.map((c) => c.userId)).not.toContain(borrada);
    expect(recibidos.map((c) => c.userId)).not.toContain(baneada);
    expect(a.targetCount).toBe(4);
    expect(await avisosDe(a.id)).toBe(a.targetCount);
    expect(await prisma.job.count({ where: { type: TIPO_JOB_FANOUT, status: "DONE" } })).toBe(1);
  });

  it("RE-EJECUTAR el reparto entrega CERO avisos nuevos (a mano, y con el job re-encolado)", async () => {
    await cuentas(3);
    const a = await enviar();
    await vaciarCola();
    const antes = await avisosDe(a.id);

    expect(await repartirAnuncio(prisma, a.id, null)).toEqual({ entregadas: 0, siguiente: null });

    // Lo que hace el reaper con un job REQUEUE cuyo worker murió: vuelve a la cola y corre otra vez.
    await prisma.job.create({
      data: {
        type: TIPO_JOB_FANOUT,
        payload: { announcementId: a.id },
        runAt: new Date(),
        idempotencyKey: "reintento-tras-caida",
      },
    });
    await vaciarCola();

    expect(await avisosDe(a.id)).toBe(antes);
    expect((await porCuenta(a.id)).every((c) => c.n === 1)).toBe(true);
  });

  it("TRES repartos A LA VEZ del mismo anuncio: sigue habiendo uno por cuenta", async () => {
    await cuentas(6);
    const a = await enviar();

    const tramos = await Promise.all([1, 2, 3].map(() => repartirAnuncio(prisma, a.id, null)));

    expect(tramos.reduce((s, t) => s + t.entregadas, 0)).toBe(a.targetCount);
    expect(await avisosDe(a.id)).toBe(a.targetCount);
    expect((await porCuenta(a.id)).every((c) => c.n === 1)).toBe(true);
  });

  it("REANUDABLE por tramos, con el cursor: ni se repite ni se salta a nadie", async () => {
    await cuentas(7); // + el admin = 8
    const a = await enviar();
    const orden = (
      await prisma.user.findMany({ orderBy: { id: "asc" }, select: { id: true } })
    ).map((u) => u.id);

    const t1 = await repartirAnuncio(prisma, a.id, null, { lote: 3, lotes: 1 });
    expect(t1).toEqual({ entregadas: 3, siguiente: orden[2] });

    // El mismo tramo, re-ejecutado, no encola dos continuaciones: su clave lleva el cursor.
    expect(await encolarTramo(prisma, a.id, t1.siguiente!)).toBe(true);
    expect(await encolarTramo(prisma, a.id, t1.siguiente!)).toBe(false);
    expect(
      await prisma.job.count({ where: { idempotencyKey: claveTramo(a.id, t1.siguiente) } }),
    ).toBe(1);

    let desde = t1.siguiente;
    let total = t1.entregadas;
    for (let i = 0; desde && i < 10; i += 1) {
      const t = await repartirAnuncio(prisma, a.id, desde, { lote: 3, lotes: 1 });
      total += t.entregadas;
      desde = t.siguiente;
    }
    expect(total).toBe(8);
    expect(await avisosDe(a.id)).toBe(8);
  });

  it("un reparto que se cayó A MEDIAS se completa sin duplicar lo ya entregado", async () => {
    const [u1, u2] = await cuentas(4);
    const a = await enviar();
    // Lo que dejó escrito un reparto que murió a medias.
    await emitirAviso(prisma, u1!, avisoAnuncio(a.id));
    await emitirAviso(prisma, u2!, avisoAnuncio(a.id));

    await vaciarCola();

    expect(await avisosDe(a.id)).toBe(a.targetCount);
    expect((await porCuenta(a.id)).every((c) => c.n === 1)).toBe(true);
  });

  it("quien se registra DESPUÉS del envío no lo recibe: el recuento mide lo mismo que el objetivo", async () => {
    await cuentas(2);
    const a = await enviar();
    const tarde = await crearUsuario(prisma);
    await prisma.user.update({ where: { id: tarde }, data: { createdAt: enElFuturo(60_000) } });

    await vaciarCola();

    expect(await prisma.notification.count({ where: { userId: tarde } })).toBe(0);
    expect(await avisosDe(a.id)).toBe(a.targetCount);
  });

  it("el job es REQUEUE (idempotente de verdad), no FAIL como el correo", () => {
    expect(registro()["FANOUT_ANUNCIO"]?.reaper).toBe("REQUEUE");
  });

  it("un anuncio que no existe: el tramo termina sin escribir nada", async () => {
    expect(await repartirAnuncio(prisma, "no-existe", null)).toEqual({
      entregadas: 0,
      siguiente: null,
    });
    expect(await prisma.notification.count()).toBe(0);
  });
});

describe("revisar los anuncios enviados", () => {
  it("progreso EXACTO por COUNT sobre el objetivo, y el estado de cada reparto", async () => {
    const [u1] = await cuentas(2); // + el admin = 3
    const a = await enviar("Primer anuncio del mes.");
    await vaciarCola();
    const b = await enviar("Segundo anuncio del mes.");
    const c = await enviar("Tercer anuncio del mes.");
    await prisma.job.updateMany({
      where: { idempotencyKey: claveTramo(c.id, null) },
      data: { status: "FAILED" },
    });

    const estados = async () => new Map((await listarAnuncios(prisma)).items.map((i) => [i.id, i]));
    let e = await estados();
    expect(e.get(a.id)).toMatchObject({
      entregadas: 3,
      targetCount: 3,
      estado: "entregado",
      autor: "admin_anuncios",
      texto: "Primer anuncio del mes.",
    });
    expect(e.get(b.id)).toMatchObject({ entregadas: 0, targetCount: 3, estado: "repartiendo" });
    expect(e.get(c.id)).toMatchObject({ entregadas: 0, estado: "fallido" });

    // Baneada ANTES de que el reparto le llegue: no lo recibe (no debe), y ese anuncio termina por
    // debajo de su objetivo. La revisión lo dice, en vez de "repartiendo" para siempre.
    await prisma.user.update({ where: { id: u1! }, data: { bannedAt: new Date() } });
    await vaciarCola();
    e = await estados();
    expect(e.get(b.id)).toMatchObject({ entregadas: 2, targetCount: 3, estado: "terminado" });
  });

  it("la lista pagina por keyset, más nuevos primero, sin repetir ni saltar", async () => {
    for (let i = 0; i < 5; i += 1) await enviar(`Anuncio número ${i}`);
    const esperado = (
      await prisma.announcement.findMany({
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { id: true },
      })
    ).map((a) => a.id);

    const vistos: string[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 10; i += 1) {
      const p: Awaited<ReturnType<typeof listarAnuncios>> = await listarAnuncios(prisma, {
        cursor,
        limite: 2,
      });
      vistos.push(...p.items.map((x) => x.id));
      cursor = p.nextCursor;
      if (!cursor) break;
    }
    expect(vistos).toEqual(esperado);
  });

  it("sin anuncios: lista vacía", async () => {
    expect(await listarAnuncios(prisma)).toEqual({ items: [], nextCursor: null });
  });
});

describe("en la campana y la bandeja", () => {
  it("el ANUNCIO sale con el texto del anuncio, UNIDO por refId, y la fila no lo copia", async () => {
    const [u1] = await cuentas(1);
    await enviar();
    await vaciarCola();

    const p = await listarNotificaciones(prisma, u1!);
    expect(p.items).toHaveLength(1);
    expect(p.items[0]).toMatchObject({ tipo: "ANUNCIO", texto: TEXTO, href: "/notificaciones" });

    const fila = await prisma.notification.findFirstOrThrow({ where: { userId: u1! } });
    expect(fila.datos).toEqual({});
    expect(JSON.stringify(fila)).not.toContain("Mantenimiento");
  });
});

describe("inspector de notificaciones (todas las cuentas)", () => {
  it("recorre TODAS las cuentas por keyset, sin repetir ni saltar", async () => {
    const [u1, u2] = await cuentas(2);
    for (const u of [u1!, u2!, admin]) {
      for (let i = 0; i < 3; i += 1) await emitirAviso(prisma, u, avisoVideoListo(`v-${u}-${i}`));
    }
    const todas = (await prisma.notification.findMany({ select: { id: true } })).map((n) => n.id);

    const vistos: string[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 10; i += 1) {
      const p: Awaited<ReturnType<typeof inspeccionarNotificaciones>> =
        await inspeccionarNotificaciones(prisma, leerFiltrosInspector({}).filtros, {
          cursor,
          limite: 4,
        });
      vistos.push(...p.items.map((x) => x.id));
      cursor = p.nextCursor;
      if (!cursor) break;
    }
    expect(vistos).toHaveLength(9);
    expect(new Set(vistos)).toEqual(new Set(todas));
  });

  it("filtra por usuario (con o sin @), por tipo y por días UTC enteros", async () => {
    const [u1] = await cuentas(1);
    const lucia = await crearUsuario(prisma, { username: "lucia_insp" });
    await emitirAviso(prisma, lucia, avisoVideoListo("v1"));
    await emitirAviso(prisma, lucia, avisoSubisteNivel("challenger"));
    await emitirAviso(prisma, u1!, avisoVideoListo("v2"));
    await prisma.notification.create({
      data: {
        userId: u1!,
        tipo: "VIDEO_LISTO",
        refType: "VIDEO",
        refId: "viejo",
        datos: {},
        createdAt: new Date("2026-03-01T23:59:00Z"),
      },
    });
    const ver = async (crudo: Parameters<typeof leerFiltrosInspector>[0]) =>
      (await inspeccionarNotificaciones(prisma, leerFiltrosInspector(crudo).filtros)).items;

    expect(await ver({ usuario: "@lucia_insp" })).toHaveLength(2);
    expect(
      (await ver({ usuario: "lucia_insp", tipo: "SUBISTE_NIVEL" })).map((i) => i.tipo),
    ).toEqual(["SUBISTE_NIVEL"]);
    expect(await ver({ desde: "2026-03-01", hasta: "2026-03-01" })).toHaveLength(1); // el día entero
    expect(await ver({ usuario: "nadie_asi" })).toEqual([]);
  });

  it("NO expone la clave del hecho: ni refId, ni refType, ni datos (el votante no sale)", async () => {
    const [u1] = await cuentas(1);
    await emitirAviso(
      prisma,
      u1!,
      avisoVotoRecibido({
        submissionId: "s1",
        votanteId: "votante-secreto",
        reto: { titulo: "Reto", codigo: "ABC234", slug: "reto" },
      }),
    );
    const { items } = await inspeccionarNotificaciones(prisma, leerFiltrosInspector({}).filtros);

    expect(items).toHaveLength(1);
    expect(Object.keys(items[0]!).sort()).toEqual(
      ["creadaMs", "id", "leida", "texto", "tipo", "usuario"].sort(),
    );
    expect(JSON.stringify(items)).not.toContain("votante-secreto");
    expect(items[0]).toMatchObject({ tipo: "VOTO_RECIBIDO", leida: false });
  });
});
