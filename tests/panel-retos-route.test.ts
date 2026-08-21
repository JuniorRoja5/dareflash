/**
 * Endpoints del panel: crear (multipart, con portada opcional) y publicar reto. Cada uno se protege a
 * sí mismo con requireRole("ADMIN"). Con DIENTES: un USER recibe 403 y el servicio NO se llama; crear
 * SIN imagen funciona (coverImage no se toca); crear CON imagen la sanea, la escribe en el volumen y
 * apunta coverImage. CSRF forjado con la función real.
 */
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { issueCsrfToken } from "../src/server/auth/csrf";

const SECRET = "TEST-FIXTURE-panel-retos-secret-suficientemente-largo";
const APP_URL = "http://test.local";
const PORTADAS_DIR = mkdtempSync(join(tmpdir(), "df-portadas-"));

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  rateLimit: vi.fn(),
  crearRetoAdmin: vi.fn(),
  publicarReto: vi.fn(),
  challengeUpdate: vi.fn(),
}));

vi.mock("@/config/env", () => ({ env: { APP_URL, AUTH_SECRET: SECRET, PORTADAS_DIR } }));
vi.mock("@/server/auth/current-user", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/server/db/client", () => ({
  prisma: { challenge: { update: mocks.challengeUpdate } },
}));
vi.mock("@/server/security/rate-limit", () => ({ rateLimit: mocks.rateLimit }));
vi.mock("@/server/services/retos-admin", async (orig) => {
  const real = await orig<typeof import("@/server/services/retos-admin")>();
  return { ...real, crearRetoAdmin: mocks.crearRetoAdmin, publicarReto: mocks.publicarReto };
});

import { POST as CREAR } from "../src/app/api/panel/retos/route";
import { POST as PUBLICAR } from "../src/app/api/panel/retos/[id]/publicar/route";

const ADMIN = { userId: "admin-1", sessionId: "sess-a", role: "ADMIN", emailVerified: new Date() };
const USER = { userId: "user-1", sessionId: "sess-u", role: "USER", emailVerified: new Date() };

function campos(over: Record<string, string> = {}) {
  return {
    title: "Salto en caja",
    category: "fitness",
    prizeAmountCents: "2000",
    startsAt: "2999-01-01T00:00:00.000Z",
    deadline: "2999-02-01T00:00:00.000Z",
    winnersCount: "1",
    maxVotesPerUser: "1",
    ...over,
  };
}

function reqCrear(
  data: Record<string, string>,
  session: { sessionId: string },
  opts: { origin?: string; csrf?: string | null; portada?: Buffer } = {},
): Request {
  const fd = new FormData();
  for (const [k, v] of Object.entries(data)) fd.set(k, v);
  if (opts.portada) {
    fd.set("portada", new File([new Uint8Array(opts.portada)], "p.png", { type: "image/png" }));
  }
  const headers: Record<string, string> = { Origin: opts.origin ?? APP_URL };
  if (opts.csrf !== null)
    headers["X-CSRF-Token"] = opts.csrf ?? issueCsrfToken(SECRET, session.sessionId);
  return new Request("http://test.local/api/panel/retos", { method: "POST", headers, body: fd });
}

const crear = (session: typeof ADMIN, data = campos(), opts = {}) =>
  CREAR(reqCrear(data, session, opts), {});
const publicar = (session: typeof ADMIN, id: string) =>
  PUBLICAR(
    new Request(`http://test.local/api/panel/retos/${id}/publicar`, {
      method: "POST",
      headers: { Origin: APP_URL, "X-CSRF-Token": issueCsrfToken(SECRET, session.sessionId) },
    }),
    { params: Promise.resolve({ id }) },
  );

beforeEach(() => {
  mocks.getCurrentUser.mockReset();
  mocks.rateLimit.mockReset();
  mocks.crearRetoAdmin.mockReset();
  mocks.publicarReto.mockReset();
  mocks.challengeUpdate.mockReset();
  mocks.rateLimit.mockResolvedValue({ allowed: true });
  mocks.crearRetoAdmin.mockResolvedValue({
    id: "r1",
    publicCode: "abcd2345",
    slug: "x",
    status: "DRAFT",
  });
  mocks.publicarReto.mockResolvedValue({ publicado: true });
});

afterAll(() => rmSync(PORTADAS_DIR, { recursive: true, force: true }));

describe("POST /api/panel/retos (crear, multipart)", () => {
  it("ADMIN sin portada -> 200; crea con createdById = admin; NO toca coverImage", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    const res = await crear(ADMIN);
    expect(res.status).toBe(200);
    expect(mocks.crearRetoAdmin).toHaveBeenCalledTimes(1);
    expect(mocks.crearRetoAdmin.mock.calls[0]![1]).toBe("admin-1");
    expect(mocks.challengeUpdate).not.toHaveBeenCalled(); // sin portada -> coverImage queda null
  });

  it("ADMIN con portada -> la sanea, la escribe como {publicCode}.webp y apunta coverImage", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    const png = await sharp({
      create: { width: 400, height: 200, channels: 3, background: { r: 10, g: 200, b: 90 } },
    })
      .png()
      .toBuffer();
    const res = await crear(ADMIN, campos(), { portada: png });
    expect(res.status).toBe(200);
    // WebP escrito en el volumen con el nombre del publicCode.
    expect(readdirSync(PORTADAS_DIR)).toContain("abcd2345.webp");
    // coverImage apuntando a la URL publica (con ?v=).
    const arg = mocks.challengeUpdate.mock.calls[0]![0] as { data: { coverImage: string } };
    expect(arg.data.coverImage).toMatch(/^\/portadas\/abcd2345\.webp\?v=\d+$/);
  });

  it("DIENTES: si la portada NO se puede guardar, el reto se crea igual pero AVISA (no ok a secas)", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    // Simula el fallo de persistencia (p.ej. EACCES por permisos del volumen): el update peta.
    mocks.challengeUpdate.mockRejectedValueOnce(
      Object.assign(new Error("EACCES"), { code: "EACCES", errno: -13, syscall: "open" }),
    );
    const png = await sharp({
      create: { width: 400, height: 200, channels: 3, background: { r: 10, g: 200, b: 90 } },
    })
      .png()
      .toBuffer();
    const res = await crear(ADMIN, campos(), { portada: png });
    // El reto SÍ se creó -> 200; pero el fallo de portada es VISIBLE, no silencioso.
    expect(res.status).toBe(200);
    expect(mocks.crearRetoAdmin).toHaveBeenCalledTimes(1);
    const body = (await res.json()) as { portadaGuardada?: boolean; aviso?: string };
    expect(body.portadaGuardada).toBe(false);
    expect(body.aviso).toMatch(/portada/i);
  });

  it("USER -> 403 y NO crea (dientes del requireRole)", async () => {
    mocks.getCurrentUser.mockResolvedValue(USER);
    const res = await crear(USER);
    expect(res.status).toBe(403);
    expect(mocks.crearRetoAdmin).not.toHaveBeenCalled();
  });

  it("categoría inválida -> 400 y NO crea", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    const res = await crear(ADMIN, campos({ category: "inexistente" }));
    expect(res.status).toBe(400);
    expect(mocks.crearRetoAdmin).not.toHaveBeenCalled();
  });

  it("sin token CSRF -> 403 y NO crea", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    const res = await crear(ADMIN, campos(), { csrf: null });
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
