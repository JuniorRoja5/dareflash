/**
 * Rutas de los anuncios y del inspector del panel: se protegen solas (requireRole ADMIN); el envío
 * además pasa por `mutatingRoute`. Con dientes: un USER recibe 403 y el servicio NO se llama; quién
 * envía sale de la SESIÓN; los filtros del inspector llegan validados.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { issueCsrfToken } from "../src/server/auth/csrf";

const SECRET = "TEST-FIXTURE-anuncios-secret-suficientemente-largo-de-verdad";
const APP_URL = "http://test.local";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  enviarAnuncio: vi.fn(),
  listarAnuncios: vi.fn(),
  inspeccionar: vi.fn(),
}));

vi.mock("@/config/env", () => ({ env: { APP_URL, AUTH_SECRET: SECRET } }));
vi.mock("@/server/auth/current-user", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/server/db/client", () => ({ prisma: {} }));
vi.mock("@/server/services/anuncios", async (orig) => {
  const real = await orig<typeof import("@/server/services/anuncios")>();
  return {
    ...real,
    enviarAnuncio: mocks.enviarAnuncio,
    listarAnuncios: mocks.listarAnuncios,
    inspeccionarNotificaciones: mocks.inspeccionar,
  };
});

import { GET as LISTAR, POST as ENVIAR } from "../src/app/api/panel/anuncios/route";
import { GET as INSPECCIONAR } from "../src/app/api/panel/notificaciones/route";
import { AnuncioError } from "../src/server/services/anuncios";

const ADMIN = { userId: "admin-1", sessionId: "sess-a", role: "ADMIN", emailVerified: new Date() };
const USER = { userId: "user-1", sessionId: "sess-u", role: "USER", emailVerified: new Date() };
const CLAVE = "3b241101-e2bb-4255-8caf-4136c566a962";

function enviar(sesion: { sessionId: string }, cuerpo: unknown, csrf = true): Promise<Response> {
  const headers: Record<string, string> = { Origin: APP_URL, "Content-Type": "application/json" };
  if (csrf) headers["X-CSRF-Token"] = issueCsrfToken(SECRET, sesion.sessionId);
  return ENVIAR(
    new Request("http://test.local/api/panel/anuncios", {
      method: "POST",
      headers,
      body: JSON.stringify(cuerpo),
    }),
    {},
  );
}

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  mocks.enviarAnuncio.mockResolvedValue({ id: "an-1", targetCount: 1250, creado: true });
  mocks.listarAnuncios.mockResolvedValue({ items: [], nextCursor: null });
  mocks.inspeccionar.mockResolvedValue({ items: [], nextCursor: null });
});

describe("POST /api/panel/anuncios (enviar)", () => {
  it("ADMIN -> 200, y el anuncio va a nombre del admin DE LA SESIÓN", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    const res = await enviar(ADMIN, { texto: "  Hola a todos  ", clave: CLAVE, adminId: "otro" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "an-1", targetCount: 1250, creado: true });
    expect(mocks.enviarAnuncio).toHaveBeenCalledWith(expect.anything(), {
      adminId: "admin-1",
      texto: "Hola a todos",
      clave: CLAVE,
    });
  });

  it("USER -> 403 y NO envía; sin CSRF -> 403 y NO envía", async () => {
    mocks.getCurrentUser.mockResolvedValue(USER);
    expect((await enviar(USER, { texto: "Hola a todos", clave: CLAVE })).status).toBe(403);
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    expect((await enviar(ADMIN, { texto: "Hola a todos", clave: CLAVE }, false)).status).toBe(403);
    expect(mocks.enviarAnuncio).not.toHaveBeenCalled();
  });

  it("sin texto, demasiado largo o sin clave válida -> 400 y NO envía", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    for (const cuerpo of [
      { clave: CLAVE },
      { texto: "  ", clave: CLAVE },
      { texto: "x".repeat(501), clave: CLAVE },
      { texto: "Hola a todos", clave: "no-es-uuid" },
    ]) {
      expect((await enviar(ADMIN, cuerpo)).status, JSON.stringify(cuerpo)).toBe(400);
    }
    expect(mocks.enviarAnuncio).not.toHaveBeenCalled();
  });

  it("si el servicio lo rechaza por el texto -> 400", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    mocks.enviarAnuncio.mockRejectedValueOnce(new AnuncioError("TEXTO_INVALIDO", "no"));
    expect((await enviar(ADMIN, { texto: "Hola a todos", clave: CLAVE })).status).toBe(400);
  });
});

describe("GET /api/panel/anuncios (revisar)", () => {
  it("ADMIN -> 200 con la página siguiente por cursor; USER -> 403 y no lee", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    const ok = await LISTAR(new Request("http://test.local/api/panel/anuncios?cursor=c1"));
    expect(ok.status).toBe(200);
    expect(mocks.listarAnuncios).toHaveBeenCalledWith(expect.anything(), { cursor: "c1" });

    mocks.listarAnuncios.mockClear();
    mocks.getCurrentUser.mockResolvedValue(USER);
    expect((await LISTAR(new Request("http://test.local/api/panel/anuncios"))).status).toBe(403);
    expect(mocks.listarAnuncios).not.toHaveBeenCalled();
  });
});

describe("GET /api/panel/notificaciones (inspector)", () => {
  it("ADMIN -> 200, con los filtros validados (lo inventado se ignora) y el cursor", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    const res = await INSPECCIONAR(
      new Request(
        "http://test.local/api/panel/notificaciones?usuario=%40lucia&tipo=INVENTADO&desde=2026-03-01&hasta=2026-03-02&cursor=c1",
      ),
    );
    expect(res.status).toBe(200);
    expect(mocks.inspeccionar).toHaveBeenCalledWith(
      expect.anything(),
      {
        usuario: "lucia",
        tipo: null,
        desde: new Date("2026-03-01T00:00:00.000Z"),
        hasta: new Date("2026-03-03T00:00:00.000Z"),
      },
      { cursor: "c1" },
    );
  });

  it("USER -> 403 y no lee; sin sesión -> 403", async () => {
    mocks.getCurrentUser.mockResolvedValue(USER);
    expect(
      (await INSPECCIONAR(new Request("http://test.local/api/panel/notificaciones"))).status,
    ).toBe(403);
    mocks.getCurrentUser.mockResolvedValue(null);
    expect(
      (await INSPECCIONAR(new Request("http://test.local/api/panel/notificaciones"))).status,
    ).toBe(403);
    expect(mocks.inspeccionar).not.toHaveBeenCalled();
  });
});
