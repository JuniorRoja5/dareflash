/**
 * Endpoint EDITAR reto (multipart). Se protege a sí mismo con requireRole("ADMIN") + CSRF. Con DIENTES:
 *  - un USER recibe 403 y el servicio NO se llama;
 *  - sin token CSRF -> 403;
 *  - validación: categoría inválida y cierre<=apertura -> 400 (y NO edita);
 *  - id inexistente -> 404;
 *  - INVARIANTE publicCode: al editar se pasa a `editarRetoAdmin` el publicCode que ya existía (el que
 *    devuelve findUnique), nunca uno del cuerpo -> no puede cambiar;
 *  - portada nueva -> la sanea, sobrescribe {publicCode}.webp y actualiza coverImage.
 * `status` NO se toca aquí: el endpoint no lo envía (editar ≠ publicar), atado en retos-admin.test.ts (BD).
 */
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { issueCsrfToken } from "../src/server/auth/csrf";

const SECRET = "TEST-FIXTURE-panel-retos-editar-secret-suficientemente-largo";
const APP_URL = "http://test.local";
const PORTADAS_DIR = mkdtempSync(join(tmpdir(), "df-portadas-edit-"));

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  rateLimit: vi.fn(),
  editarRetoAdmin: vi.fn(),
  challengeFindUnique: vi.fn(),
  challengeUpdate: vi.fn(),
}));

vi.mock("@/config/env", () => ({ env: { APP_URL, AUTH_SECRET: SECRET, PORTADAS_DIR } }));
vi.mock("@/server/auth/current-user", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/server/db/client", () => ({
  prisma: { challenge: { findUnique: mocks.challengeFindUnique, update: mocks.challengeUpdate } },
}));
vi.mock("@/server/security/rate-limit", () => ({ rateLimit: mocks.rateLimit }));
vi.mock("@/server/services/retos-admin", async (orig) => {
  const real = await orig<typeof import("@/server/services/retos-admin")>();
  return { ...real, editarRetoAdmin: mocks.editarRetoAdmin };
});

import { POST as EDITAR } from "../src/app/api/panel/retos/[id]/editar/route";

const ADMIN = { userId: "admin-1", sessionId: "sess-a", role: "ADMIN", emailVerified: new Date() };
const USER = { userId: "user-1", sessionId: "sess-u", role: "USER", emailVerified: new Date() };

function campos(over: Record<string, string> = {}) {
  return {
    title: "Salto en caja editado",
    category: "fitness",
    prizeAmountCents: "3000",
    startsAt: "2999-01-01T00:00:00.000Z",
    deadline: "2999-02-01T00:00:00.000Z",
    winnersCount: "1",
    ...over,
  };
}

function reqEditar(
  id: string,
  data: Record<string, string>,
  session: { sessionId: string },
  opts: { csrf?: string | null; portada?: Buffer } = {},
): Request {
  const fd = new FormData();
  for (const [k, v] of Object.entries(data)) fd.set(k, v);
  if (opts.portada) {
    fd.set("portada", new File([new Uint8Array(opts.portada)], "p.png", { type: "image/png" }));
  }
  const headers: Record<string, string> = { Origin: APP_URL };
  if (opts.csrf !== null)
    headers["X-CSRF-Token"] = opts.csrf ?? issueCsrfToken(SECRET, session.sessionId);
  return new Request(`http://test.local/api/panel/retos/${id}/editar`, {
    method: "POST",
    headers,
    body: fd,
  });
}

const editar = (session: typeof ADMIN, id = "r1", data = campos(), opts = {}) =>
  EDITAR(reqEditar(id, data, session, opts), { params: Promise.resolve({ id }) });

beforeEach(() => {
  mocks.getCurrentUser.mockReset();
  mocks.rateLimit.mockReset();
  mocks.editarRetoAdmin.mockReset();
  mocks.challengeFindUnique.mockReset();
  mocks.challengeUpdate.mockReset();
  mocks.rateLimit.mockResolvedValue({ allowed: true });
  mocks.challengeFindUnique.mockResolvedValue({ publicCode: "abcd2345" });
  mocks.editarRetoAdmin.mockResolvedValue({
    id: "r1",
    publicCode: "abcd2345",
    slug: "salto-en-caja-editado",
    status: "PUBLISHED",
  });
});

afterAll(() => rmSync(PORTADAS_DIR, { recursive: true, force: true }));

describe("POST /api/panel/retos/[id]/editar", () => {
  it("ADMIN sin portada nueva -> 200; edita y NO toca coverImage; usa el publicCode existente", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    const res = await editar(ADMIN);
    expect(res.status).toBe(200);
    expect(mocks.editarRetoAdmin).toHaveBeenCalledTimes(1);
    // INVARIANTE: el publicCode que recibe editarRetoAdmin es el de la BD (findUnique), no uno del cuerpo.
    expect(mocks.editarRetoAdmin.mock.calls[0]![2]).toBe("abcd2345");
    expect(mocks.challengeUpdate).not.toHaveBeenCalled(); // sin portada nueva -> no se reescribe coverImage
  });

  it("ADMIN con portada nueva -> la sanea, sobrescribe {publicCode}.webp y actualiza coverImage", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    const png = await sharp({
      create: { width: 400, height: 200, channels: 3, background: { r: 10, g: 200, b: 90 } },
    })
      .png()
      .toBuffer();
    const res = await editar(ADMIN, "r1", campos(), { portada: png });
    expect(res.status).toBe(200);
    expect(readdirSync(PORTADAS_DIR)).toContain("abcd2345.webp");
    const arg = mocks.challengeUpdate.mock.calls[0]![0] as { data: { coverImage: string } };
    expect(arg.data.coverImage).toMatch(/^\/portadas\/abcd2345\.webp\?v=\d+$/);
  });

  it("id inexistente -> 404 y NO edita", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    mocks.challengeFindUnique.mockResolvedValueOnce(null);
    const res = await editar(ADMIN, "fantasma");
    expect(res.status).toBe(404);
    expect(mocks.editarRetoAdmin).not.toHaveBeenCalled();
  });

  it("USER -> 403 y NO edita (dientes del requireRole)", async () => {
    mocks.getCurrentUser.mockResolvedValue(USER);
    const res = await editar(USER);
    expect(res.status).toBe(403);
    expect(mocks.editarRetoAdmin).not.toHaveBeenCalled();
  });

  it("sin token CSRF -> 403 y NO edita", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    const res = await editar(ADMIN, "r1", campos(), { csrf: null });
    expect(res.status).toBe(403);
    expect(mocks.editarRetoAdmin).not.toHaveBeenCalled();
  });

  it("categoría inválida -> 400; cierre<=apertura -> 400; y NO edita", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    expect((await editar(ADMIN, "r1", campos({ category: "inexistente" }))).status).toBe(400);
    expect(
      (await editar(ADMIN, "r1", campos({ deadline: "2999-01-01T00:00:00.000Z" }))).status,
    ).toBe(400); // igual a apertura
    expect(mocks.editarRetoAdmin).not.toHaveBeenCalled();
  });
});
