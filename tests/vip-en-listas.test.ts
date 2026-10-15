/**
 * LA MARCA VIP EN LAS LISTAS — y sobre todo: SIN N+1, y con la FECHA mandando también aquí.
 *
 * ┌─ EL DIENTE CENTRAL ───────────────────────────────────────────────────────────────────────────┐
 * │ Lo natural al escribir esto es preguntar por cada fila "¿su autor es VIP?". En un feed de      │
 * │ veinte vídeos eso son veinte consultas por render, y crecen con el scroll infinito: nadie lo   │
 * │ nota en local con tres vídeos y lo nota todo el mundo en producción. Es el MISMO fallo que ya  │
 * │ se evitó con el Boost (`feed-boost-realce`), así que se mide igual: contando las consultas de  │
 * │ verdad con el log del cliente de Prisma.                                                       │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ Y EL SEGUNDO: UNA SUSCRIPCIÓN "ACTIVA" CON EL PERIODO VENCIDO NO ES VIP ────────────────────┐
 * │ El estado lo escribe un webhook, y un webhook se puede perder. Si la lista mirara el estado,  │
 * │ quien dejó de pagar hace tres meses seguiría con su sello en los comentarios hasta que         │
 * │ alguien reparase la fila a mano. Lo que manda es `periodoFin`, y eso se calcula en cada        │
 * │ consulta — así una entrega perdida se arregla sola al pasar la fecha.                          │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Para romperlo a propósito: cambiar el `vipsActivosEntre` del feed por un `esVipActivoDe` dentro
 * del `map` (rojo: el contador de consultas), o hacer que la consulta filtre por `estado` en vez de
 * pasar por `esVipActivo` (rojo: el caso de la ACTIVA vencida).
 */
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaClient } from "../src/generated/prisma/client";
import { feedPublicado } from "../src/server/services/feed";
import { rankingMensual } from "../src/server/services/ranking";
import { registrarSuscripcion } from "../src/server/services/vip";

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

async function publicar(userId: string, haceMin: number) {
  await prisma.video.create({
    data: {
      userId,
      bunnyVideoId: `bunny-${Math.random().toString(36).slice(2)}`,
      status: "PUBLISHED",
      title: "Un vídeo",
      category: "humor",
      createdAt: new Date(AHORA.getTime() - haceMin * MIN),
    },
    select: { id: true },
  });
}

/** Suscripción de `userId`: `vigente` decide si el PERIODO está por delante o ya pasó. */
const suscribir = (userId: string, { vigente }: { vigente: boolean }, estado = "ACTIVA") =>
  registrarSuscripcion(prisma, {
    userId,
    estado,
    periodoFin: new Date(AHORA.getTime() + (vigente ? 30 : -30) * MIN),
  });

