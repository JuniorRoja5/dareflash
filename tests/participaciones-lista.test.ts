/**
 * Participaciones del detalle (2d). Con dientes:
 *  - REGLA DEL MÁS RESTRICTIVO: solo se ven las Submission PUBLISHED con Video PUBLISHED. Una Submission
 *    PUBLISHED con Video PENDING (o al revés) NO asoma.
 *  - orden por voteCount desc (a igualdad, más nuevas primero).
 *  - miParticipacion refleja el estado del vídeo del usuario (publicada/procesando/fallida).
 *  - PAGINACIÓN KEYSET: recorrido completo sin duplicados ni saltos (incluso con votos EMPATADOS),
 *    estable ante una retirada entre páginas, tope de página respetado, y NADA de OFFSET.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { ModerationStatus, PrismaClient } from "../src/generated/prisma/client";
import {
  listarParticipacionesVisibles,
  PARTICIPACIONES_LIMITE_MAX,
  miParticipacion,
} from "../src/server/services/participaciones-lista";

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
  const admin = await crearUsuario(prisma, { username: "adminp" });
  const reto = await prisma.challenge.create({
    data: {
      title: "Reto",
      slug: "reto",
      publicCode: "retop001",
      category: "fitness",
      status: "PUBLISHED",
      prizeCurrency: "USD",
      startsAt: new Date("2026-01-01T00:00:00Z"),
      deadline: new Date("2999-01-01T00:00:00Z"),
      createdById: admin,
    },
    select: { id: true },
  });
  challengeId = reto.id;
});

/** Crea usuario + su participación (Video con `videoStatus`, Submission con `subStatus`, votos). */
async function participar(opts: {
  videoStatus: ModerationStatus;
  subStatus: ModerationStatus;
  votos?: number;
  username?: string;
}): Promise<{ userId: string; submissionId: string }> {
  contador += 1;
  const userId = await crearUsuario(prisma, { username: opts.username ?? `u${contador}` });
  const video = await prisma.video.create({
    data: {
      userId,
      bunnyVideoId: `bunny-${contador}`,
      status: opts.videoStatus,
      title: `V${contador}`,
    },
    select: { id: true },
  });
  const sub = await prisma.submission.create({
    data: {
      challengeId,
      userId,
      videoId: video.id,
      status: opts.subStatus,
      voteCount: opts.votos ?? 0,
    },
    select: { id: true },
  });
  return { userId, submissionId: sub.id };
}

describe("listarParticipacionesVisibles", () => {
  it("solo Submission PUBLISHED + Video PUBLISHED; el resto NO asoma", async () => {
    const visible = await participar({
      videoStatus: "PUBLISHED",
      subStatus: "PUBLISHED",
      votos: 5,
    });
    await participar({ videoStatus: "PENDING", subStatus: "PUBLISHED" }); // vídeo no listo -> fuera
    await participar({ videoStatus: "PUBLISHED", subStatus: "PENDING" }); // submission no publicada -> fuera
    await participar({ videoStatus: "PUBLISHED", subStatus: "REMOVED" }); // retirada -> fuera

    const { items: lista } = await listarParticipacionesVisibles(prisma, challengeId);
    expect(lista.map((p) => p.submissionId)).toEqual([visible.submissionId]);
  });

  it("ordena por voteCount desc (a igualdad, más nuevas primero)", async () => {
    const a = await participar({ videoStatus: "PUBLISHED", subStatus: "PUBLISHED", votos: 3 });
    const b = await participar({ videoStatus: "PUBLISHED", subStatus: "PUBLISHED", votos: 10 });
    const c = await participar({ videoStatus: "PUBLISHED", subStatus: "PUBLISHED", votos: 7 });

    const { items: lista } = await listarParticipacionesVisibles(prisma, challengeId);
    expect(lista.map((p) => p.submissionId)).toEqual([
      b.submissionId,
      c.submissionId,
      a.submissionId,
    ]);
    expect(lista.map((p) => p.votos)).toEqual([10, 7, 3]);
  });
});

describe("miParticipacion", () => {
  it("refleja el estado del vídeo (publicada / procesando / fallida) o null si no participa", async () => {
    const pub = await participar({ videoStatus: "PUBLISHED", subStatus: "PUBLISHED" });
    expect((await miParticipacion(prisma, challengeId, pub.userId))?.estado).toBe("publicada");

    const pend = await participar({ videoStatus: "PENDING", subStatus: "PENDING" });
    expect((await miParticipacion(prisma, challengeId, pend.userId))?.estado).toBe("procesando");

    const fail = await participar({ videoStatus: "FAILED", subStatus: "PENDING" });
    expect((await miParticipacion(prisma, challengeId, fail.userId))?.estado).toBe("fallida");

    const sinParticipar = await crearUsuario(prisma, { username: "nadie" });
    expect(await miParticipacion(prisma, challengeId, sinParticipar)).toBeNull();
  });
});

/**
 * PAGINACIÓN KEYSET. Con dientes de verdad: no comprueba "que devuelva algo", comprueba las dos
 * propiedades que un OFFSET rompe y un keyset no.
 */
