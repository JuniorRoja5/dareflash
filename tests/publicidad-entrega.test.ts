/**
 * LA ENTREGA DE LA PUBLICIDAD, contra la base de datos (Fase 9 · P7).
 *
 * DIENTES DEL PLAN:
 *  - Un espectador de ciudad NUNCA recibe una campaña global en el hueco local (con campañas reales en
 *    la base de datos, no solo con la función pura).
 *  - El DTO de entrega: IGUALDAD EXACTA de claves, en la campaña y en la casa.
 *
 * Y lo decidido para P7: el VIP no ve nada; solo salen las campañas que ocupan HOY, activas y de una
 * empresa verificada; la rotación reparte igual entre la gente de una zona; el tope de frecuencia; el
 * anuncio de la casa —siempre en la portada, una vez por sesión en el feed, «De DareFlash» y, para una
 * empresa, hacia su Publicidad—.
 *
 * Redis va con un doble en memoria con lo que se usa (INCR, LPUSH/LTRIM/LRANGE, SET NX).
 *
 * Para romperlo a propósito: dejar que la cascada local siga hasta lo global (rojo el de la ciudad);
 * añadir un campo al DTO (rojo el de las claves); quitar el filtro de empresa verificada en
 * `campanasDeHoy` (rojo el de la suspendida); que el feed enseñe la casa sin el SET NX (rojo el de una
 * vez por sesión).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";
import { aplicarCreditos } from "../src/server/services/creditos";
import {
  type DatosCampana,
  activarPublicidad,
  apuntarImagenPublicidad,
  crearBorrador,
  pausarPublicidad,
} from "../src/server/services/publicidad";
import {
  type Espectador,
  type RedisReparto,
  elegirPieza,
  olvidarCacheDeHoy,
  piezasDeUnaPagina,
  piezasDelFeed,
  piezaDePortada,
} from "../src/server/services/publicidad-entrega";

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
  olvidarCacheDeHoy();
});

const AHORA = new Date("2026-12-01T10:00:00.000Z");
const HOY = "2026-12-01";
const VALENCIA = 2509954;
const CASTELLON = 2519752;
const MADRID = 3117735;

const enValencia: Espectador = {
  ubicacion: { paisIso: "ES", estadoCodigo: "ES.60", ciudadId: VALENCIA },
  quien: "u:ana",
  esEmpresa: false,
};

/** Redis en memoria: lo justo de lo que usa la entrega. */
function redisFalso(): RedisReparto {
  const numeros = new Map<string, number>();
  const listas = new Map<string, string[]>();
  const claves = new Set<string>();
  return {
    async incr(k) {
      const n = (numeros.get(k) ?? 0) + 1;
      numeros.set(k, n);
      return n;
    },
    async expire() {
      return 1;
    },
    async lrange(k, desde, hasta) {
      return (listas.get(k) ?? []).slice(desde, hasta + 1);
    },
    async lpush(k, ...vs) {
      listas.set(k, [...vs.reverse(), ...(listas.get(k) ?? [])]);
      return 1;
    },
    async ltrim(k, desde, hasta) {
      listas.set(k, (listas.get(k) ?? []).slice(desde, hasta + 1));
      return "OK";
    },
    async set(k, _v, ...args) {
      if (args.includes("NX") && claves.has(k)) return null;
      claves.add(k);
      return "OK";
    },
  };
}

let n = 0;
async function unaEmpresa(tipoNegocio = "FISICO"): Promise<string> {
  n += 1;
  const userId = await crearUsuario(prisma);
  const e = await prisma.empresa.create({
    data: {
      ownerUserId: userId,
      nombre: `Empresa ${n}`,
      tipoCuenta: "EMPRESA",
      tipoNegocio,
      estado: "VERIFICADA",
      paisIso: "ES",
      personaContacto: "Lucía",
    },
    select: { id: true },
  });
  await aplicarCreditos(prisma, {
    empresaId: e.id,
    delta: 900,
    reason: "AJUSTE_ADMIN",
    idempotencyKey: `test:${e.id}`,
    nota: "saldo de prueba",
  });
  return e.id;
}

const BASE: DatosCampana = {
  nombre: "Campaña",
  alcance: "CIUDAD",
  ciudadId: VALENCIA,
  estadoCodigo: undefined,
  paises: [],
  texto: "Ven a probar nuestro pan",
  destinoUrl: "https://panaderia.example.com",
  fechaInicio: HOY,
  dias: 5,
};

