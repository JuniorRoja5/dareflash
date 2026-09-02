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
  category?: string | null; // un video LIBRE necesita categoria para salir en el feed (2c)
}): Promise<string> {
  const v = await prisma.video.create({
    data: {
      userId: input.userId,
      status: input.status,
      bunnyVideoId: input.bunny,
      title: input.title,
      createdAt: input.createdAt,
      category: input.category ?? null,
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
      category: "fitness", // video libre: con categoria sale en el feed
    });
    await crearVideo({
      userId: u.id,
      status: "PENDING",
      bunny: "b-pend",
      title: "Pendiente",
      createdAt: new Date("2026-02-01T00:00:00Z"),
      category: "fitness",
    });
    await crearVideo({
      userId: u.id,
      status: "PUBLISHED",
      bunny: "b-nuevo",
      title: "Nuevo",
      createdAt: new Date("2026-03-01T00:00:00Z"),
      category: "fitness",
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
        category: "fitness",
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

  it("excluye REEMPLAZOS en vuelo (Video PUBLISHED con reemplazaSubmissionId): no se cuelan en el feed", async () => {
    const u = await prisma.user.create({ data: { username: "repl" }, select: { id: true } });
    await crearVideo({
      userId: u.id,
      status: "PUBLISHED",
      bunny: "b-normal",
      title: "Normal",
      createdAt: new Date("2026-06-01T00:00:00Z"),
      category: "fitness",
    });
    // Un vídeo de reemplazo: PUBLISHED pero con el puntero seteado -> NO debe salir en el feed.
    await prisma.video.create({
      data: {
        userId: u.id,
        status: "PUBLISHED",
        bunnyVideoId: "b-reemplazo",
        title: "Reemplazo en vuelo",
        reemplazaSubmissionId: "sub-cualquiera",
        createdAt: new Date("2026-06-02T00:00:00Z"),
      },
    });

    const { items } = await feedPublicado(prisma, { firmar: firmarFake });
    expect(items.map((i) => i.retoTitulo)).toEqual(["Normal"]); // el reemplazo NO aparece
  });

  it("categoría por AMBAS vías: libre con category -> Video.category; sin submission NI category -> excluido", async () => {
    const u = await prisma.user.create({ data: { username: "cat" }, select: { id: true } });
    const idLibre = await crearVideo({
      userId: u.id,
      status: "PUBLISHED",
      bunny: "b-libre",
      title: "Vídeo libre",
      createdAt: new Date("2026-07-02T00:00:00Z"),
      category: "gaming", // libre -> su categoría sale de Video.category
    });
    // Sin submission NI category: NO debe aparecer (evita vídeos sueltos sin categoría).
    await crearVideo({
      userId: u.id,
      status: "PUBLISHED",
      bunny: "b-suelto",
      title: "Suelto sin categoría",
      createdAt: new Date("2026-07-01T00:00:00Z"),
      category: null,
    });

    const { items } = await feedPublicado(prisma, { firmar: firmarFake });
    expect(items.map((i) => i.id)).toEqual([idLibre]); // el suelto sin categoría, fuera
    expect(items[0]!.categoria).toBe("Gaming"); // key "gaming" -> "Gaming" (vía Video.category)
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
    const subPub = await prisma.submission.create({
      data: {
        challengeId: ch.id,
        userId: u.id,
        videoId: idPub,
        status: "PUBLISHED",
        voteCount: 42,
      },
      select: { id: true },
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

    // El id de la PARTICIPACION, aparte del id del VIDEO: es de lo que hablan las rutas del gate de
    // "visto" y del voto, y pasarles un id de Video daria 404.
    expect(pub.participacionId).toBe(subPub.id);
    expect(pub.participacionId).not.toBe(pub.id);

    const sinPub = items.find((i) => i.id === idSinPub)!;
    expect(sinPub.votos).toBe(0);
    // Submission NO publicada -> no se vota, asi que tampoco se ofrece para marcar como vista.
    expect(sinPub.participacionId).toBeNull();
    expect(sinPub.retoTitulo).toBe("Título del vídeo sin submission publicada");
    expect(sinPub.categoria).toBeNull();
  });
});

/**
 * ESTADO DE VOTO EN EL PAYLOAD (Pieza 3B). El botón tiene que pintar bien EN LA CARGA, y para eso el
 * feed debe traer: a qué reto pertenece, si admite votos AHORA, y dónde tiene el usuario su voto.
 * Sin esto haría falta una ida y vuelta por cada vídeo del feed.
 */
describe("estado de voto en el payload", () => {
  /** Un reto con su participación publicada. `desfase` mueve la ventana para probar abierto/cerrado. */
  async function retoConParticipacion(opts: {
    autor: string;
    bunny: string;
    startsAt?: Date;
    deadline?: Date;
    status?: string;
  }) {
    const videoId = await crearVideo({
      userId: opts.autor,
      status: "PUBLISHED",
      bunny: opts.bunny,
      title: "t",
      createdAt: new Date(),
    });
    const ch = await prisma.challenge.create({
      data: {
        title: "Reto",
        slug: "reto",
        publicCode: generarPublicCode(),
        category: "fitness",
        prizeCurrency: "EUR",
        status: opts.status ?? "PUBLISHED",
        startsAt: opts.startsAt ?? new Date(Date.now() - 3_600_000),
        deadline: opts.deadline ?? new Date(Date.now() + 3_600_000),
        createdById: opts.autor,
      },
      select: { id: true },
    });
    const sub = await prisma.submission.create({
      data: { challengeId: ch.id, userId: opts.autor, videoId, status: "PUBLISHED" },
      select: { id: true },
    });
    return { videoId, challengeId: ch.id, submissionId: sub.id };
  }

  it("trae el reto y su ventana; un reto AÚN SIN EMPEZAR no sale como abierto", async () => {
    const autor = await prisma.user.create({ data: { username: "a1" }, select: { id: true } });
    const ahora = await retoConParticipacion({ autor: autor.id, bunny: "b-1" });
    const futuro = await retoConParticipacion({
      autor: autor.id,
      bunny: "b-2",
      startsAt: new Date(Date.now() + 86_400_000),
      deadline: new Date(Date.now() + 172_800_000),
    });

    const { items } = await feedPublicado(prisma, { firmar: firmarFake });
    const abierto = items.find((i) => i.id === ahora.videoId)!;
    const sinEmpezar = items.find((i) => i.id === futuro.videoId)!;

    expect(abierto.retoId).toBe(ahora.challengeId);
    expect(abierto.retoAbierto).toBe(true);
    // Misma regla que aplica el servidor al votar: si esto dijera `true`, el botón prometería un voto
    // que la API rechazaría con RETO_CERRADO.
    expect(sinEmpezar.retoAbierto).toBe(false);
  });

  it("`miVoto` señala DÓNDE votó el usuario, y solo en el reto que le corresponde", async () => {
    const autor = await prisma.user.create({ data: { username: "a2" }, select: { id: true } });
    const votante = await prisma.user.create({ data: { username: "v2" }, select: { id: true } });
    const uno = await retoConParticipacion({ autor: autor.id, bunny: "b-3" });
    const otro = await retoConParticipacion({ autor: autor.id, bunny: "b-4" });
    await prisma.vote.create({
      data: {
        userId: votante.id,
        challengeId: uno.challengeId,
        submissionId: uno.submissionId,
      },
    });

    const { items } = await feedPublicado(prisma, { firmar: firmarFake, userId: votante.id });

    expect(items.find((i) => i.id === uno.videoId)!.miVoto).toBe(uno.submissionId);
    // El voto de OTRO reto no se contagia: la clave es el reto, no el usuario a secas.
    expect(items.find((i) => i.id === otro.videoId)!.miVoto).toBeNull();
  });

  it("un INVITADO no tiene voto, y el voto de otro usuario no se filtra", async () => {
    const autor = await prisma.user.create({ data: { username: "a3" }, select: { id: true } });
    const otro = await prisma.user.create({ data: { username: "v3" }, select: { id: true } });
    const r = await retoConParticipacion({ autor: autor.id, bunny: "b-5" });
    await prisma.vote.create({
      data: { userId: otro.id, challengeId: r.challengeId, submissionId: r.submissionId },
    });

    const sinSesion = await feedPublicado(prisma, { firmar: firmarFake });
    expect(sinSesion.items[0]!.miVoto).toBeNull();

    // Y con OTRA sesión tampoco: `miVoto` es MÍO, no "el último voto que haya".
    const tercero = await prisma.user.create({ data: { username: "v4" }, select: { id: true } });
    const conOtra = await feedPublicado(prisma, { firmar: firmarFake, userId: tercero.id });
    expect(conOtra.items[0]!.miVoto).toBeNull();
  });

  it("una subida LIBRE no tiene reto ni voto (no hay nada que votar)", async () => {
    const u = await prisma.user.create({ data: { username: "libre" }, select: { id: true } });
    const id = await crearVideo({
      userId: u.id,
      status: "PUBLISHED",
      bunny: "b-libre",
      title: "suelto",
      createdAt: new Date(),
      category: "fitness",
    });

    const { items } = await feedPublicado(prisma, { firmar: firmarFake, userId: u.id });
    const libre = items.find((i) => i.id === id)!;

    expect(libre.retoId).toBeNull();
    expect(libre.retoAbierto).toBe(false);
    expect(libre.miVoto).toBeNull();
  });
});
