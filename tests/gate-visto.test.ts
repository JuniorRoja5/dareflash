/**
 * GATE DE "VISTO" (lado servidor). La marca que la ruta de voto exigirá antes de aceptar un voto.
 *
 * Con dientes:
 *  - marca puesta -> `haVisto` true; sin marca -> false; marca de OTRO usuario u OTRA participación
 *    no vale (la clave separa ambos).
 *  - solo se marcan participaciones PUBLICADAS: una no publicada se rechaza Y no deja marca (si no,
 *    el endpoint aceptaría ids arbitrarios y llenaría el almacén de claves inútiles).
 *  - EL ALMACÉN NO ACUMULA: se prueba con un doble que respeta el TTL de verdad — pasado el plazo la
 *    marca desaparece sola, sin barrido ni mantenimiento.
 *  - DEGRADACIÓN: sin almacén disponible el gate NO bloquea (si no, una caché opcional impediría
 *    votar a todo el mundo) y lo DICE en el log.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { VISTO_SEGUNDOS_MINIMOS, VISTO_TTL_SEC } from "../src/config/constants";
import type { ModerationStatus, PrismaClient } from "../src/generated/prisma/client";
import { generarPublicCode } from "../src/server/services/reto-codigo";
import { type AlmacenVisto, claveVisto, haVisto, marcarVisto } from "../src/server/services/visto";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

let prisma: PrismaClient;
let challengeId: string;
let contador = 0;

beforeAll(() => {
  prisma = createTestPrisma();
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
  contador = 0;
  const admin = await crearUsuario(prisma);
  const reto = await prisma.challenge.create({
    data: {
      title: "Reto",
      slug: "reto",
      publicCode: generarPublicCode(),
      category: "fitness",
      status: "PUBLISHED",
      prizeCurrency: "USD",
      startsAt: new Date(Date.now() - 3600_000),
      deadline: new Date(Date.now() + 86_400_000),
      createdById: admin,
    },
    select: { id: true },
  });
  challengeId = reto.id;
});

async function crearParticipacion(
  opts: { subStatus?: ModerationStatus; videoStatus?: ModerationStatus } = {},
): Promise<string> {
  contador += 1;
  const autor = await crearUsuario(prisma);
  const video = await prisma.video.create({
    data: {
      userId: autor,
      bunnyVideoId: `bunny-v-${contador}`,
      status: opts.videoStatus ?? "PUBLISHED",
    },
    select: { id: true },
  });
  const sub = await prisma.submission.create({
    data: {
      challengeId,
      userId: autor,
      videoId: video.id,
      status: opts.subStatus ?? "PUBLISHED",
    },
    select: { id: true },
  });
  return sub.id;
}

/**
 * Doble del almacén que RESPETA EL TTL de verdad, con un reloj inyectado. Así se puede demostrar que
 * la marca caduca sola sin esperar media hora ni depender de Redis.
 */
function almacenConTtl(reloj: { ahora: number }): AlmacenVisto & { claves: Map<string, number> } {
  const claves = new Map<string, number>(); // clave -> instante de caducidad
  return {
    claves,
    async marcar(clave, ttlSec) {
      claves.set(clave, reloj.ahora + ttlSec * 1000);
    },
    async existe(clave) {
      const caduca = claves.get(clave);
      if (caduca === undefined) return false;
      if (caduca <= reloj.ahora) {
        claves.delete(clave); // igual que hace Redis: la clave vencida deja de existir
        return false;
      }
      return true;
    },
  };
}

/** Almacén NO disponible (lo que ocurre sin `REDIS_URL` o con Redis caído). */
const almacenCaido: AlmacenVisto = {
  async marcar() {
    /* no-op */
  },
  async existe() {
    return null;
  },
};

describe("marcar y consultar", () => {
  it("con la marca puesta, haVisto es true; sin ella, false", async () => {
    const reloj = { ahora: Date.now() };
    const almacen = almacenConTtl(reloj);
    const sub = await crearParticipacion();
    const userId = await crearUsuario(prisma);

    expect(await haVisto({ userId, submissionId: sub }, almacen)).toBe(false);
    expect(await marcarVisto(prisma, { userId, submissionId: sub }, almacen)).toEqual({
      marcado: true,
    });
    expect(await haVisto({ userId, submissionId: sub }, almacen)).toBe(true);
  });

  it("la marca es de UN usuario y UNA participación: no se contagia", async () => {
    const reloj = { ahora: Date.now() };
    const almacen = almacenConTtl(reloj);
    const subA = await crearParticipacion();
    const subB = await crearParticipacion();
    const ana = await crearUsuario(prisma);
    const bea = await crearUsuario(prisma);

    await marcarVisto(prisma, { userId: ana, submissionId: subA }, almacen);

    expect(await haVisto({ userId: ana, submissionId: subA }, almacen)).toBe(true);
    expect(await haVisto({ userId: ana, submissionId: subB }, almacen)).toBe(false); // otro vídeo
    expect(await haVisto({ userId: bea, submissionId: subA }, almacen)).toBe(false); // otro usuario
  });

  it("volver a marcar es idempotente (solo renueva el plazo)", async () => {
    const reloj = { ahora: Date.now() };
    const almacen = almacenConTtl(reloj);
    const sub = await crearParticipacion();
    const userId = await crearUsuario(prisma);

    await marcarVisto(prisma, { userId, submissionId: sub }, almacen);
    await marcarVisto(prisma, { userId, submissionId: sub }, almacen);

    expect(almacen.claves.size).toBe(1); // una clave, no dos
    expect(await haVisto({ userId, submissionId: sub }, almacen)).toBe(true);
  });
});

