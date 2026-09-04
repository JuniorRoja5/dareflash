/**
 * FILAS ANTERIORES A LA MIGRACIÓN: un borrado del dueño de ANTES no puede vetar a nadie.
 *
 * El backfill marca `MODERACION` solo donde había evidencia (`Submission.status = REMOVED`) y deja
 * `NULL` el resto. Pero un borrado del dueño ANTERIOR a la migración queda con `retiradaMotivo = NULL`
 * y `video.status = REMOVED`, y ese caso no es MODERACION, ni DUENO, ni FAILED, ni PUBLISHED/PENDING:
 * caía al `return` final y se bloqueaba igual. La migración NO desbloqueaba a esa gente.
 *
 * Y hay una segunda consecuencia peor: `puedeParticipar` (la guarda previa) SÍ lo dejaba pasar, así
 * que la petición creaba el objeto en Bunny y ERA la transacción la que bloqueaba — o sea, volvía el
 * huérfano que la pieza anterior había quitado. Las dos comprobaciones decían cosas distintas.
 *
 * Se ejecuta la RUTA REAL (con su envoltorio, su BD y Bunny doblado), no se escriben las filas a mano:
 * un test que simula el camino prueba el ayudante, no la aplicación.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";

const APP_URL = "http://test.local";
const SECRET = "secreto-de-test-suficientemente-largo-para-hmac";

const mocks = vi.hoisted(() => ({
  prisma: null as PrismaClient | null,
  getCurrentUser: vi.fn(),
  /** GUIDs creados en Bunny. Si un intento bloqueado crea uno, es un huérfano. */
  guids: [] as string[],
}));

vi.mock("@/config/env", () => ({
  env: {
    APP_URL,
    AUTH_SECRET: SECRET,
    BUNNY_STREAM_LIBRARY_ID: "lib",
    BUNNY_STREAM_API_KEY: "key",
  },
}));
vi.mock("@/server/db/client", () => ({
  get prisma() {
    return mocks.prisma;
  },
}));
vi.mock("@/server/auth/current-user", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/server/services/bunny", async (original) => {
  const real = await original<typeof import("../src/server/services/bunny")>();
  return {
    ...real,
    clienteBunnyReal: {},
    crearObjetoVideo: vi.fn(async () => {
      const guid = `guid-${mocks.guids.length + 1}`;
      mocks.guids.push(guid);
      return guid;
    }),
  };
});

import { POST } from "../src/app/api/videos/upload-credential/route";
import { issueCsrfToken } from "../src/server/auth/csrf";
import { iniciarParticipacion } from "../src/server/services/participacion";
import { generarPublicCode } from "../src/server/services/reto-codigo";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

let prisma: PrismaClient;
let challengeId: string;
let userId: string;

beforeAll(() => {
  prisma = createTestPrisma();
  mocks.prisma = prisma;
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
  mocks.guids.length = 0;
  mocks.getCurrentUser.mockReset();
  const admin = await crearUsuario(prisma);
  const reto = await prisma.challenge.create({
    data: {
      title: "Reto",
      slug: "reto",
      publicCode: generarPublicCode(),
      category: "fitness",
      status: "PUBLISHED",
      prizeCurrency: "USD",
      startsAt: new Date(Date.now() - 3_600_000),
      deadline: new Date(Date.now() + 86_400_000),
      createdById: admin,
    },
    select: { id: true },
  });
  challengeId = reto.id;
  userId = await crearUsuario(prisma);
});

/** Pide credencial de subida por la RUTA real, con sesión y CSRF válidos. */
async function pedirSubida() {
  mocks.getCurrentUser.mockResolvedValue({
    userId,
    sessionId: "s1",
    role: "USER",
    emailVerified: new Date(),
  });
  const res = await POST(
    new Request(`${APP_URL}/api/videos/upload-credential`, {
      method: "POST",
      headers: {
        origin: APP_URL,
        "x-csrf-token": issueCsrfToken(SECRET, "s1"),
        "content-type": "application/json",
      },
      body: JSON.stringify({ title: "V", challengeId }),
    }),
    undefined as never,
  );
  return { res, body: (await res.json()) as Record<string, unknown> };
}

/** Primera participación, ya publicada. */
async function participacionViva() {
  const r = await prisma.$transaction((tx) =>
    iniciarParticipacion(tx, { challengeId, userId, bunnyGuid: "previo", title: "V0" }),
  );
  if (r.modo === "bloqueada") throw new Error("inesperado");
  await prisma.video.update({ where: { id: r.videoId }, data: { status: "PUBLISHED" } });
  await prisma.submission.update({ where: { id: r.submissionId }, data: { status: "PUBLISHED" } });
  return r;
}

describe("borrado del dueño ANTERIOR a la migración (motivo NULL + vídeo REMOVED)", () => {
  /** Estado EXACTO que dejaba el borrado del dueño antes del campo: solo el Video pasaba a REMOVED. */
  async function comoAntesDeLaMigracion(videoId: string) {
    await prisma.video.update({ where: { id: videoId }, data: { status: "REMOVED" } });
    // La Submission quedaba viva y SIN motivo — que es lo que deja el backfill en esas filas.
    await prisma.submission.updateMany({ where: { videoId }, data: { retiradaMotivo: null } });
  }

  it("puede volver a participar", async () => {
    const p = await participacionViva();
    await comoAntesDeLaMigracion(p.videoId);

    const { res, body } = await pedirSubida();

    expect(res.status).toBe(200);
    expect(body.videoDbId).toBeTypeOf("string");
  });

  it("y si se le bloqueara, al menos no dejaría un huérfano en Bunny", async () => {
    // Las DOS comprobaciones tienen que decir lo mismo. Cuando la previa dejaba pasar y la de la
    // transacción bloqueaba, cada intento creaba un objeto en Bunny para nada.
    const p = await participacionViva();
    await comoAntesDeLaMigracion(p.videoId);

    const { res } = await pedirSubida();

    if (res.status !== 200) expect(mocks.guids).toEqual([]);
  });
});

describe("la moderación sigue bloqueando, y sin crear huérfanos", () => {
  it("un retirado por moderación no puede volver", async () => {
    const p = await participacionViva();
    await prisma.submission.update({
      where: { id: p.submissionId },
      data: { status: "REMOVED", retiradaMotivo: "MODERACION", retiradaEn: new Date() },
    });

    const { res, body } = await pedirSubida();

    expect(res.status).toBe(409);
    expect((body.error as { code: string }).code).toBe("PARTICIPACION_BLOQUEADA");
    // Rechazado ANTES de tocar Bunny.
    expect(mocks.guids).toEqual([]);
  });
});
