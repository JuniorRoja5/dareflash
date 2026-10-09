/**
 * EL REALCE DE BOOST EN EL FEED — y sobre todo: SIN N+1.
 *
 * ┌─ EL DIENTE CENTRAL ───────────────────────────────────────────────────────────────────────────┐
 * │ Lo natural al escribir esto es preguntar por cada post "¿su autor está destacado?". En el      │
 * │ componente más caro de la app eso son N consultas, y N crece con el scroll infinito: nadie lo  │
 * │ nota en local con tres vídeos y lo nota todo el mundo en producción.                           │
 * │                                                                                               │
 * │ Aquí se cuentan las consultas de verdad, con el log del cliente de Prisma: una página de N     │
 * │ posts con N autores distintos tiene que resolver el Boost con UNA consulta, no con N.          │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Y lo demás:
 *  - "VIGENTE" ES `expiresAt > ahora`: una aparición expirada no marca a nadie.
 *  - UNA SOLA VERDAD: el feed global y el feed de un reto usan el MISMO `autoresDestacados`, así que
 *    el mismo autor no puede salir destacado en una pantalla y plano en la otra.
 *  - NO REORDENA: el Boost resalta, no adelanta. El feed sigue su orden.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaMariaDb } from "@prisma/adapter-mariadb";

import { PrismaClient } from "../src/generated/prisma/client";
import { autoresDestacados } from "../src/server/services/boost-destacados";
import { feedPublicado, videoParaFeed } from "../src/server/services/feed";

import { crearUsuario, createTestPrisma, nombreBdWorker, resetDb, urlBdTest } from "./helpers/db";

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

const AHORA = new Date("2026-06-15T12:00:00.000Z");
const MIN = 60_000;
const firmar = () => ({ src: "s", poster: "p" });

/** Un vídeo publicado de `userId`, con su `createdAt` para poder fijar el orden. */
async function publicar(userId: string, haceMin: number, titulo = "Un vídeo") {
  return prisma.video.create({
    data: {
      userId,
      bunnyVideoId: `bunny-${Math.random().toString(36).slice(2)}`,
      status: "PUBLISHED",
      title: titulo,
      category: "humor",
      createdAt: new Date(AHORA.getTime() - haceMin * MIN),
    },
    select: { id: true },
  });
}

/** Una aparición destacada de `userId`, vigente o ya terminada. */
async function destacar(userId: string, { vigente }: { vigente: boolean }) {
  const startsAt = new Date(AHORA.getTime() - 30 * MIN);
  await prisma.boostActivation.create({
    data: {
      userId,
      startsAt,
      expiresAt: vigente ? new Date(AHORA.getTime() + 30 * MIN) : new Date(AHORA.getTime() - MIN),
    },
  });
}

describe("quién sale marcado", () => {
  it("el autor con una aparición VIGENTE", async () => {
    const id = await crearUsuario(prisma, { username: "la_destacada" });
    await publicar(id, 5);
    await destacar(id, { vigente: true });

    const { items } = await feedPublicado(prisma, { firmar, ahora: AHORA });
    expect(items).toHaveLength(1);
    expect(items[0]!.autorDestacado).toBe(true);
  });

  it("y NO el que no tiene ninguna", async () => {
    const id = await crearUsuario(prisma, { username: "la_normal" });
    await publicar(id, 5);

    const { items } = await feedPublicado(prisma, { firmar, ahora: AHORA });
    expect(items[0]!.autorDestacado).toBe(false);
  });

  it("ni el que la tiene EXPIRADA: vigente es `expiresAt > ahora`", async () => {
    const id = await crearUsuario(prisma, { username: "la_expirada" });
    await publicar(id, 5);
    await destacar(id, { vigente: false });

    const { items } = await feedPublicado(prisma, { firmar, ahora: AHORA });
    expect(items[0]!.autorDestacado, "una aparición terminada sigue marcando").toBe(false);
  });

  it("marca a UNOS y no a otros en la misma página", async () => {
    const con = await crearUsuario(prisma, { username: "la_con" });
    const sin = await crearUsuario(prisma, { username: "la_sin" });
    await destacar(con, { vigente: true });
    await publicar(con, 5);
    await publicar(sin, 10);

    const { items } = await feedPublicado(prisma, { firmar, ahora: AHORA });
    const porAutor = new Map(items.map((i) => [i.username, i.autorDestacado]));
    expect(porAutor.get("la_con")).toBe(true);
    expect(porAutor.get("la_sin")).toBe(false);
  });

  it("y marca TODOS los vídeos de quien está destacado, no solo uno", async () => {
    const id = await crearUsuario(prisma, { username: "la_prolifica" });
    await destacar(id, { vigente: true });
    await publicar(id, 5);
    await publicar(id, 10);

    const { items } = await feedPublicado(prisma, { firmar, ahora: AHORA });
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.autorDestacado)).toBe(true);
  });

  it("el vídeo SUELTO del deep-link se marca igual que en la lista", async () => {
    // Las dos formas de entrar al feed no pueden pintar distinto a la misma persona.
    const id = await crearUsuario(prisma, { username: "la_del_enlace" });
    await destacar(id, { vigente: true });
    const v = await publicar(id, 5);

    const post = await videoParaFeed(prisma, v.id, { firmar, ahora: AHORA });
    expect(post?.autorDestacado).toBe(true);
  });
});