/**
 * Cuenta las consultas de VERDAD con el log del cliente. Se crea un cliente propio —el de los
 * helpers no tiene el log activado— contra la MISMA base de datos de este worker. Mismo mecanismo
 * que `feed-boost-realce`: si divergieran, uno de los dos acabaría midiendo otra cosa.
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

const deSuscripcion = (consultas: string[]): string[] =>
  consultas.filter((q) => /Subscription/i.test(q));

describe("SIN N+1: una consulta de VIP por página, no una por fila", () => {
  it("CINCO autores, todos VIP: UNA consulta a Subscription", async () => {
    for (let i = 0; i < 5; i += 1) {
      const id = await crearUsuario(prisma, { username: `vipa${i}` });
      await suscribir(id, { vigente: true });
      await publicar(id, i + 1);
    }

    const consultas = await consultasDe((db) => feedPublicado(db, { firmar, ahora: AHORA }));
    const vip = deSuscripcion(consultas);
    expect(
      vip.length,
      `se consultó Subscription ${vip.length} veces: una por autor en vez de una por página`,
    ).toBe(1);
  });

  it("y con DIEZ sigue siendo una: el número NO depende de N", async () => {
    // La propiedad que importa no es "una con cinco": es que no crezca con la página.
    for (let i = 0; i < 10; i += 1) {
      const id = await crearUsuario(prisma, { username: `muchos${i}` });
      await suscribir(id, { vigente: true });
      await publicar(id, i + 1);
    }

    const consultas = await consultasDe((db) =>
      feedPublicado(db, { firmar, ahora: AHORA, limit: 10 }),
    );
    expect(deSuscripcion(consultas)).toHaveLength(1);
  });

  it("con una MEZCLA de VIP y no VIP tampoco cambia", async () => {
    for (let i = 0; i < 8; i += 1) {
      const id = await crearUsuario(prisma, { username: `mezcla${i}` });
      if (i % 2 === 0) await suscribir(id, { vigente: true });
      await publicar(id, i + 1);
    }
    const consultas = await consultasDe((db) =>
      feedPublicado(db, { firmar, ahora: AHORA, limit: 8 }),
    );
    expect(deSuscripcion(consultas)).toHaveLength(1);
  });

  it("sin NINGÚN VIP se consulta una vez como mucho", async () => {
    for (let i = 0; i < 4; i += 1) {
      const id = await crearUsuario(prisma, { username: `plana${i}` });
      await publicar(id, i + 1);
    }
    const consultas = await consultasDe((db) => feedPublicado(db, { firmar, ahora: AHORA }));
    expect(deSuscripcion(consultas).length).toBeLessThanOrEqual(1);
  });

  it("y un feed VACÍO no consulta nada: el `in ()` vacío se evita en el servicio", async () => {
    const consultas = await consultasDe((db) => feedPublicado(db, { firmar, ahora: AHORA }));
    expect(deSuscripcion(consultas)).toHaveLength(0);
  });

  it("el ranking mensual: también UNA para toda la tabla", async () => {
    for (let i = 0; i < 6; i += 1) {
      const id = await crearUsuario(prisma, { username: `rank${i}` });
      await suscribir(id, { vigente: true });
      await prisma.rankingMensual.create({
        data: { periodo: "2026-06", userId: id, victorias: 6 - i },
      });
    }
    const consultas = await consultasDe((db) =>
      rankingMensual(db, { periodo: "2026-06", now: AHORA }),
    );
    expect(deSuscripcion(consultas)).toHaveLength(1);
  });
});

describe("en una lista, la fecha manda igual que en la consulta de uno", () => {
  it("una ACTIVA con el periodo VENCIDO no lleva sello, y sus vecinos sí", async () => {
    // El caso que de verdad pasa: el webhook de la baja se pierde, la fila se queda en ACTIVA y la
    // única verdad que queda es `periodoFin`. Va EN UNA LISTA a propósito: la consulta en lote es
    // otro camino, y un filtro por estado ahí dentro no lo vería ningún test del chokepoint.
    const caducado = await crearUsuario(prisma, { username: "caducado" });
    const vigente = await crearUsuario(prisma, { username: "vigente" });
    const sinNada = await crearUsuario(prisma, { username: "sin_nada" });

    await suscribir(caducado, { vigente: false }, "ACTIVA");
    await suscribir(vigente, { vigente: true }, "ACTIVA");

    await publicar(caducado, 1);
    await publicar(vigente, 2);
    await publicar(sinNada, 3);

    const { items } = await feedPublicado(prisma, { firmar, ahora: AHORA });
    const porAutor = new Map(items.map((p) => [p.username, p.autorVip]));
    expect(porAutor.get("caducado"), "un periodo vencido sigue dando sello").toBe(false);
    expect(porAutor.get("vigente")).toBe(true);
    expect(porAutor.get("sin_nada")).toBe(false);
  });

  it("una CORTADA con el periodo por delante tampoco: el estado puede quitar, no dar", async () => {
    const cortada = await crearUsuario(prisma, { username: "cortada" });
    await suscribir(cortada, { vigente: true }, "CORTADA");
    await publicar(cortada, 1);

    const { items } = await feedPublicado(prisma, { firmar, ahora: AHORA });
    expect(items[0]!.autorVip).toBe(false);
  });

  it("una CANCELADA con el periodo por delante SÍ: pagó el mes y lo tiene", async () => {
    const cancelada = await crearUsuario(prisma, { username: "cancelada" });
    await suscribir(cancelada, { vigente: true }, "CANCELADA");
    await publicar(cancelada, 1);

    const { items } = await feedPublicado(prisma, { firmar, ahora: AHORA });
    expect(items[0]!.autorVip).toBe(true);
  });

  it("y la fecha se evalúa al consultar: el mismo dato, un mes después, ya no es VIP", async () => {
    // Sin job y sin columna: pasar de VIP a no VIP no necesita que nadie escriba nada.
    const quien = await crearUsuario(prisma, { username: "pasa_el_mes" });
    await suscribir(quien, { vigente: true });
    await publicar(quien, 1);

    const ahora = await feedPublicado(prisma, { firmar, ahora: AHORA });
    expect(ahora.items[0]!.autorVip).toBe(true);

    const despues = new Date(AHORA.getTime() + 60 * MIN);
    const luego = await feedPublicado(prisma, { firmar, ahora: despues });
    expect(luego.items[0]!.autorVip).toBe(false);
  });
});

describe("los comentarios: la lista también en lote, y el suelto de uno en uno", () => {
  /** Un vídeo con N comentarios de N autores distintos, `cuantosVip` de ellos suscritos. */
  async function hiloCon(n: number, cuantosVip: number): Promise<string> {
    const dueno = await crearUsuario(prisma, { username: "dueno_hilo" });
    const video = await prisma.video.create({
      data: {
        userId: dueno,
        bunnyVideoId: `bunny-${Math.random().toString(36).slice(2)}`,
        status: "PUBLISHED",
        title: "Con comentarios",
        category: "humor",
      },
      select: { id: true },
    });
    for (let i = 0; i < n; i += 1) {
      const quien = await crearUsuario(prisma, { username: `coment${i}` });
      // CONTRA EL RELOJ DE VERDAD, y no contra `AHORA`: `listarComentarios` no recibe un instante
      // inyectado (su lista no depende de ninguna ventana), así que resuelve el VIP con `new
      // Date()`. Una fecha del calendario de los demás casos saldría vencida aquí y el test
      // mediría lo contrario de lo que cree.
      if (i < cuantosVip) {
        await registrarSuscripcion(prisma, {
          userId: quien,
          estado: "ACTIVA",
          periodoFin: new Date(Date.now() + 30 * MIN),
        });
      }
      await prisma.comment.create({
        data: { videoId: video.id, userId: quien, texto: `Comentario ${i}` },
      });
    }
    return video.id;
  }

  it("SEIS comentaristas: UNA consulta a Subscription", async () => {
    const videoId = await hiloCon(6, 3);
    const consultas = await consultasDe(async (db) => {
      const { listarComentarios } = await import("../src/server/services/comentarios");
      return listarComentarios(db, videoId);
    });
    expect(deSuscripcion(consultas)).toHaveLength(1);
  });

  it("y cada autor sale con su marca: los suscritos sí, los demás no", async () => {
    const videoId = await hiloCon(4, 2);
    const { listarComentarios } = await import("../src/server/services/comentarios");
    const pagina = await listarComentarios(prisma, videoId);
    expect(pagina, "el vídeo del hilo no se ve: el caso no mide nada").not.toBeNull();
    const porAutor = new Map(pagina!.items.map((c) => [c.autor.username, c.autor.esVip]));
    expect(porAutor.get("coment0")).toBe(true);
    expect(porAutor.get("coment1")).toBe(true);
    expect(porAutor.get("coment2")).toBe(false);
    expect(porAutor.get("coment3")).toBe(false);
  });
});

