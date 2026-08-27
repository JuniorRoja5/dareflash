/**
 * GET /api/panel/retos/[id]/participaciones — devuelve datos que el público NO ve (participaciones
 * retiradas y sin publicar), así que se protege A SÍ MISMO con requireRole("ADMIN") y no se fía del
 * layout del panel (el layout protege la vista, no los endpoints).
 *
 * Con dientes: se mockea `getCurrentUser`, NO `requireRole`, así que el guard corre de verdad; un USER
 * y un MODERATOR reciben 403 y el servicio NO llega a llamarse (no basta con que la respuesta sea 403:
 * lo que importa es que no se consulten esos datos).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  listarParticipacionesAdmin: vi.fn(),
  firmarReproduccion: vi.fn(() => ({ src: "s", poster: "p" })),
}));

vi.mock("@/config/env", () => ({ env: { APP_URL: "http://test.local", AUTH_SECRET: "x" } }));
vi.mock("@/server/auth/current-user", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/server/db/client", () => ({ prisma: {} }));
vi.mock("@/server/services/participaciones-lista", () => ({
  listarParticipacionesAdmin: mocks.listarParticipacionesAdmin,
}));
vi.mock("@/server/services/reproduccion-servidor", () => ({
  firmarReproduccion: mocks.firmarReproduccion,
}));

import { GET } from "../src/app/api/panel/retos/[id]/participaciones/route";

const ADMIN = { userId: "a1", sessionId: "s1", role: "ADMIN", emailVerified: new Date() };
const USER = { userId: "u1", sessionId: "s2", role: "USER", emailVerified: new Date() };
const MOD = { userId: "m1", sessionId: "s3", role: "MODERATOR", emailVerified: new Date() };

const pedir = (id = "reto-1", query = "") =>
  GET(new Request(`http://test.local/api/panel/retos/${id}/participaciones${query}`), {
    params: Promise.resolve({ id }),
  });

beforeEach(() => {
  mocks.getCurrentUser.mockReset();
  mocks.listarParticipacionesAdmin.mockReset();
  mocks.listarParticipacionesAdmin.mockResolvedValue({ items: [], nextCursor: null });
});

describe("GET /api/panel/retos/[id]/participaciones", () => {
  it("ADMIN -> 200 y consulta las participaciones de ESE reto", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    const res = await pedir("reto-42");
    expect(res.status).toBe(200);
    expect(mocks.listarParticipacionesAdmin).toHaveBeenCalledWith(
      expect.anything(),
      "reto-42",
      expect.anything(),
    );
  });

  it("USER -> 403 y NO se consultan las participaciones ocultas", async () => {
    mocks.getCurrentUser.mockResolvedValue(USER);
    const res = await pedir();
    expect(res.status).toBe(403);
    expect(mocks.listarParticipacionesAdmin).not.toHaveBeenCalled();
  });

  it("MODERATOR -> 403 (el rol no basta; esta pantalla es de ADMIN)", async () => {
    mocks.getCurrentUser.mockResolvedValue(MOD);
    const res = await pedir();
    expect(res.status).toBe(403);
    expect(mocks.listarParticipacionesAdmin).not.toHaveBeenCalled();
  });

  it("sin sesión -> 403 y NO consulta nada", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const res = await pedir();
    expect(res.status).toBe(403);
    expect(mocks.listarParticipacionesAdmin).not.toHaveBeenCalled();
  });

  it("ADMIN sin email verificado -> 403 (requireRole parte de la verificación)", async () => {
    mocks.getCurrentUser.mockResolvedValue({ ...ADMIN, emailVerified: null });
    const res = await pedir();
    expect(res.status).toBe(403);
    expect(mocks.listarParticipacionesAdmin).not.toHaveBeenCalled();
  });

  it("propaga el cursor al servicio (la paginación no se queda en la primera página)", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    await pedir("reto-1", "?cursor=4.1700000000000.abc");
    expect(mocks.listarParticipacionesAdmin).toHaveBeenCalledWith(
      expect.anything(),
      "reto-1",
      expect.objectContaining({ cursor: "4.1700000000000.abc" }),
    );
  });

  it("no expone el bunnyVideoId (referencia interna) en la respuesta", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    mocks.listarParticipacionesAdmin.mockResolvedValue({
      items: [
        {
          submissionId: "sub-1",
          videoId: "vid-1",
          bunnyVideoId: "GUID-SECRETO",
          title: "T",
          votos: 1,
          username: "u",
          displayName: null,
          estado: "visible",
          creadaEn: new Date(0),
          reproducible: true,
        },
      ],
      nextCursor: null,
    });

    const res = await pedir();
    expect(await res.text()).not.toContain("GUID-SECRETO");
  });
});
