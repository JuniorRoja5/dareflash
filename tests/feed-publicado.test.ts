/**
 * FEED PÚBLICO — consulta real con dientes. Solo videos PUBLISHED, más nuevos primero, PAGINADO por
 * cursor. La FIRMA se inyecta: la consulta no toca `env` (el firmante real vive en el borde). El
 * voto/reto/categoría salen de la Submission SOLO si ella misma está PUBLISHED (el estado más
 * restrictivo gana). Contenido de usuarios borrados/baneados: fuera.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { ModerationStatus, PrismaClient } from "../src/generated/prisma/client";
import { generarPublicCode } from "../src/server/services/reto-codigo";
import { feedPublicado, type Firmante } from "../src/server/services/feed";

import { createTestPrisma, resetDb } from "./helpers/db";

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

/** Firmante FALSO: URLs deterministas por bunnyVideoId. Prueba que la firma se inyecta (sin `env`). */
const firmarFake: Firmante = (bunnyVideoId) => ({
  src: `https://fake/${bunnyVideoId}/playlist.m3u8`,
  poster: `https://fake/${bunnyVideoId}/thumbnail.jpg`,
});

async function crearVideo(input: {
  userId: string;
  status: ModerationStatus;
  bunny: string;
  title: string;
  createdAt: Date;
}): Promise<string> {
  const v = await prisma.video.create({
    data: {
      userId: input.userId,
      status: input.status,
      bunnyVideoId: input.bunny,
      title: input.title,
      createdAt: input.createdAt,
    },
    select: { id: true },
  });
  return v.id;
}

describe("feedPublicado", () => {
  it("lista SOLO PUBLISHED, más nuevos primero, con reproducción del firmante inyectado", async () => {
    const u = await prisma.user.create({
      data: { username: "autor", pointsBalance: 0 },
      select: { id: true },
    });
    await crearVideo({
      userId: u.id,
      status: "PUBLISHED",
      bunny: "b-viejo",
      title: "Viejo",
      createdAt: new Date("2026-01-01T00:00:00Z"),
    });
    await crearVideo({
      userId: u.id,
      status: "PENDING",
      bunny: "b-pend",
      title: "Pendiente",
      createdAt: new Date("2026-02-01T00:00:00Z"),
    });
    await crearVideo({
      userId: u.id,
      status: "PUBLISHED",
      bunny: "b-nuevo",
      title: "Nuevo",
      createdAt: new Date("2026-03-01T00:00:00Z"),
    });

    const { items, nextCursor } = await feedPublicado(prisma, { firmar: firmarFake });

    expect(items.map((i) => i.retoTitulo)).toEqual(["Nuevo", "Viejo"]); // PENDING fuera; orden desc
    expect(items[0]!.src).toBe("https://fake/b-nuevo/playlist.m3u8");
    expect(items[0]!.poster).toBe("https://fake/b-nuevo/thumbnail.jpg");
    expect(items[0]!.username).toBe("autor");
    expect(items[0]!.votos).toBe(0);
    expect(nextCursor).toBeNull();
  });

  it("paginación por cursor: limit N -> N + nextCursor; la página siguiente trae el resto sin solapar", async () => {
    const u = await prisma.user.create({ data: { username: "autor2" }, select: { id: true } });
    for (let i = 0; i < 3; i += 1) {
      await crearVideo({
        userId: u.id,
        status: "PUBLISHED",
        bunny: `b-${i}`,
        title: `V${i}`,
        createdAt: new Date(Date.UTC(2026, 0, i + 1)),
      });
    }

    const p1 = await feedPublicado(prisma, { firmar: firmarFake, limit: 2 });
    expect(p1.items).toHaveLength(2);
    expect(p1.nextCursor).not.toBeNull();

    const p2 = await feedPublicado(prisma, {
      firmar: firmarFake,
      limit: 2,
      cursor: p1.nextCursor,
    });
    expect(p2.items).toHaveLength(1);
    expect(p2.nextCursor).toBeNull();

    const ids = [...p1.items, ...p2.items].map((i) => i.id);
    expect(new Set(ids).size).toBe(3); // sin solapamiento entre páginas
  });

  it("excluye vídeos de usuarios borrados o baneados", async () => {
    const bor = await prisma.user.create({
      data: { username: "bor", deletedAt: new Date() },
      select: { id: true },
    });
    const ban = await prisma.user.create({
      data: { username: "ban", bannedAt: new Date() },
      select: { id: true },
    });
    await crearVideo({
      userId: bor.id,
      status: "PUBLISHED",
      bunny: "b-bor",
      title: "x",
      createdAt: new Date(),
    });
    await crearVideo({
      userId: ban.id,
      status: "PUBLISHED",
      bunny: "b-ban",
      title: "y",
      createdAt: new Date(),
    });

    const { items } = await feedPublicado(prisma, { firmar: firmarFake });
    expect(items).toHaveLength(0);
  });

  it("votos/reto/categoría salen de la Submission SOLO si está PUBLISHED (si no, votos 0 y caption = título del vídeo)", async () => {
    const u = await prisma.user.create({ data: { username: "part" }, select: { id: true } });
    const idPub = await crearVideo({
      userId: u.id,
      status: "PUBLISHED",
      bunny: "b-pub",
      title: "Título del vídeo pub",
      createdAt: new Date("2026-05-02T00:00:00Z"),
    });
    const idSinPub = await crearVideo({
      userId: u.id,
      status: "PUBLISHED",
      bunny: "b-sinpub",
      title: "Título del vídeo sin submission publicada",
      createdAt: new Date("2026-05-01T00:00:00Z"),
    });

    const ch = await prisma.challenge.create({
      data: {
        title: "Reto de fitness",
        slug: "reto",
        publicCode: generarPublicCode(),
        category: "fitness",
        prizeCurrency: "EUR",
        startsAt: new Date(),
        deadline: new Date(Date.now() + 1000),
        createdById: u.id,
      },
      select: { id: true },
    });
    await prisma.submission.create({
      data: {
        challengeId: ch.id,
        userId: u.id,
        videoId: idPub,
        status: "PUBLISHED",
        voteCount: 42,
      },
    });

    const chOculto = await prisma.challenge.create({
      data: {
        title: "Reto oculto",
        slug: "reto",
        publicCode: generarPublicCode(),
        category: "gaming",
        prizeCurrency: "EUR",
        startsAt: new Date(),
        deadline: new Date(Date.now() + 1000),
        createdById: u.id,
      },
      select: { id: true },
    });
    // Submission en PENDING: NO visible -> no aporta votos/reto/categoría.
    await prisma.submission.create({
      data: {
        challengeId: chOculto.id,
        userId: u.id,
        videoId: idSinPub,
        status: "PENDING",
        voteCount: 99,
      },
    });

    const { items } = await feedPublicado(prisma, { firmar: firmarFake });
    const pub = items.find((i) => i.id === idPub)!;
    expect(pub.votos).toBe(42);
    expect(pub.retoTitulo).toBe("Reto de fitness");
    expect(pub.categoria).toBe("Fitness"); // key "fitness" -> nombre "Fitness"

    const sinPub = items.find((i) => i.id === idSinPub)!;
    expect(sinPub.votos).toBe(0);
    expect(sinPub.retoTitulo).toBe("Título del vídeo sin submission publicada");
    expect(sinPub.categoria).toBeNull();
  });
});
