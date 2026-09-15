/**
 * Rutas de los comentarios. Publicar y borrar pasan por `mutatingRoute` (Origin/sesión/CSRF) y por el
 * tope por usuario; leer es público. Con dientes: el autor sale de la SESIÓN, nunca del cuerpo; sin
 * CSRF o con el tope agotado no se escribe nada; los rechazos del servicio son 404/400.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { issueCsrfToken } from "../src/server/auth/csrf";

const SECRET = "TEST-FIXTURE-comentarios-secret-suficientemente-largo-de-verdad";
const APP_URL = "http://test.local";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  rateLimit: vi.fn(),
  publicar: vi.fn(),
  retirar: vi.fn(),
  listar: vi.fn(),
}));

vi.mock("@/config/env", () => ({ env: { APP_URL, AUTH_SECRET: SECRET } }));
vi.mock("@/server/auth/current-user", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/server/db/client", () => ({ prisma: {} }));
vi.mock("@/server/security/rate-limit", () => ({ rateLimit: mocks.rateLimit }));
vi.mock("@/server/services/comentarios", () => ({
  publicarComentario: mocks.publicar,
  retirarComentario: mocks.retirar,
  listarComentarios: mocks.listar,
}));

import { DELETE as BORRAR } from "../src/app/api/comentarios/[id]/route";
import { GET as LEER, POST as PUBLICAR } from "../src/app/api/videos/[id]/comentarios/route";

const USER = { userId: "user-1", sessionId: "sess-u", role: "USER", emailVerified: new Date() };
const COMENTARIO = {
  id: "c1",
  texto: "Hola",
  creadoMs: 1,
  autor: { username: "ana", displayName: null, image: null },
  esMio: true,
};

function peticion(url: string, metodo: string, cuerpo?: unknown, csrf = true): Request {
  const headers: Record<string, string> = { Origin: APP_URL, "Content-Type": "application/json" };
  if (csrf) headers["X-CSRF-Token"] = issueCsrfToken(SECRET, USER.sessionId);
  return new Request(url, {
    method: metodo,
    headers,
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
  });
}
const publicar = (cuerpo: unknown, csrf = true) =>
  PUBLICAR(peticion("http://test.local/api/videos/vid-1/comentarios", "POST", cuerpo, csrf), {
    params: Promise.resolve({ id: "vid-1" }),
  });
const borrar = (csrf = true) =>
  BORRAR(peticion("http://test.local/api/comentarios/c1", "DELETE", undefined, csrf), {
    params: Promise.resolve({ id: "c1" }),
  });
const leer = (query = "") =>
  LEER(new Request(`http://test.local/api/videos/vid-1/comentarios${query}`), {
    params: Promise.resolve({ id: "vid-1" }),
  });

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  mocks.getCurrentUser.mockResolvedValue(USER);
  mocks.rateLimit.mockResolvedValue({ allowed: true });
  mocks.publicar.mockResolvedValue({ estado: "publicado", comentario: COMENTARIO, comentarios: 4 });
  mocks.retirar.mockResolvedValue({ estado: "retirado", comentarios: 3 });
  mocks.listar.mockResolvedValue({ items: [COMENTARIO], nextCursor: null });
});

describe("POST /api/videos/[id]/comentarios (publicar)", () => {
  it("201 con el comentario y el contador; el autor es el de la SESIÓN", async () => {
    const res = await publicar({ texto: "Hola", userId: "otra-persona" });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ comentario: COMENTARIO, comentarios: 4 });
    expect(mocks.publicar).toHaveBeenCalledWith(expect.anything(), {
      userId: "user-1",
      videoId: "vid-1",
      texto: "Hola",
    });
  });

  it("sin CSRF -> 403; sin cuerpo válido -> 400; con el tope agotado -> 429: y no se publica", async () => {
    expect((await publicar({ texto: "Hola" }, false)).status).toBe(403);
    expect((await publicar({ nada: 1 })).status).toBe(400);
    expect((await publicar({ texto: 42 })).status).toBe(400);
    mocks.rateLimit.mockResolvedValueOnce({ allowed: false });
    expect((await publicar({ texto: "Hola" })).status).toBe(429);
    expect(mocks.publicar).not.toHaveBeenCalled();
  });

  it("vídeo que no se ve -> 404; texto que no vale -> 400", async () => {
    mocks.publicar.mockResolvedValueOnce({ estado: "rechazado", motivo: "NO_DISPONIBLE" });
    expect((await publicar({ texto: "Hola" })).status).toBe(404);
    mocks.publicar.mockResolvedValueOnce({ estado: "rechazado", motivo: "TEXTO_INVALIDO" });
    expect((await publicar({ texto: "   " })).status).toBe(400);
  });
});

describe("GET /api/videos/[id]/comentarios (leer)", () => {
  it("público: un invitado lee (sin 'míos'), y la respuesta no se cachea", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const res = await leer("?cursor=c9");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.listar).toHaveBeenCalledWith(expect.anything(), "vid-1", {
      cursor: "c9",
      userId: null,
    });
  });

  it("con sesión, marca los tuyos; un vídeo que no se ve -> 404", async () => {
    await leer();
    expect(mocks.listar).toHaveBeenCalledWith(expect.anything(), "vid-1", {
      cursor: null,
      userId: "user-1",
    });
    mocks.listar.mockResolvedValueOnce(null);
    expect((await leer()).status).toBe(404);
  });
});

describe("DELETE /api/comentarios/[id] (borrar el propio)", () => {
  it("200 con el contador; el que borra es el de la SESIÓN", async () => {
    const res = await borrar();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ comentarios: 3 });
    expect(mocks.retirar).toHaveBeenCalledWith(expect.anything(), {
      userId: "user-1",
      commentId: "c1",
    });
  });

  it("sin CSRF -> 403 y no borra; ajeno o inexistente -> 404", async () => {
    expect((await borrar(false)).status).toBe(403);
    expect(mocks.retirar).not.toHaveBeenCalled();
    mocks.retirar.mockResolvedValueOnce({ estado: "rechazado", motivo: "NO_DISPONIBLE" });
    expect((await borrar()).status).toBe(404);
  });
});
