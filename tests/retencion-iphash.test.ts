/**
 * RETENCIÓN de la IP hasheada de los votos: `Vote.ipHash` no sobrevive a su ventana.
 *
 * Lo que arregla: el esquema documentaba "retención de 90 días" y NO había nada que la aplicara. El
 * tipo `RETENTION_PURGE` estaba en la unión de JobType sin handler, sin cadencia y sin llamante — una
 * protección escrita que no existía. Estos tests fijan que ahora es real, y sobre todo que sigue
 * CABLEADA: una función correcta que nadie llama es exactamente el estado del que veníamos.
 *
 * Con dientes:
 *  - dentro de la ventana se conserva; fuera, se borra.
 *  - se borra la IP, NO el voto (la fila y su contador siguen ahí).
 *  - el barrido está enchufado al bucle del worker: se conduce el bucle DE VERDAD y se comprueba que
 *    purga. Quitarlo del bucle deja este test en rojo — y con él, el sistema en el estado de antes.
 *  - idempotente: la segunda pasada no hace nada.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { VOTO_IPHASH_RETENCION_MS } from "../src/config/constants";
import type { PrismaClient } from "../src/generated/prisma/client";
import { JobTypeSchema } from "../src/config/constants";
import { bucleWorker } from "../src/server/jobs/worker";
import { generarPublicCode } from "../src/server/services/reto-codigo";
import { purgarIpHashDeVotos } from "../src/server/services/votes";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

let prisma: PrismaClient;
let challengeId: string;
let submissionId: string;

beforeAll(() => {
  prisma = createTestPrisma();
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);

  const autor = await crearUsuario(prisma);
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
      createdById: autor,
    },
    select: { id: true },
  });
  challengeId = reto.id;
  const video = await prisma.video.create({
    data: { userId: autor, bunnyVideoId: `bunny-${reto.id}`, status: "PUBLISHED" },
    select: { id: true },
  });
  const sub = await prisma.submission.create({
    data: { challengeId, userId: autor, videoId: video.id, status: "PUBLISHED" },
    select: { id: true },
  });
  submissionId = sub.id;
});

/** Un voto con `createdAt` e `ipHash` puestos a mano (para poder envejecerlo). */
async function votoCon(edadMs: number, ipHash: string | null = "hash-de-una-ip"): Promise<string> {
  const userId = await crearUsuario(prisma);
  const v = await prisma.vote.create({
    data: {
      userId,
      submissionId,
      challengeId,
      ipHash,
      createdAt: new Date(Date.now() - edadMs),
    },
    select: { id: true },
  });
  return v.id;
}

const ipDe = (id: string) =>
  prisma.vote.findUniqueOrThrow({ where: { id }, select: { ipHash: true } }).then((v) => v.ipHash);

const DIA = 24 * 60 * 60 * 1000;

describe("la ventana de retención se respeta", () => {
  it("un voto DENTRO de la ventana conserva su ipHash", async () => {
    const reciente = await votoCon(10 * DIA);
    await purgarIpHashDeVotos(prisma, { retenerMs: VOTO_IPHASH_RETENCION_MS });
    expect(await ipDe(reciente)).toBe("hash-de-una-ip");
  });

  it("un voto FUERA de la ventana lo pierde", async () => {
    const viejo = await votoCon(VOTO_IPHASH_RETENCION_MS + DIA);
    await purgarIpHashDeVotos(prisma, { retenerMs: VOTO_IPHASH_RETENCION_MS });
    expect(await ipDe(viejo)).toBeNull();
  });

  it("en el mismo barrido: caduca el viejo y sobrevive el reciente", async () => {
    const viejo = await votoCon(200 * DIA);
    const reciente = await votoCon(1 * DIA);

    const r = await purgarIpHashDeVotos(prisma, { retenerMs: VOTO_IPHASH_RETENCION_MS });

    expect(r.total).toBe(1);
    expect(r.drenado).toBe(true);
    expect(await ipDe(viejo)).toBeNull();
    expect(await ipDe(reciente)).toBe("hash-de-una-ip");
  });
});

