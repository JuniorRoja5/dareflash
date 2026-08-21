/**
 * POST /api/panel/participaciones/[id]/retirar — se protege a sí mismo con requireRole("ADMIN") + CSRF.
 * Con dientes: un USER recibe 403 y el servicio NO se llama (no puede retirar la participación de otro);
 * el ADMIN retira; sin CSRF -> 403; id inexistente -> 404.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { issueCsrfToken } from "../src/server/auth/csrf";

const SECRET = "TEST-FIXTURE-retirar-secret-suficientemente-largo-de-verdad";
const APP_URL = "http://test.local";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  retirarParticipacion: vi.fn(),
}));

vi.mock("@/config/env", () => ({ env: { APP_URL, AUTH_SECRET: SECRET } }));
vi.mock("@/server/auth/current-user", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/server/db/client", () => ({ prisma: {} }));
vi.mock("@/server/services/participacion", async (orig) => {
  const real = await orig<typeof import("@/server/services/participacion")>();
  return { ...real, retirarParticipacion: mocks.retirarParticipacion };
});

import { POST as RETIRAR } from "../src/app/api/panel/participaciones/[id]/retirar/route";

const ADMIN = { userId: "admin-1", sessionId: "sess-a", role: "ADMIN", emailVerified: new Date() };
const USER = { userId: "user-1", sessionId: "sess-u", role: "USER", emailVerified: new Date() };

function req(
  id: string,
  session: { sessionId: string },
  opts: { csrf?: string | null } = {},
): Request {
  const headers: Record<string, string> = { Origin: APP_URL };
  if (opts.csrf !== null)
    headers["X-CSRF-Token"] = opts.csrf ?? issueCsrfToken(SECRET, session.sessionId);
  return new Request(`http://test.local/api/panel/participaciones/${id}/retirar`, {
    method: "POST",
    headers,
  });
}

const retirar = (session: typeof ADMIN, id = "sub-1", opts = {}) =>
  RETIRAR(req(id, session, opts), { params: Promise.resolve({ id }) });

beforeEach(() => {
  mocks.getCurrentUser.mockReset();
  mocks.retirarParticipacion.mockReset();
  mocks.retirarParticipacion.mockResolvedValue({ retirada: true });
});

describe("POST /api/panel/participaciones/[id]/retirar", () => {
  it("ADMIN -> 200 y retira la submission de la URL", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    const res = await retirar(ADMIN, "sub-42");
    expect(res.status).toBe(200);
    expect(mocks.retirarParticipacion).toHaveBeenCalledWith(expect.anything(), "sub-42");
  });

  it("USER -> 403 y NO retira (un usuario no puede retirar la de otro)", async () => {
    mocks.getCurrentUser.mockResolvedValue(USER);
    const res = await retirar(USER);
    expect(res.status).toBe(403);
    expect(mocks.retirarParticipacion).not.toHaveBeenCalled();
  });

  it("sin token CSRF -> 403 y NO retira", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    const res = await retirar(ADMIN, "sub-1", { csrf: null });
    expect(res.status).toBe(403);
    expect(mocks.retirarParticipacion).not.toHaveBeenCalled();
  });

  it("participación inexistente -> 404", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    mocks.retirarParticipacion.mockResolvedValueOnce({ retirada: false });
    const res = await retirar(ADMIN, "fantasma");
    expect(res.status).toBe(404);
  });
});
