/**
 * DELETE /api/videos/[id] — borrar MI vídeo, con dientes de AUTORIZACIÓN:
 *   - El DUEÑO lo borra: 200, el Video queda REMOVED y se llama a Bunny deleteVideo.
 *   - OTRO usuario NO puede borrar el vídeo de otro: 404 y el vídeo sigue INTACTO (ni REMOVED ni
 *     Bunny). El 404 (no 403) no revela la existencia de vídeos ajenos.
 *   - Si Bunny falla, el vídeo queda REMOVED IGUAL (200): el borrado logico no depende de Bunny.
 * El CSRF se forja con la funcion real (issueCsrfToken) y el mismo secreto: se ejercita de verdad.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { issueCsrfToken } from "../src/server/auth/csrf";
import type { PrismaClient } from "../src/generated/prisma/client";

import { createTestPrisma, resetDb } from "./helpers/db";

const SECRET = "TEST-FIXTURE-auth-secret-borrar-video-largo-1";
const APP_URL = "http://test.local";

const H = vi.hoisted(() => ({ prisma: null as unknown as PrismaClient }));
const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), deleteVideo: vi.fn() }));

vi.mock("@/config/env", () => ({
  env: {
    APP_URL,
    AUTH_SECRET: SECRET,
    BUNNY_STREAM_LIBRARY_ID: "lib-test",
    BUNNY_STREAM_API_KEY: "key-test",
  },
}));
vi.mock("@/server/auth/current-user", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/server/db/client", () => ({
  get prisma() {
    return H.prisma;
  },
}));
vi.mock("@/server/services/bunny", async (orig) => {
  const real = await orig<typeof import("@/server/services/bunny")>();
  return {
    ...real,
    clienteBunnyReal: { ...real.clienteBunnyReal, deleteVideo: mocks.deleteVideo },
  };
});

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
  mocks.deleteVideo.mockReset().mockResolvedValue(undefined);
});

function sesion(userId: string) {
  return { userId, sessionId: `sess-${userId}`, role: "USER", emailVerified: null };
}

async function crearUsuarioConVideo(userId: string): Promise<string> {
  await prisma.user.create({ data: { id: userId, passwordHash: "x" } });
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

describe("DELETE /api/videos/[id] (autorizacion por dueno)", () => {
  it("el DUENO borra: 200, Video REMOVED y Bunny llamado", async () => {
    const videoId = await crearUsuarioConVideo("dueno");
    const ses = sesion("dueno");
    mocks.getCurrentUser.mockResolvedValue(ses);

    const { req, ctx } = reqDelete(videoId, ses);
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(200);

    const v = await prisma.video.findUnique({ where: { id: videoId }, select: { status: true } });
    expect(v?.status).toBe("REMOVED");
    expect(mocks.deleteVideo).toHaveBeenCalledOnce();
  });

  it("OTRO usuario NO puede borrar: 404 y el video sigue INTACTO", async () => {
    const videoId = await crearUsuarioConVideo("dueno");
    await prisma.user.create({ data: { id: "intruso", passwordHash: "x" } });
    const ses = sesion("intruso");
    mocks.getCurrentUser.mockResolvedValue(ses);

    const { req, ctx } = reqDelete(videoId, ses);
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(404);

    const v = await prisma.video.findUnique({ where: { id: videoId }, select: { status: true } });
    expect(v?.status).toBe("PUBLISHED"); // intacto
    expect(mocks.deleteVideo).not.toHaveBeenCalled();
  });

  it("si Bunny falla, el video queda REMOVED igual (200)", async () => {
    const videoId = await crearUsuarioConVideo("dueno");
    const ses = sesion("dueno");
    mocks.getCurrentUser.mockResolvedValue(ses);
    mocks.deleteVideo.mockRejectedValue(new Error("Bunny 500"));

    const { req, ctx } = reqDelete(videoId, ses);
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(200);

    const v = await prisma.video.findUnique({ where: { id: videoId }, select: { status: true } });
    expect(v?.status).toBe("REMOVED");
  });
});
