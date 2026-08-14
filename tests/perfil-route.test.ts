/**
 * PATCH /api/perfil — AUTORIZACIÓN con dientes. Se prueba con dobles de sesión/BD/env (como la ruta de
 * reproducción). Lo que garantiza:
 *   - ANÓNIMO -> 401 (sin sesión no se edita nada).
 *   - CSRF ausente/ajeno -> 403 (double-submit atado a la sesión).
 *   - Nombre inválido (Zod) -> 400, sin tocar la BD.
 *   - Éxito: el servicio se llama con el userId de la SESIÓN, JAMÁS con un id del cuerpo. Aunque el
 *     cliente mande `{ id: "victima" }`, se edita la fila de la sesión -> nadie edita a otro.
 * El token CSRF se FORJA con la misma función real del servidor (issueCsrfToken) y el mismo secreto:
 * el test ejercita el CSRF de verdad, no un mock que siempre dice sí.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { issueCsrfToken } from "../src/server/auth/csrf";

const SECRET = "TEST-FIXTURE-auth-secret-suficientemente-largo-1";
const APP_URL = "http://test.local";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  rateLimit: vi.fn(),
  actualizarNombre: vi.fn(),
}));

vi.mock("@/config/env", () => ({ env: { APP_URL, AUTH_SECRET: SECRET } }));
vi.mock("@/server/auth/current-user", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/server/db/client", () => ({ prisma: {} }));
vi.mock("@/server/security/rate-limit", () => ({ rateLimit: mocks.rateLimit }));
vi.mock("@/server/services/perfil", async (orig) => {
  const real = await orig<typeof import("@/server/services/perfil")>();
  return { ...real, actualizarNombre: mocks.actualizarNombre };
});

// Import DESPUÉS de los mocks (los vi.mock se izan, pero mantenemos el orden explícito claro).
import { PATCH } from "../src/app/api/perfil/route";

const SESSION = { userId: "u-real", sessionId: "sess-1", role: "USER", emailVerified: null };

function req(body: unknown, opts: { origin?: string; csrf?: string | null } = {}): Request {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Origin: opts.origin ?? APP_URL,
  };
  if (opts.csrf !== null) {
    headers["X-CSRF-Token"] = opts.csrf ?? issueCsrfToken(SECRET, SESSION.sessionId);
  }
  return new Request("http://test.local/api/perfil", {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
  });
}

/** La ruta no es dinámica (sin params); `mutatingRoute` exige el 2º arg de contexto de Next igualmente. */
function patch(body: unknown, opts?: { origin?: string; csrf?: string | null }): Promise<Response> {
  return PATCH(req(body, opts), {});
}

describe("PATCH /api/perfil (autorización)", () => {
  beforeEach(() => {
    mocks.getCurrentUser.mockReset();
    mocks.rateLimit.mockReset();
    mocks.actualizarNombre.mockReset();
    mocks.rateLimit.mockResolvedValue({ allowed: true, remaining: 10, resetAt: new Date() });
    mocks.actualizarNombre.mockResolvedValue({ displayName: "Ana Gómez" });
  });

  it("anónimo -> 401 y NO toca la BD", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const res = await patch({ displayName: "Ana" });
    expect(res.status).toBe(401);
    expect(mocks.actualizarNombre).not.toHaveBeenCalled();
  });

  it("con sesión pero SIN token CSRF -> 403", async () => {
    mocks.getCurrentUser.mockResolvedValue(SESSION);
    const res = await patch({ displayName: "Ana" }, { csrf: null });
    expect(res.status).toBe(403);
    expect(mocks.actualizarNombre).not.toHaveBeenCalled();
  });

  it("con token CSRF de OTRA sesión -> 403 (el token está atado a la sesión)", async () => {
    mocks.getCurrentUser.mockResolvedValue(SESSION);
    const res = await patch({ displayName: "Ana" }, { csrf: issueCsrfToken(SECRET, "otra") });
    expect(res.status).toBe(403);
    expect(mocks.actualizarNombre).not.toHaveBeenCalled();
  });

  it("Origin ajeno -> 403 (corta el CSRF antes de mirar el token)", async () => {
    mocks.getCurrentUser.mockResolvedValue(SESSION);
    const res = await patch({ displayName: "Ana" }, { origin: "http://malicioso.example" });
    expect(res.status).toBe(403);
  });

  it("nombre inválido (Zod) -> 400 y NO toca la BD", async () => {
    mocks.getCurrentUser.mockResolvedValue(SESSION);
    const res = await patch({ displayName: "<script>alert(1)</script>" });
    expect(res.status).toBe(400);
    expect(mocks.actualizarNombre).not.toHaveBeenCalled();
  });

  it("éxito: edita SIEMPRE la fila de la SESIÓN, aunque el cuerpo traiga otro id", async () => {
    mocks.getCurrentUser.mockResolvedValue(SESSION);
    // El atacante intenta colar el id de una víctima en el cuerpo.
    const res = await patch({
      displayName: "  Ana   Gómez ",
      id: "u-victima",
      userId: "u-victima",
    });
    expect(res.status).toBe(200);
    // El servicio recibe el userId de la SESIÓN, no el del cuerpo. (db, userId, displayName)
    expect(mocks.actualizarNombre).toHaveBeenCalledTimes(1);
    const [, userIdUsado, nombre] = mocks.actualizarNombre.mock.calls[0]!;
    expect(userIdUsado).toBe("u-real");
    expect(userIdUsado).not.toBe("u-victima");
    // Zod normaliza antes de guardar.
    expect(nombre).toBe("Ana Gómez");
  });

  it("rate-limit agotado -> 429", async () => {
    mocks.getCurrentUser.mockResolvedValue(SESSION);
    mocks.rateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: new Date() });
    const res = await patch({ displayName: "Ana" });
    expect(res.status).toBe(429);
    expect(mocks.actualizarNombre).not.toHaveBeenCalled();
  });
});
