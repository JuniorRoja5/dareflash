/**
 * Endpoints del panel: crear y publicar reto (M5). Cada uno se protege A SÍ MISMO con
 * requireRole("ADMIN"). Con DIENTES: un USER recibe 403 y el servicio NO se llama (si se quitara el
 * requireRole, el USER crearía/publicaría -> este test caería). CSRF forjado con la función real.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { issueCsrfToken } from "../src/server/auth/csrf";

const SECRET = "TEST-FIXTURE-panel-retos-secret-suficientemente-largo";
const APP_URL = "http://test.local";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  crearRetoAdmin: vi.fn(),
  publicarReto: vi.fn(),
}));

vi.mock("@/config/env", () => ({ env: { APP_URL, AUTH_SECRET: SECRET } }));
vi.mock("@/server/auth/current-user", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/server/db/client", () => ({ prisma: {} }));
vi.mock("@/server/services/retos-admin", async (orig) => {
  const real = await orig<typeof import("@/server/services/retos-admin")>();
  return { ...real, crearRetoAdmin: mocks.crearRetoAdmin, publicarReto: mocks.publicarReto };
});

import { POST as CREAR } from "../src/app/api/panel/retos/route";
import { POST as PUBLICAR } from "../src/app/api/panel/retos/[id]/publicar/route";

const ADMIN = { userId: "admin-1", sessionId: "sess-a", role: "ADMIN", emailVerified: new Date() };
const USER = { userId: "user-1", sessionId: "sess-u", role: "USER", emailVerified: new Date() };

function bodyValido(over: Record<string, unknown> = {}) {
  return {
    title: "Salto en caja",
    category: "fitness",
    prizeAmountCents: 2000,
    startsAt: "2999-01-01T00:00:00.000Z",
    deadline: "2999-02-01T00:00:00.000Z",
    winnersCount: 1,
    maxVotesPerUser: 1,
    ...over,
  };
}

function req(
  url: string,
  session: { sessionId: string },
  body: unknown,
  opts: { origin?: string; csrf?: string | null } = {},
): Request {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Origin: opts.origin ?? APP_URL,
  };
  if (opts.csrf !== null)
    headers["X-CSRF-Token"] = opts.csrf ?? issueCsrfToken(SECRET, session.sessionId);
  return new Request(url, { method: "POST", headers, body: JSON.stringify(body ?? {}) });
}

const crear = (session: typeof ADMIN, body: unknown, opts = {}) =>
  CREAR(req("http://test.local/api/panel/retos", session, body, opts), {});
const publicar = (session: typeof ADMIN, id: string, opts = {}) =>
  PUBLICAR(req(`http://test.local/api/panel/retos/${id}/publicar`, session, {}, opts), {
    params: Promise.resolve({ id }),
  });

beforeEach(() => {
  mocks.getCurrentUser.mockReset();
  mocks.crearRetoAdmin.mockReset();
  mocks.publicarReto.mockReset();
  mocks.crearRetoAdmin.mockResolvedValue({
    id: "r1",
    publicCode: "abcd2345",
    slug: "x",
    status: "DRAFT",
  });
  mocks.publicarReto.mockResolvedValue({ publicado: true });
});

describe("POST /api/panel/retos (crear)", () => {
  it("ADMIN -> 200 y crea con createdById = admin de la SESIÓN", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    const res = await crear(ADMIN, bodyValido());
    expect(res.status).toBe(200);
    expect(mocks.crearRetoAdmin).toHaveBeenCalledTimes(1);
    expect(mocks.crearRetoAdmin.mock.calls[0]![1]).toBe("admin-1");
  });

  it("USER -> 403 y NO crea (dientes del requireRole)", async () => {
    mocks.getCurrentUser.mockResolvedValue(USER);
    const res = await crear(USER, bodyValido());
    expect(res.status).toBe(403);
    expect(mocks.crearRetoAdmin).not.toHaveBeenCalled();
  });

  it("categoría inválida -> 400 y NO crea", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    const res = await crear(ADMIN, bodyValido({ category: "inexistente" }));
    expect(res.status).toBe(400);
    expect(mocks.crearRetoAdmin).not.toHaveBeenCalled();
  });

  it("sin token CSRF -> 403 (mutatingRoute) y NO crea", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    const res = await crear(ADMIN, bodyValido(), { csrf: null });
    expect(res.status).toBe(403);
    expect(mocks.crearRetoAdmin).not.toHaveBeenCalled();
  });
});

describe("POST /api/panel/retos/[id]/publicar", () => {
  it("ADMIN -> 200 y publica el id de la URL", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    const res = await publicar(ADMIN, "r-42");
    expect(res.status).toBe(200);
    expect(mocks.publicarReto).toHaveBeenCalledWith(expect.anything(), "r-42");
  });

  it("USER -> 403 y NO publica (dientes del requireRole)", async () => {
    mocks.getCurrentUser.mockResolvedValue(USER);
    const res = await publicar(USER, "r-42");
    expect(res.status).toBe(403);
    expect(mocks.publicarReto).not.toHaveBeenCalled();
  });
});
