/**
 * POST /api/videos/[id]/miniatura — el dueño fija una miniatura de SU vídeo. Con dientes: ownership por
 * construcción (vídeo ajeno/inexistente -> 404 y NO llama a Bunny); sin CSRF -> 403; sin imagen -> 400;
 * imagen válida -> procesa a JPEG y llama a Bunny Set Thumbnail con el GUID; fallo de Bunny -> 502.
 */
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { issueCsrfToken } from "../src/server/auth/csrf";

const SECRET = "TEST-FIXTURE-miniatura-secret-suficientemente-largo-de-verdad";
const APP_URL = "http://test.local";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  rateLimit: vi.fn(),
  establecerMiniatura: vi.fn(),
  videoFindUnique: vi.fn(),
}));

vi.mock("@/config/env", () => ({
  env: {
    APP_URL,
    AUTH_SECRET: SECRET,
    BUNNY_STREAM_LIBRARY_ID: "lib1",
    BUNNY_STREAM_API_KEY: "APIKEY",
  },
}));
vi.mock("@/server/auth/current-user", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/server/db/client", () => ({
  prisma: { video: { findUnique: mocks.videoFindUnique } },
}));
vi.mock("@/server/security/rate-limit", () => ({ rateLimit: mocks.rateLimit }));
vi.mock("@/server/services/bunny", async (orig) => {
  const real = await orig<typeof import("@/server/services/bunny")>();
  return { ...real, establecerMiniatura: mocks.establecerMiniatura, clienteBunnyReal: {} };
});

import { POST as MINIATURA } from "../src/app/api/videos/[id]/miniatura/route";

const OWNER = { userId: "u-owner", sessionId: "s-o", role: "USER", emailVerified: new Date() };
const OTHER = { userId: "u-other", sessionId: "s-x", role: "USER", emailVerified: new Date() };

async function req(
  id: string,
  session: { sessionId: string },
  opts: { csrf?: string | null; imagen?: Buffer | null } = {},
): Promise<Request> {
  const fd = new FormData();
  const img =
    opts.imagen === undefined
      ? await sharp({
          create: { width: 400, height: 200, channels: 3, background: { r: 20, g: 120, b: 200 } },
        })
          .png()
          .toBuffer()
      : opts.imagen;
  if (img) fd.set("imagen", new File([new Uint8Array(img)], "m.png", { type: "image/png" }));
  const headers: Record<string, string> = { Origin: APP_URL };
  if (opts.csrf !== null)
    headers["X-CSRF-Token"] = opts.csrf ?? issueCsrfToken(SECRET, session.sessionId);
  return new Request(`http://test.local/api/videos/${id}/miniatura`, {
    method: "POST",
    headers,
    body: fd,
  });
}

const llamar = async (id: string, session: typeof OWNER, opts = {}) =>
  MINIATURA(await req(id, session, opts), { params: Promise.resolve({ id }) });

beforeEach(() => {
  mocks.getCurrentUser.mockReset();
  mocks.rateLimit.mockReset();
  mocks.establecerMiniatura.mockReset();
  mocks.videoFindUnique.mockReset();
  mocks.rateLimit.mockResolvedValue({ allowed: true });
  mocks.videoFindUnique.mockResolvedValue({ userId: "u-owner", bunnyVideoId: "guid-xyz" });
  mocks.establecerMiniatura.mockResolvedValue(undefined);
});
afterEach(() => vi.clearAllMocks());

describe("POST /api/videos/[id]/miniatura", () => {
  it("dueño + imagen válida -> 200; procesa a JPEG y llama a Bunny con el GUID", async () => {
    mocks.getCurrentUser.mockResolvedValue(OWNER);
    const res = await llamar("v1", OWNER);
    expect(res.status).toBe(200);
    expect(mocks.establecerMiniatura).toHaveBeenCalledTimes(1);
    const args = mocks.establecerMiniatura.mock.calls[0]!;
    expect(args[2]).toBe("guid-xyz"); // videoGuid
    expect(args[4]).toBe("image/jpeg"); // contentType JPEG (thumbnail.jpg de Bunny)
    expect(Buffer.isBuffer(args[3])).toBe(true); // bytes procesados
  });

  it("vídeo de OTRO usuario -> 404 y NO llama a Bunny", async () => {
    mocks.getCurrentUser.mockResolvedValue(OTHER); // sesión de otro; el vídeo es de u-owner
    const res = await llamar("v1", OTHER);
    expect(res.status).toBe(404);
    expect(mocks.establecerMiniatura).not.toHaveBeenCalled();
  });

  it("vídeo inexistente -> 404 y NO llama a Bunny", async () => {
    mocks.getCurrentUser.mockResolvedValue(OWNER);
    mocks.videoFindUnique.mockResolvedValueOnce(null);
    const res = await llamar("fantasma", OWNER);
    expect(res.status).toBe(404);
    expect(mocks.establecerMiniatura).not.toHaveBeenCalled();
  });

  it("sin imagen -> 400", async () => {
    mocks.getCurrentUser.mockResolvedValue(OWNER);
    const res = await llamar("v1", OWNER, { imagen: null });
    expect(res.status).toBe(400);
    expect(mocks.establecerMiniatura).not.toHaveBeenCalled();
  });

  it("sin token CSRF -> 403", async () => {
    mocks.getCurrentUser.mockResolvedValue(OWNER);
    const res = await llamar("v1", OWNER, { csrf: null });
    expect(res.status).toBe(403);
    expect(mocks.establecerMiniatura).not.toHaveBeenCalled();
  });

  it("fallo de Bunny -> 502 (aviso, no rompe la subida)", async () => {
    mocks.getCurrentUser.mockResolvedValue(OWNER);
    mocks.establecerMiniatura.mockRejectedValueOnce(new Error("Bunny setThumbnail: HTTP 500"));
    const res = await llamar("v1", OWNER);
    expect(res.status).toBe(502);
  });
});