/** Una campaña ACTIVA (con imagen) de una empresa nueva. Devuelve su id. */
async function unaActiva(
  datos: Partial<DatosCampana> = {},
  tipoNegocio = "FISICO",
): Promise<string> {
  const e = await unaEmpresa(tipoNegocio);
  const { id } = await crearBorrador(prisma, e, { ...BASE, ...datos }, AHORA);
  await apuntarImagenPublicidad(prisma, e, id, `/portadas/publicidad-${id}.webp`);
  const r = await activarPublicidad(prisma, e, id, { ahora: AHORA });
  expect(r.ok).toBe(true);
  return id;
}

const elegir = (
  espacio: "LOCAL" | "GLOBAL",
  espectador: Espectador,
  superficie: "feed" | "portada",
  redis: RedisReparto | null = redisFalso(),
) => elegirPieza(prisma, { espacio, espectador, superficie, redis, ahora: AHORA });

describe("la cascada, con campañas de verdad", () => {
  it("un espectador de ciudad NUNCA recibe una campaña global en el hueco local", async () => {
    const global = await unaActiva({ alcance: "GLOBAL", ciudadId: undefined }, "ONLINE");
    // En el hueco GLOBAL, sí; en el LOCAL, nunca: sin nada local, la casa (portada) o nada (feed).
    expect((await elegir("GLOBAL", enValencia, "portada"))?.id).toBe(global);
    const local = await elegir("LOCAL", enValencia, "portada");
    expect(local?.tipo).toBe("casa");
    expect(await elegir("LOCAL", { ...enValencia, quien: null }, "feed")).toBeNull();
  });

  it("y lo local nunca sale en el hueco global", async () => {
    await unaActiva(); // de ciudad, Valencia
    expect((await elegir("GLOBAL", enValencia, "portada"))?.tipo).toBe("casa");
    expect((await elegir("LOCAL", enValencia, "portada"))?.tipo).toBe("campana");
  });

  it("la campaña de Castellón se ve en Valencia (radio de 100 km); la de Madrid, no", async () => {
    const castellon = await unaActiva({ ciudadId: CASTELLON });
    await unaActiva({ ciudadId: MADRID });
    expect((await elegir("LOCAL", enValencia, "portada"))?.id).toBe(castellon);
  });
});

describe("qué campañas salen hoy", () => {
  it("solo las que ocupan HOY: una programada para dentro de 3 días todavía no", async () => {
    await unaActiva({ fechaInicio: "2026-12-04" });
    expect((await elegir("LOCAL", enValencia, "portada"))?.tipo).toBe("casa");
  });

  it("una pausada deja de salir (su día de hoy se queda, pero ya no tiene intención de salir)", async () => {
    const id = await unaActiva();
    const empresaId = (await prisma.publicidad.findUniqueOrThrow({ where: { id } })).empresaId;
    await pausarPublicidad(prisma, empresaId, id, AHORA);
    expect((await elegir("LOCAL", enValencia, "portada"))?.tipo).toBe("casa");
  });

  it("suspender la empresa para sus campañas, sin esperar a ningún job", async () => {
    const id = await unaActiva();
    const empresaId = (await prisma.publicidad.findUniqueOrThrow({ where: { id } })).empresaId;
    await prisma.empresa.update({ where: { id: empresaId }, data: { estado: "SUSPENDIDA" } });
    olvidarCacheDeHoy(); // en producción, como mucho PUBLICIDAD_CACHE_HOY_MS
    expect((await elegir("LOCAL", enValencia, "portada"))?.tipo).toBe("casa");
  });
});

describe("la rotación y el tope de frecuencia", () => {
  it("tres campañas en una ciudad: 30 personas distintas, 10 cada una", async () => {
    const ids = [await unaActiva(), await unaActiva(), await unaActiva()];
    const redis = redisFalso();
    const cuenta = new Map<string, number>();
    for (let i = 0; i < 30; i += 1) {
      const p = await elegir("LOCAL", { ...enValencia, quien: `u:${i}` }, "feed", redis);
      cuenta.set(p!.id, (cuenta.get(p!.id) ?? 0) + 1);
    }
    expect([...cuenta.keys()].sort()).toEqual([...ids].sort());
    expect([...cuenta.values()]).toEqual([10, 10, 10]);
  });

  it("con una sola campaña, la misma persona no la ve dos veces seguidas en el feed", async () => {
    const id = await unaActiva();
    const redis = redisFalso();
    expect((await elegir("LOCAL", enValencia, "feed", redis))?.id).toBe(id);
    // El siguiente hueco local: la campaña está en sus recientes, y la casa del feed sale una vez.
    const segundo = await elegir("LOCAL", enValencia, "feed", redis);
    expect(segundo?.tipo).toBe("casa");
    expect(await elegir("LOCAL", enValencia, "feed", redis)).toBeNull();
  });

  it("sin Redis, sigue sirviendo (al azar entre las elegibles), sin tope y sin casa en el feed", async () => {
    const id = await unaActiva();
    expect((await elegir("LOCAL", enValencia, "feed", null))?.id).toBe(id);
    expect(await elegir("GLOBAL", enValencia, "feed", null)).toBeNull();
  });
});