describe("el color viaja con la fila, y es la CLAVE", () => {
  it("el feed trae la clave elegida, no un color", async () => {
    const quien = await crearUsuario(prisma, { username: "con_color" });
    await prisma.user.update({ where: { id: quien }, data: { colorNombre: "oro" } });
    await suscribir(quien, { vigente: true });
    await publicar(quien, 1);

    const { items } = await feedPublicado(prisma, { firmar, ahora: AHORA });
    expect(items[0]!.colorNombre).toBe("oro");
    expect(items[0]!.colorNombre).not.toMatch(/^#/);
  });

  it("y viaja aunque la suscripción esté vencida: lo que caduca es verla, no la elección", async () => {
    // Si el servicio borrara el color al no ser VIP, volver a suscribirse perdería la elección de
    // antes. Quien decide si se PINTA es el componente, con `esVip`.
    const quien = await crearUsuario(prisma, { username: "color_caducado" });
    await prisma.user.update({ where: { id: quien }, data: { colorNombre: "fuego" } });
    await suscribir(quien, { vigente: false });
    await publicar(quien, 1);

    const { items } = await feedPublicado(prisma, { firmar, ahora: AHORA });
    expect(items[0]!.autorVip).toBe(false);
    expect(items[0]!.colorNombre).toBe("fuego");
  });
});