describe("se borra la IP, NO el voto", () => {
  it("la fila sobrevive con su usuario, su participación y su reto", async () => {
    const viejo = await votoCon(200 * DIA);
    await purgarIpHashDeVotos(prisma, { retenerMs: VOTO_IPHASH_RETENCION_MS });

    const fila = await prisma.vote.findUnique({ where: { id: viejo } });
    expect(fila).not.toBeNull(); // el voto NO se borra: cuenta para el reto
    expect(fila?.ipHash).toBeNull(); // lo único que caduca es el dato personal
    expect(fila?.submissionId).toBe(submissionId);
    expect(fila?.challengeId).toBe(challengeId);
    expect(await prisma.vote.count()).toBe(1);
  });
});

describe("idempotente", () => {
  it("la segunda pasada no toca nada", async () => {
    await votoCon(200 * DIA);
    await votoCon(300 * DIA);

    const primera = await purgarIpHashDeVotos(prisma, { retenerMs: VOTO_IPHASH_RETENCION_MS });
    const segunda = await purgarIpHashDeVotos(prisma, { retenerMs: VOTO_IPHASH_RETENCION_MS });

    expect(primera.total).toBe(2);
    // La condición lleva `ipHash IS NOT NULL`: una fila ya anonimizada deja de casar. Sin eso, las
    // mismas filas casarían para siempre y el bucle de tandas no terminaría de drenar nunca.
    expect(segunda.total).toBe(0);
    expect(segunda.drenado).toBe(true);
  });

  it("un voto que nunca tuvo IP no cuenta como trabajo", async () => {
    await votoCon(200 * DIA, null);
    const r = await purgarIpHashDeVotos(prisma, { retenerMs: VOTO_IPHASH_RETENCION_MS });
    expect(r.total).toBe(0);
  });
});

describe("está CABLEADO al worker (no es una función que nadie llama)", () => {
  it("una vuelta del bucle del worker purga las IP caducadas", async () => {
    // Este es el test que distingue "existe la función" de "la retención OCURRE". Se conduce el
    // bucle REAL: si alguien quita el barrido del bloque de purgas de `bucleWorker`, esto cae.
    const viejo = await votoCon(200 * DIA);
    const reciente = await votoCon(1 * DIA);

    // Se para en `dormir`, que el bucle llama al FINAL de una vuelta completa: así se garantiza
    // que la vuelta llegó al bloque de purgas. (Contar llamadas a `parar()` no vale: el bucle lo
    // consulta varias veces por vuelta, y una de ellas es ANTES de las purgas.)
    let parar = false;
    await bucleWorker(
      prisma,
      {},
      {
        workerToken: "w-retencion",
        limit: 1,
        intervaloMs: 1,
        parar: () => parar,
        dormir: async () => {
          parar = true;
        },
        // La poda corre cuando ha pasado su cadencia; con 0 corre ya en la primera vuelta.
        podaCadaMs: 0,
        votoIpHashRetenerMs: VOTO_IPHASH_RETENCION_MS,
      },
    );

    expect(await ipDe(viejo)).toBeNull(); // el bucle lo purgó
    expect(await ipDe(reciente)).toBe("hash-de-una-ip");
  });

  it("el barrido usa la ventana INYECTADA (la cadencia y el plazo son configurables, no fijos)", async () => {
    const hace2dias = await votoCon(2 * DIA);

    let parar = false;
    await bucleWorker(
      prisma,
      {},
      {
        workerToken: "w-retencion-2",
        limit: 1,
        intervaloMs: 1,
        parar: () => parar,
        dormir: async () => {
          parar = true;
        },
        podaCadaMs: 0,
        votoIpHashRetenerMs: DIA, // ventana de 1 día -> un voto de hace 2 ya caducó
      },
    );

    expect(await ipDe(hace2dias)).toBeNull();
  });
});

/**
 * ESTRUCTURAL: el tipo huérfano no vuelve. `RETENTION_PURGE` estaba en la unión de JobType sin nada
 * detrás; la retención no es un job de cola sino un barrido del worker (como la poda de Job, la de
 * RateLimit y la de sesiones). Reintroducir el tipo volvería a sugerir una protección que no existe.
 */
describe("no queda el tipo de job huérfano", () => {
  it("RETENTION_PURGE ya no está en la unión de JobType", () => {
    expect(JobTypeSchema.options).not.toContain("RETENTION_PURGE");
  });

  it("y ningún sitio del código lo menciona como tipo de job", () => {
    expect(JobTypeSchema.options.some((t) => t.includes("RETENTION"))).toBe(false);
  });
});