describe("solo se marca lo que se puede ver", () => {
  it.each([
    ["la submission no está publicada", { subStatus: "PENDING" as ModerationStatus }],
    ["la submission está retirada", { subStatus: "REMOVED" as ModerationStatus }],
    ["el vídeo no está publicado", { videoStatus: "PENDING" as ModerationStatus }],
    ["el vídeo está retirado", { videoStatus: "REMOVED" as ModerationStatus }],
  ])("rechaza y NO deja marca cuando %s", async (_caso, opts) => {
    const reloj = { ahora: Date.now() };
    const almacen = almacenConTtl(reloj);
    const sub = await crearParticipacion(opts);
    const userId = await crearUsuario(prisma);

    expect(await marcarVisto(prisma, { userId, submissionId: sub }, almacen)).toEqual({
      marcado: false,
      motivo: "NO_PUBLICADA",
    });
    expect(almacen.claves.size).toBe(0); // no ensucia el almacén con claves inútiles
    expect(await haVisto({ userId, submissionId: sub }, almacen)).toBe(false);
  });

  it("una participación inexistente se rechaza sin dejar marca", async () => {
    const reloj = { ahora: Date.now() };
    const almacen = almacenConTtl(reloj);
    const userId = await crearUsuario(prisma);

    expect(await marcarVisto(prisma, { userId, submissionId: "no-existe" }, almacen)).toEqual({
      marcado: false,
      motivo: "SIN_PARTICIPACION",
    });
    expect(almacen.claves.size).toBe(0);
  });
});

describe("el almacenamiento no acumula", () => {
  it("la marca CADUCA sola pasado el TTL: no hace falta barrido ni mantenimiento", async () => {
    const reloj = { ahora: Date.now() };
    const almacen = almacenConTtl(reloj);
    const sub = await crearParticipacion();
    const userId = await crearUsuario(prisma);

    await marcarVisto(prisma, { userId, submissionId: sub }, almacen);
    expect(await haVisto({ userId, submissionId: sub }, almacen)).toBe(true);

    // Justo antes de vencer: sigue valiendo.
    reloj.ahora += VISTO_TTL_SEC * 1000 - 1000;
    expect(await haVisto({ userId, submissionId: sub }, almacen)).toBe(true);

    // Pasado el plazo: desaparece, y la clave se va del almacén.
    reloj.ahora += 2000;
    expect(await haVisto({ userId, submissionId: sub }, almacen)).toBe(false);
    expect(almacen.claves.size).toBe(0);
  });

  it("se marca CON el TTL de la constante, no con uno inventado en el sitio de la llamada", async () => {
    const almacen: AlmacenVisto = { marcar: vi.fn(), existe: async () => false };
    const sub = await crearParticipacion();
    const userId = await crearUsuario(prisma);

    await marcarVisto(prisma, { userId, submissionId: sub }, almacen);

    expect(almacen.marcar).toHaveBeenCalledWith(claveVisto(userId, sub), VISTO_TTL_SEC);
  });
});

describe("degradación sin almacén (Redis es OPCIONAL en este despliegue)", () => {
  it("el gate NO bloquea: sin almacén, todos pueden votar", async () => {
    // La alternativa —decir que nadie ha visto nada— dejaría a TODO el mundo sin poder votar por una
    // caché opcional. Lo que se pierde aquí es una fricción que ya era spoofeable, no una protección.
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const userId = await crearUsuario(prisma);
      expect(await haVisto({ userId, submissionId: "lo-que-sea" }, almacenCaido)).toBe(true);
      // Y NO en silencio: si el gate deja de gatear, se dice.
      expect(aviso).toHaveBeenCalledWith(expect.stringContaining("NO se aplica"));
    } finally {
      aviso.mockRestore();
    }
  });

  it("un almacén que LANZA se trata igual que uno ausente (no rompe la petición)", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    const almacenQueLanza: AlmacenVisto = {
      async marcar() {
        throw new Error("redis caido");
      },
      async existe() {
        throw new Error("redis caido");
      },
    };
    try {
      const sub = await crearParticipacion();
      const userId = await crearUsuario(prisma);

      // Marcar no revienta: el usuario está viendo un vídeo, no haciendo una operación con efectos.
      expect(await marcarVisto(prisma, { userId, submissionId: sub }, almacenQueLanza)).toEqual({
        marcado: true,
      });
      expect(await haVisto({ userId, submissionId: sub }, almacenQueLanza)).toBe(true);
    } finally {
      aviso.mockRestore();
    }
  });
});

describe("constantes de fuente única", () => {
  it("los segundos mínimos son pequeños (es fricción, no un peaje)", () => {
    expect(VISTO_SEGUNDOS_MINIMOS).toBeGreaterThan(0);
    expect(VISTO_SEGUNDOS_MINIMOS).toBeLessThanOrEqual(10);
  });

  it("el TTL cubre el flujo ver->votar con holgura, sin ser eterno", () => {
    expect(VISTO_TTL_SEC).toBeGreaterThanOrEqual(5 * 60);
    expect(VISTO_TTL_SEC).toBeLessThanOrEqual(24 * 60 * 60);
  });
});