describe("SIN N+1: una consulta por página, no una por post", () => {
  /**
   * Cuenta las consultas de VERDAD con el log del cliente. Se crea un cliente propio —el de los
   * helpers no tiene el log activado— contra la MISMA base de datos de este worker.
   */
  async function consultasDe(fn: (db: PrismaClient) => Promise<unknown>): Promise<string[]> {
    const url = new URL(urlBdTest(nombreBdWorker()));
    const adapter = new PrismaMariaDb({
      host: url.hostname,
      port: Number(url.port || 3306),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.replace(/^\//, ""),
    });
    const espia = new PrismaClient({ adapter, log: [{ emit: "event", level: "query" }] });
    const consultas: string[] = [];
    espia.$on("query", (e) => consultas.push(e.query));
    try {
      await fn(espia);
    } finally {
      await espia.$disconnect();
    }
    return consultas;
  }

  it("CINCO autores distintos, todos destacados: UNA consulta a BoostActivation", async () => {
    for (let i = 0; i < 5; i += 1) {
      const id = await crearUsuario(prisma, { username: `autora${i}` });
      await destacar(id, { vigente: true });
      await publicar(id, i + 1);
    }

    const consultas = await consultasDe((db) => feedPublicado(db, { firmar, ahora: AHORA }));
    const deBoost = consultas.filter((q) => /BoostActivation/i.test(q));

    expect(
      deBoost.length,
      `se consultó BoostActivation ${deBoost.length} veces: una por autor en vez de una por página`,
    ).toBe(1);
  });

  it("y con DIEZ autores sigue siendo una: no crece con la página", async () => {
    // La propiedad que importa no es "una con cinco": es que el número NO dependa de N.
    for (let i = 0; i < 10; i += 1) {
      const id = await crearUsuario(prisma, { username: `muchos${i}` });
      await destacar(id, { vigente: true });
      await publicar(id, i + 1);
    }

    const consultas = await consultasDe((db) =>
      feedPublicado(db, { firmar, ahora: AHORA, limit: 10 }),
    );
    expect(consultas.filter((q) => /BoostActivation/i.test(q))).toHaveLength(1);
  });

  it("sin autores destacados tampoco se consulta más de una vez", async () => {
    for (let i = 0; i < 4; i += 1) {
      const id = await crearUsuario(prisma, { username: `plana${i}` });
      await publicar(id, i + 1);
    }
    const consultas = await consultasDe((db) => feedPublicado(db, { firmar, ahora: AHORA }));
    expect(consultas.filter((q) => /BoostActivation/i.test(q)).length).toBeLessThanOrEqual(1);
  });

  it("y un feed VACÍO no consulta nada de Boost", async () => {
    // Sin autores no hay nada que preguntar: el `in ()` vacío se evita en el servicio.
    const consultas = await consultasDe((db) => feedPublicado(db, { firmar, ahora: AHORA }));
    expect(consultas.filter((q) => /BoostActivation/i.test(q))).toHaveLength(0);
  });
});

describe("el conjunto compartido", () => {
  it("devuelve solo a los vigentes del lote que se le pasa", async () => {
    const a = await crearUsuario(prisma, { username: "vigente_a" });
    const b = await crearUsuario(prisma, { username: "expirada_b" });
    const c = await crearUsuario(prisma, { username: "sin_nada_c" });
    const fuera = await crearUsuario(prisma, { username: "fuera_del_lote" });
    await destacar(a, { vigente: true });
    await destacar(b, { vigente: false });
    await destacar(fuera, { vigente: true });

    const set = await autoresDestacados(prisma, [a, b, c], AHORA);
    expect([...set]).toEqual([a]);
    expect(set.has(fuera), "devuelve a alguien que no estaba en el lote").toBe(false);
  });

  it("con el lote vacío devuelve un conjunto vacío sin consultar", async () => {
    expect([...(await autoresDestacados(prisma, [], AHORA))]).toEqual([]);
  });

  it("y quien tiene DOS vigentes sale UNA vez: es pertenencia, no recuento", async () => {
    const id = await crearUsuario(prisma, { username: "la_doble" });
    await destacar(id, { vigente: true });
    await destacar(id, { vigente: true });

    const set = await autoresDestacados(prisma, [id], AHORA);
    expect(set.size).toBe(1);
  });
});

/**
 * LA MISMA VERDAD EN LAS DOS PANTALLAS.
 *
 * ┌─ ESTE BLOQUE NACIÓ DE UN VERDE FALSO ─────────────────────────────────────────────────────────┐
 * │ Al meter dientes, dejar el feed DE UN RETO devolviendo un conjunto vacío —o sea, sin marcar a │
 * │ nadie— pasaba en verde: solo había tests del feed global. El autor habría salido destacado en │
 * │ /feed y plano en /retos/[codigo], que es justo el fallo que compartir `autoresDestacados`      │
 * │ pretendía evitar. El diente no valía nada sin este caso.                                      │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
describe("el feed de un RETO marca igual que el global", () => {
  /** Un reto publicado con una participación visible de `userId`. */
  async function participar(userId: string) {
    const admin = await crearUsuario(prisma, { username: `admin_${userId.slice(-5)}` });
    const reto = await prisma.challenge.create({
      data: {
        title: "Reto",
        slug: `reto-${userId.slice(-6)}`,
        publicCode: `rt${userId.slice(-6)}`,
        category: "fitness",
        status: "PUBLISHED",
        prizeCurrency: "USD",
        startsAt: new Date(AHORA.getTime() - 10 * MIN),
        deadline: new Date(AHORA.getTime() + 10 * MIN),
        createdById: admin,
      },
      select: { id: true },
    });
    const v = await publicar(userId, 5);
    await prisma.submission.create({
      data: { challengeId: reto.id, userId, videoId: v.id, status: "PUBLISHED" },
    });
    return reto.id;
  }

  it("un autor con Boost vigente sale marcado en la lista del reto", async () => {
    const { listarParticipacionesVisibles } =
      await import("../src/server/services/participaciones-lista");
    const id = await crearUsuario(prisma, { username: "la_del_reto" });
    await destacar(id, { vigente: true });
    const retoId = await participar(id);

    const { items } = await listarParticipacionesVisibles(prisma, retoId, { ahora: AHORA });
    expect(items).toHaveLength(1);
    expect(items[0]!.autorDestacado, "el feed del reto no marca a quien pagó").toBe(true);
  });

  it("y uno sin Boost, no", async () => {
    const { listarParticipacionesVisibles } =
      await import("../src/server/services/participaciones-lista");
    const id = await crearUsuario(prisma, { username: "la_normal_reto" });
    const retoId = await participar(id);

    const { items } = await listarParticipacionesVisibles(prisma, retoId, { ahora: AHORA });
    expect(items[0]!.autorDestacado).toBe(false);
  });

  it("ni uno con la aparición EXPIRADA", async () => {
    const { listarParticipacionesVisibles } =
      await import("../src/server/services/participaciones-lista");
    const id = await crearUsuario(prisma, { username: "la_expirada_reto" });
    await destacar(id, { vigente: false });
    const retoId = await participar(id);

    const { items } = await listarParticipacionesVisibles(prisma, retoId, { ahora: AHORA });
    expect(items[0]!.autorDestacado).toBe(false);
  });
});

describe("el Boost NO reordena el feed", () => {
  it("el orden sigue siendo el del feed: más nuevo primero, destacado o no", async () => {
    // Pagar por aparecer en el espacio destacado no compra sitio en el feed.
    const vieja = await crearUsuario(prisma, { username: "vieja_destacada" });
    const nueva = await crearUsuario(prisma, { username: "nueva_normal" });
    await destacar(vieja, { vigente: true });
    await publicar(vieja, 60); // hace una hora
    await publicar(nueva, 1); // hace un minuto

    const { items } = await feedPublicado(prisma, { firmar, ahora: AHORA });
    expect(items.map((i) => i.username)).toEqual(["nueva_normal", "vieja_destacada"]);
  });
});
