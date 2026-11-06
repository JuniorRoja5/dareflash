/**
 * LAS CIFRAS DE UNA CAMPAÑA (Fase 9 · P10), contra la base de datos.
 *
 * DIENTES:
 *  - Una VISTA se cuenta al entregar la campaña en un hueco; un CLIC, al pasar por el redirector.
 *  - El clic cuenta con tope por IP cifrada: por encima, se redirige igual pero no suma; sin IP, no suma.
 *  - Una campaña que ya no se sirve (retirada, en revisión…) no redirige a su web ni cuenta.
 *  - La materialización escribe el recuento ABSOLUTO (reejecutar no duplica), no baja si Redis se vacía,
 *    e ignora ids que no existen.
 *  - El informe del portal va por KEYSET sobre el día, con su ámbito: la campaña de otra empresa es null.
 *
 * Para romperlo a propósito: quitar `contarMetrica` de `elegirPieza` (rojo el de la vista); contar el
 * clic sin mirar `r.allowed` (rojo el del tope); quitar el `GREATEST` (rojo el de Redis vacío); cambiar
 * el `INSERT … ON DUPLICATE` por un incremento (rojo el de reejecutar).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PUBLICIDAD_METRICAS_PAGINA, RATE_LIMITS } from "../src/config/constants";
import type { PrismaClient } from "../src/generated/prisma/client";
import { aplicarCreditos } from "../src/server/services/creditos";
import {
  type DatosCampana,
  activarPublicidad,
  apuntarImagenPublicidad,
  crearBorrador,
} from "../src/server/services/publicidad";
import {
  type Espectador,
  elegirPieza,
  olvidarCacheDeHoy,
} from "../src/server/services/publicidad-entrega";
import {
  type RedisContarMetricas,
  type RedisLeerMetricas,
  claveMetricas,
  clicEnCampana,
  informeDeMiCampana,
  materializarMetricasPublicidad,
} from "../src/server/services/publicidad-metricas";
import { retirarPublicidad } from "../src/server/services/publicidad-moderacion";

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
const DESTINO = "https://panaderia.example.com/ofertas";
const BASE: DatosCampana = {
  nombre: "Desayunos",
  alcance: "GLOBAL",
  ciudadId: undefined,
  estadoCodigo: undefined,
  paises: [],
  texto: "Ven a probar nuestro pan",
  destinoUrl: DESTINO,
  fechaInicio: "2026-12-01",
  dias: 3,
};

/** Redis en memoria: hashes y lo que pide la entrega. */
function redisFalso() {
  const hashes = new Map<string, Map<string, number>>();
  const numeros = new Map<string, number>();
  return {
    hashes,
    async hincrby(k: string, campo: string, n: number) {
      const h = hashes.get(k) ?? new Map<string, number>();
      h.set(campo, (h.get(campo) ?? 0) + n);
      hashes.set(k, h);
      return h.get(campo)!;
    },
    async hgetall(k: string) {
      return Object.fromEntries(
        [...(hashes.get(k) ?? new Map<string, number>())].map(([c, v]) => [c, String(v)]),
      );
    },
    async expire() {
      return 1;
    },
    async incr(k: string) {
      numeros.set(k, (numeros.get(k) ?? 0) + 1);
      return numeros.get(k)!;
    },
    async lrange() {
      return [];
    },
    async lpush() {
      return 1;
    },
    async ltrim() {
      return "OK";
    },
    async set() {
      return "OK";
    },
  } satisfies RedisContarMetricas & RedisLeerMetricas & Record<string, unknown>;
}

let n = 0;
async function unaEmpresa(): Promise<string> {
  n += 1;
  const owner = await crearUsuario(prisma);
  await prisma.user.update({
    where: { id: owner },
    data: { email: `metricas${n}@empresa.test`, esCuentaEmpresa: true },
  });
  const e = await prisma.empresa.create({
    data: {
      ownerUserId: owner,
      nombre: `Panadería ${n}`,
      tipoCuenta: "EMPRESA",
      tipoNegocio: "ONLINE",
      estado: "VERIFICADA",
      paisIso: "ES",
      personaContacto: "Lucía",
    },
    select: { id: true },
  });
  await aplicarCreditos(prisma, {
    empresaId: e.id,
    delta: 200,
    reason: "AJUSTE_ADMIN",
    idempotencyKey: `test:${e.id}`,
    nota: "saldo de prueba",
  });
  return e.id;
}

async function unaActiva(e: string): Promise<string> {
  const { id } = await crearBorrador(prisma, e, BASE, AHORA);
  await apuntarImagenPublicidad(prisma, e, id, `/portadas/publicidad-${id}.webp`);
  expect((await activarPublicidad(prisma, e, id, { ahora: AHORA })).ok).toBe(true);
  return id;
}

const espectador: Espectador = {
  ubicacion: { paisIso: "ES", estadoCodigo: null, ciudadId: null },
  quien: "u:ana",
  esEmpresa: false,
};
const hash = (r: ReturnType<typeof redisFalso>) =>
  Object.fromEntries(r.hashes.get(claveMetricas(new Date("2026-12-01T00:00:00.000Z"))) ?? []);

