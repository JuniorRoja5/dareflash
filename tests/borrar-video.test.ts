/**
 * DELETE /api/videos/[id] — borrar MI vídeo, con dientes de AUTORIZACIÓN + ENCOLADO:
 *   - El DUEÑO lo borra: 200, el Video queda REMOVED y se ENCOLA UN job BUNNY_DELETE_VIDEO con el
 *     bunnyVideoId correcto. El borrado del OBJETO en Bunny lo hace el worker (no la peticion), asi
 *     que un fallo de Bunny nunca deja el objeto huerfano ni bloquea al usuario.
 *   - OTRO usuario NO puede borrar el vídeo de otro: 404 y el vídeo sigue INTACTO (ni REMOVED ni job
 *     encolado). El 404 (no 403) no revela la existencia de vídeos ajenos.
 *   - Idempotente: un segundo DELETE sobre un vídeo ya REMOVED -> 200 y NO duplica el job.
 * El CSRF se forja con la funcion real (issueCsrfToken) y el mismo secreto: se ejercita de verdad.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { issueCsrfToken } from "../src/server/auth/csrf";
import type { PrismaClient } from "../src/generated/prisma/client";
import { generarHandle } from "../src/server/auth/handle";

import { createTestPrisma, resetDb } from "./helpers/db";

const SECRET = "TEST-FIXTURE-auth-secret-borrar-video-largo-1";
const APP_URL = "http://test.local";

const H = vi.hoisted(() => ({ prisma: null as unknown as PrismaClient }));
const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));

vi.mock("@/config/env", () => ({
  env: { APP_URL, AUTH_SECRET: SECRET },
}));
vi.mock("@/server/auth/current-user", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/server/db/client", () => ({
  get prisma() {
    return H.prisma;
  },
}));

import { DELETE } from "../src/app/api/videos/[id]/route";

let prisma: PrismaClient;

beforeAll(() => {
  prisma = createTestPrisma();
  H.prisma = prisma;
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
  mocks.getCurrentUser.mockReset();
});

function sesion(userId: string) {
  return { userId, sessionId: `sess-${userId}`, role: "USER", emailVerified: null };
}

async function crearUsuarioConVideo(userId: string): Promise<string> {
  await prisma.user.create({ data: { id: userId, username: generarHandle(), passwordHash: "x" } });
  const v = await prisma.video.create({
    data: { userId, bunnyVideoId: `bunny-${userId}`, status: "PUBLISHED" },
    select: { id: true },
  });
  return v.id;
}

function reqDelete(
  videoId: string,
  ses: { sessionId: string },
): {
  req: Request;
  ctx: { params: Promise<{ id: string }> };
} {
  const req = new Request(`http://test.local/api/videos/${videoId}`, {
    method: "DELETE",
    headers: { Origin: APP_URL, "X-CSRF-Token": issueCsrfToken(SECRET, ses.sessionId) },
  });
  return { req, ctx: { params: Promise.resolve({ id: videoId }) } };
}

function jobsBorrado() {
  return prisma.job.findMany({ where: { type: "BUNNY_DELETE_VIDEO" } });
}

describe("DELETE /api/videos/[id] (autorizacion por dueno)", () => {
  it("el DUENO borra: 200, Video REMOVED y UN job BUNNY_DELETE_VIDEO encolado", async () => {
    const videoId = await crearUsuarioConVideo("dueno");
    const ses = sesion("dueno");
    mocks.getCurrentUser.mockResolvedValue(ses);

    const { req, ctx } = reqDelete(videoId, ses);
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(200);

    const v = await prisma.video.findUnique({ where: { id: videoId }, select: { status: true } });
    expect(v?.status).toBe("REMOVED");

    const jobs = await jobsBorrado();
    expect(jobs).toHaveLength(1);
    expect((jobs[0]!.payload as { bunnyVideoId?: string }).bunnyVideoId).toBe("bunny-dueno");
    expect(jobs[0]!.status).toBe("PENDING");
  });

  it("OTRO usuario NO puede borrar: 404, video INTACTO y NADA encolado", async () => {
    const videoId = await crearUsuarioConVideo("dueno");
    await prisma.user.create({
      data: { id: "intruso", username: generarHandle(), passwordHash: "x" },
    });
    const ses = sesion("intruso");
    mocks.getCurrentUser.mockResolvedValue(ses);

    const { req, ctx } = reqDelete(videoId, ses);
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(404);

    const v = await prisma.video.findUnique({ where: { id: videoId }, select: { status: true } });
    expect(v?.status).toBe("PUBLISHED"); // intacto
    expect(await jobsBorrado()).toHaveLength(0); // no se encola el borrado de un video ajeno
  });

  it("idempotente: segundo DELETE sobre REMOVED -> 200 y NO duplica el job", async () => {
    const videoId = await crearUsuarioConVideo("dueno");
    const ses = sesion("dueno");
    mocks.getCurrentUser.mockResolvedValue(ses);

    const primero = reqDelete(videoId, ses);
    expect((await DELETE(primero.req, primero.ctx)).status).toBe(200);
    const segundo = reqDelete(videoId, ses);
    expect((await DELETE(segundo.req, segundo.ctx)).status).toBe(200);

    expect(await jobsBorrado()).toHaveLength(1); // un solo job, sin duplicar
  });
});