describe("el anuncio de la casa", () => {
  it("en la portada, siempre; en el feed, una vez por sesión", async () => {
    const redis = redisFalso();
    for (let i = 0; i < 3; i += 1) {
      expect((await elegir("GLOBAL", enValencia, "portada", redis))?.tipo).toBe("casa");
    }
    expect((await elegir("GLOBAL", enValencia, "feed", redis))?.tipo).toBe("casa");
    expect(await elegir("GLOBAL", enValencia, "feed", redis)).toBeNull();
    expect(await elegir("LOCAL", enValencia, "feed", redis)).toBeNull();
  });

  it("dice «De DareFlash», no «Publicidad»; a una empresa la lleva a su Publicidad", async () => {
    const casa = await elegir("LOCAL", enValencia, "portada");
    expect(casa).toMatchObject({
      tipo: "casa",
      etiqueta: "De DareFlash",
      enlace: "/empezar/empresa",
    });
    const deEmpresa = await elegir("LOCAL", { ...enValencia, esEmpresa: true }, "portada");
    expect(deEmpresa?.enlace).toBe("/empresa/publicidad");
  });
});

describe("el DTO de entrega", () => {
  const CLAVES = [
    "cta",
    "enlace",
    "etiqueta",
    "externo",
    "id",
    "imagen",
    "texto",
    "tipo",
    "titulo",
  ];

  it("igualdad EXACTA de claves, en una campaña y en la casa; nada de la empresa ni del calendario", async () => {
    const id = await unaActiva();
    const campana = await elegir("LOCAL", enValencia, "portada");
    expect(Object.keys(campana!).sort()).toEqual(CLAVES);
    expect(campana).toMatchObject({
      tipo: "campana",
      id,
      etiqueta: "Publicidad",
      enlace: "https://panaderia.example.com",
      externo: true,
    });
    const casa = await elegir("GLOBAL", enValencia, "portada");
    expect(Object.keys(casa!).sort()).toEqual(CLAVES);
    const crudo = JSON.stringify(campana);
    for (const prohibido of ["empresa", "creditos", "diasContratados", "fechaInicio", "nombre"]) {
      expect(crudo).not.toContain(prohibido);
    }
  });
});

describe("las puertas: feed y portada", () => {
  it("una página del feed: el hueco cae tras el 8.º vídeo y es GLOBAL", async () => {
    const global = await unaActiva({ alcance: "GLOBAL", ciudadId: undefined }, "ONLINE");
    const videos = Array.from({ length: 10 }, (_, i) => `v${i}`);
    const piezas = await piezasDeUnaPagina(prisma, {
      desde: 0,
      videoIds: videos,
      espectador: enValencia,
      redis: redisFalso(),
      ahora: AHORA,
    });
    expect(piezas).toEqual([{ despuesDe: "v7", pieza: expect.objectContaining({ id: global }) }]);
  });

  it("el VIP no ve publicidad: ni en el feed ni en la portada", async () => {
    await unaActiva({ alcance: "GLOBAL", ciudadId: undefined }, "ONLINE");
    const userId = await crearUsuario(prisma);
    await prisma.subscription.create({
      data: {
        userId,
        plan: "VIP_MYTHIC",
        estado: "ACTIVA",
        periodoFin: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      },
    });
    const sesion = { userId, esCuentaEmpresa: false };
    const videos = Array.from({ length: 16 }, (_, i) => `v${i}`);
    const redis = redisFalso();
    expect(
      await piezasDelFeed(prisma, { sesion, ip: null, desde: 0, videoIds: videos, redis }),
    ).toEqual([]);
    expect(await piezaDePortada(prisma, { sesion, ip: null, espacio: "GLOBAL", redis })).toBeNull();
    // Control: quien no es VIP sí recibe, con el mismo inventario y por las mismas puertas.
    const otro = { userId: await crearUsuario(prisma), esCuentaEmpresa: false };
    expect(
      await piezaDePortada(prisma, { sesion: otro, ip: null, espacio: "GLOBAL", redis }),
    ).not.toBeNull();
    // Las puertas usan el reloj real y la campaña es del 1 de diciembre: hoy, en el feed, solo la casa,
    // y una sola vez por sesión (el segundo hueco se queda sin rellenar).
    const feed = await piezasDelFeed(prisma, {
      sesion: otro,
      ip: null,
      desde: 0,
      videoIds: videos,
      redis,
    });
    expect(feed.map((p) => p.pieza.tipo)).toEqual(["casa"]);
  });
});