describe("se cuentan donde pasan", () => {
  it("una VISTA al entregar la campaña en un hueco", async () => {
    const id = await unaActiva(await unaEmpresa());
    const redis = redisFalso();
    const pieza = await elegirPieza(prisma, {
      espacio: "GLOBAL",
      espectador,
      superficie: "portada",
      redis,
      ahora: AHORA,
    });
    expect(pieza?.id).toBe(id);
    expect(pieza?.enlace).toBe(`/ir/${id}`);
    expect(hash(redis)).toEqual({ [`v:${id}`]: 1 });
  });

  it("un CLIC lleva a SU web y suma; con tope por IP: por encima, llega igual pero no suma", async () => {
    const id = await unaActiva(await unaEmpresa());
    const redis = redisFalso();
    const clic = () =>
      clicEnCampana(prisma, { publicidadId: id, ipKey: "ip-a", redis, ahora: AHORA });
    const tope = RATE_LIMITS.CLIC_PUBLICIDAD_PER_IP.limit;
    for (let i = 0; i < tope + 5; i += 1) expect(await clic()).toBe(DESTINO);
    expect(hash(redis)).toEqual({ [`c:${id}`]: tope });
    // Otra IP sí suma.
    await clicEnCampana(prisma, { publicidadId: id, ipKey: "ip-b", redis, ahora: AHORA });
    expect(hash(redis)[`c:${id}`]).toBe(tope + 1);
  });

  it("sin IP (no debería pasar detrás de Caddy) llega a su web, pero no suma", async () => {
    const id = await unaActiva(await unaEmpresa());
    const redis = redisFalso();
    expect(
      await clicEnCampana(prisma, { publicidadId: id, ipKey: null, redis, ahora: AHORA }),
    ).toBe(DESTINO);
    expect(hash(redis)).toEqual({});
  });

  it("una campaña retirada no lleva a su web ni cuenta (un enlace viejo no sigue funcionando)", async () => {
    const admin = await crearUsuario(prisma);
    const id = await unaActiva(await unaEmpresa());
    await retirarPublicidad(prisma, {
      publicidadId: id,
      adminId: admin,
      motivo: "DESTINO_PELIGROSO",
      appUrl: "https://dareflash.test",
      ahora: AHORA,
    });
    const redis = redisFalso();
    expect(
      await clicEnCampana(prisma, { publicidadId: id, ipKey: "ip-a", redis, ahora: AHORA }),
    ).toBe(null);
    expect(await clicEnCampana(prisma, { publicidadId: "noexiste123", ipKey: "ip-a", redis })).toBe(
      null,
    );
    expect(hash(redis)).toEqual({});
  });
});

describe("la materialización", () => {
  const fila = (id: string) =>
    prisma.publicidadMetricaDia.findUniqueOrThrow({
      where: { publicidadId_dia: { publicidadId: id, dia: new Date("2026-12-01T00:00:00.000Z") } },
      select: { vistas: true, clics: true },
    });

  it("escribe el recuento absoluto: reejecutarla no duplica", async () => {
    const id = await unaActiva(await unaEmpresa());
    const redis = redisFalso();
    await redis.hincrby(claveMetricas(AHORA), `v:${id}`, 7);
    await redis.hincrby(claveMetricas(AHORA), `c:${id}`, 2);
    await materializarMetricasPublicidad(prisma, redis, AHORA);
    await materializarMetricasPublicidad(prisma, redis, AHORA);
    expect(await fila(id)).toEqual({ vistas: 7, clics: 2 });
    await redis.hincrby(claveMetricas(AHORA), `v:${id}`, 3);
    await materializarMetricasPublicidad(prisma, redis, AHORA);
    expect(await fila(id)).toEqual({ vistas: 10, clics: 2 });
  });

  it("si Redis se vacía, lo ya contado no baja; y un id que no existe se ignora", async () => {
    const id = await unaActiva(await unaEmpresa());
    const redis = redisFalso();
    await redis.hincrby(claveMetricas(AHORA), `v:${id}`, 7);
    await materializarMetricasPublicidad(prisma, redis, AHORA);
    redis.hashes.clear(); // Redis reiniciado a media tarde
    await redis.hincrby(claveMetricas(AHORA), `v:${id}`, 1);
    await redis.hincrby(claveMetricas(AHORA), "v:noexiste123", 4);
    expect(await materializarMetricasPublicidad(prisma, redis, AHORA)).toEqual({
      filas: 1,
      sinRedis: false,
    });
    expect((await fila(id)).vistas).toBe(7);
  });

  it("sin Redis no hace nada, y lo dice", async () => {
    expect(await materializarMetricasPublicidad(prisma, null, AHORA)).toEqual({
      filas: 0,
      sinRedis: true,
    });
  });
});

describe("el informe del portal", () => {
  it("totales y días por KEYSET, del más reciente al más antiguo; de otra empresa, null", async () => {
    const e = await unaEmpresa();
    const id = await unaActiva(e);
    const total = PUBLICIDAD_METRICAS_PAGINA + 6;
    await prisma.publicidadMetricaDia.createMany({
      data: Array.from({ length: total }, (_, i) => ({
        publicidadId: id,
        dia: new Date(Date.UTC(2026, 10, 1 + i)),
        vistas: 10,
        clics: 1,
      })),
    });
    const p1 = await informeDeMiCampana(prisma, e, id);
    expect(p1?.totales).toEqual({ vistas: 10 * total, clics: total });
    expect(p1?.dias).toHaveLength(PUBLICIDAD_METRICAS_PAGINA);
    expect(p1?.dias[0]?.dia).toBe("2026-11-20");
    expect(p1?.nextCursor).toBe(p1?.dias.at(-1)?.dia);
    const p2 = await informeDeMiCampana(prisma, e, id, p1!.nextCursor);
    expect(p2?.dias.map((d) => d.dia)).toEqual([
      "2026-11-06",
      "2026-11-05",
      "2026-11-04",
      "2026-11-03",
      "2026-11-02",
      "2026-11-01",
    ]);
    expect(p2?.nextCursor).toBeNull();
    // El ámbito: otra empresa no ve nada, ni siquiera que existe.
    expect(await informeDeMiCampana(prisma, await unaEmpresa(), id)).toBeNull();
  });
});