describe("paginación por cursor (keyset)", () => {
  /** Crea `n` participaciones visibles, TODAS con los mismos votos: el peor caso para el orden. */
  async function participacionesEmpatadas(n: number): Promise<Set<string>> {
    const ids = new Set<string>();
    for (let i = 0; i < n; i += 1) {
      const p = await participar({ videoStatus: "PUBLISHED", subStatus: "PUBLISHED", votos: 7 });
      ids.add(p.submissionId);
    }
    return ids;
  }

  /** Recorre TODAS las páginas siguiendo el cursor y devuelve los ids en el orden en que salieron. */
  async function recorrerTodo(limit: number): Promise<string[]> {
    const vistos: string[] = [];
    let cursor: string | null = null;
    // Tope de vueltas: si el cursor no avanzara, esto corta en vez de colgar el test para siempre.
    for (let vuelta = 0; vuelta < 50; vuelta += 1) {
      const pagina = await listarParticipacionesVisibles(prisma, challengeId, { cursor, limit });
      vistos.push(...pagina.items.map((p) => p.submissionId));
      if (pagina.nextCursor === null) return vistos;
      cursor = pagina.nextCursor;
    }
    throw new Error("la paginación no terminó: el cursor no avanza");
  }

  it("recorre TODAS las participaciones exactamente una vez, sin duplicar ni saltarse ninguna", async () => {
    // 7 filas EMPATADAS a votos y creadas de golpe: sin el desempate por id el orden no sería total
    // y la ventana se solaparía. Es justo el caso que un `[voteCount, createdAt]` a secas no cubre.
    const esperados = await participacionesEmpatadas(7);

    const vistos = await recorrerTodo(3); // 3 páginas + resto

    expect(vistos.length).toBe(7); // ni una repetida (si se repitiera, sobrarían)
    expect(new Set(vistos)).toEqual(esperados); // ni una saltada
  });

  it("la última página cierra con nextCursor null (y no hay una página vacía de más)", async () => {
    await participacionesEmpatadas(4);

    const p1 = await listarParticipacionesVisibles(prisma, challengeId, { limit: 2 });
    expect(p1.items.length).toBe(2);
    expect(p1.nextCursor).not.toBeNull();

    const p2 = await listarParticipacionesVisibles(prisma, challengeId, {
      cursor: p1.nextCursor,
      limit: 2,
    });
    expect(p2.items.length).toBe(2);
    // Justo 4 filas y páginas de 2: la 2ª ya es la última. `hayMas` mira la fila EXTRA, así que
    // aquí debe cerrar; si devolviera cursor, la UI ofrecería un "ver más" que no trae nada.
    expect(p2.nextCursor).toBeNull();
  });

  it("mantiene el orden por votos entre páginas (el cursor no reordena)", async () => {
    const a = await participar({ videoStatus: "PUBLISHED", subStatus: "PUBLISHED", votos: 1 });
    const b = await participar({ videoStatus: "PUBLISHED", subStatus: "PUBLISHED", votos: 30 });
    const c = await participar({ videoStatus: "PUBLISHED", subStatus: "PUBLISHED", votos: 20 });
    const d = await participar({ videoStatus: "PUBLISHED", subStatus: "PUBLISHED", votos: 10 });

    expect(await recorrerTodo(1)).toEqual([
      b.submissionId,
      c.submissionId,
      d.submissionId,
      a.submissionId,
    ]);
  });

  it("una participación RETIRADA entre páginas no descoloca el recorrido", async () => {
    // El fallo clásico del OFFSET: se retira una fila de la página 1 y la página 2 se corre un
    // puesto, así que una participación NUNCA se ve. Con cursor, la ventana va anclada a una fila.
    const b = await participar({ videoStatus: "PUBLISHED", subStatus: "PUBLISHED", votos: 30 });
    const c = await participar({ videoStatus: "PUBLISHED", subStatus: "PUBLISHED", votos: 20 });
    const d = await participar({ videoStatus: "PUBLISHED", subStatus: "PUBLISHED", votos: 10 });

    const p1 = await listarParticipacionesVisibles(prisma, challengeId, { limit: 1 });
    expect(p1.items[0]?.submissionId).toBe(b.submissionId);

    // Se retira la que YA se sirvió (queda fuera del filtro de visibles).
    await prisma.submission.update({ where: { id: b.submissionId }, data: { status: "REMOVED" } });

    // La página siguiente sigue siendo la de después de `b`: c y luego d. Con OFFSET 1 se habría
    // saltado `c` (al desaparecer `b`, `c` pasa a ocupar el puesto 0).
    const resto = await listarParticipacionesVisibles(prisma, challengeId, {
      cursor: p1.nextCursor,
      limit: 10,
    });
    expect(resto.items.map((p) => p.submissionId)).toEqual([c.submissionId, d.submissionId]);
  });

  it("acota el tamaño de página al tope (el cliente no elige cuánto se le sirve)", async () => {
    await participacionesEmpatadas(PARTICIPACIONES_LIMITE_MAX + 3);

    const pagina = await listarParticipacionesVisibles(prisma, challengeId, { limit: 9999 });
    expect(pagina.items.length).toBe(PARTICIPACIONES_LIMITE_MAX);
    expect(pagina.nextCursor).not.toBeNull();
  });
});

/**
 * Test ESTRUCTURAL: la consulta NO puede volver a OFFSET. `take`/`skip` de Prisma sin `cursor` es
 * exactamente un OFFSET; el único `skip` admitido aquí es el `skip: 1` que salta la fila del cursor.
 * Si alguien "arregla" la paginación con `skip: (pagina-1)*n`, esto se pone rojo.
 */
describe("estructura de la consulta", () => {
  it("no usa OFFSET en ninguna forma (`skip` de Prisma sin cursor ES un OFFSET)", () => {
    const fuente = readFileSync(
      join(process.cwd(), "src", "server", "services", "participaciones-lista.ts"),
      "utf8",
    );
    // Se comparan solo las líneas de CÓDIGO: un `skip` nombrado en un comentario no es un OFFSET.
    const codigo = fuente
      .split("\n")
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join("\n");
    expect(codigo).not.toMatch(/\bskip\s*:/);
    expect(codigo).not.toMatch(/\bOFFSET\b/i);
  });
});
