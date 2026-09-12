/**
 * Rutas del DareUp del panel: se protegen solas (requireRole ADMIN) y el ajuste además pasa por
 * `mutatingRoute` (Origin/sesión/CSRF). Con dientes: un USER recibe 403 y el servicio NO se llama;
 * QUIÉN ajusta sale de la SESIÓN, nunca del cuerpo; sin motivo no hay ajuste.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { issueCsrfToken } from "../src/server/auth/csrf";

const SECRET = "TEST-FIXTURE-dareup-secret-suficientemente-largo-de-verdad";
const APP_URL = "http://test.local";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  ajustarPuntos: vi.fn(),
  historialPuntos: vi.fn(),
}));

vi.mock("@/config/env", () => ({ env: { APP_URL, AUTH_SECRET: SECRET } }));
vi.mock("@/server/auth/current-user", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/server/db/client", () => ({ prisma: {} }));
vi.mock("@/server/services/dareup-admin", async (orig) => {
  const real = await orig<typeof import("@/server/services/dareup-admin")>();
  return { ...real, ajustarPuntos: mocks.ajustarPuntos, historialPuntos: mocks.historialPuntos };
});

import { POST as AJUSTAR } from "../src/app/api/panel/dareup/ajustar/route";
import { GET as HISTORIAL } from "../src/app/api/panel/dareup/historial/route";
import { AjusteError } from "../src/server/services/dareup-admin";

const ADMIN = { userId: "admin-1", sessionId: "sess-a", role: "ADMIN", emailVerified: new Date() };
const USER = { userId: "user-1", sessionId: "sess-u", role: "USER", emailVerified: new Date() };
const CLAVE = "3b241101-e2bb-4255-8caf-4136c566a962";
const VALIDO = { userId: "u-9", delta: 50, nota: "Premio del evento presencial", clave: CLAVE };

function ajustar(
  sesion: { sessionId: string },
  cuerpo: unknown,
  opciones: { csrf?: boolean } = {},
): Promise<Response> {
  const headers: Record<string, string> = { Origin: APP_URL, "Content-Type": "application/json" };
  if (opciones.csrf !== false) headers["X-CSRF-Token"] = issueCsrfToken(SECRET, sesion.sessionId);
  return AJUSTAR(
    new Request("http://test.local/api/panel/dareup/ajustar", {
      method: "POST",
      headers,
      body: JSON.stringify(cuerpo),
    }),
    {},
  );
}

const historial = (query: string) =>
  HISTORIAL(new Request(`http://test.local/api/panel/dareup/historial?${query}`));

beforeEach(() => {
  mocks.getCurrentUser.mockReset();
  mocks.ajustarPuntos.mockReset();
  mocks.historialPuntos.mockReset();
  mocks.ajustarPuntos.mockResolvedValue({ aplicado: true, saldo: 150 });
  mocks.historialPuntos.mockResolvedValue({ items: [], nextCursor: null });
});

describe("POST /api/panel/dareup/ajustar", () => {
  it("ADMIN -> 200, y el ajuste va firmado por el admin DE LA SESIÓN", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    const res = await ajustar(ADMIN, { ...VALIDO, adminId: "otro-admin" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ aplicado: true, saldo: 150 });
    // `adminId` del cuerpo se ignora: quien firma es la sesión.
    expect(mocks.ajustarPuntos).toHaveBeenCalledWith(expect.anything(), {
      adminId: "admin-1",
      userId: "u-9",
      delta: 50,
      nota: "Premio del evento presencial",
      clave: CLAVE,
    });
  });

  it("un reenvío ya aplicado responde 200 con aplicado:false (no es un error)", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    mocks.ajustarPuntos.mockResolvedValueOnce({ aplicado: false, saldo: 150 });
    const res = await ajustar(ADMIN, VALIDO);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ aplicado: false, saldo: 150 });
  });

  it("USER -> 403 y NO ajusta", async () => {
    mocks.getCurrentUser.mockResolvedValue(USER);
    const res = await ajustar(USER, VALIDO);
    expect(res.status).toBe(403);
    expect(mocks.ajustarPuntos).not.toHaveBeenCalled();
  });

  it("sin token CSRF -> 403 y NO ajusta", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    const res = await ajustar(ADMIN, VALIDO, { csrf: false });
    expect(res.status).toBe(403);
    expect(mocks.ajustarPuntos).not.toHaveBeenCalled();
  });

  it("sin motivo, con cantidad 0 o no entera, o sin clave válida -> 400 y NO ajusta", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    const malos = [
      { ...VALIDO, nota: undefined },
      { ...VALIDO, nota: "    " },
      { ...VALIDO, nota: "ok" },
      { ...VALIDO, delta: 0 },
      { ...VALIDO, delta: 1.5 },
      { ...VALIDO, delta: "50" },
      { ...VALIDO, clave: "no-es-uuid" },
    ];
    for (const cuerpo of malos) {
      const res = await ajustar(ADMIN, cuerpo);
      expect(res.status, JSON.stringify(cuerpo)).toBe(400);
    }
    expect(mocks.ajustarPuntos).not.toHaveBeenCalled();
  });

  it("saldo que quedaría negativo -> 409; usuario inexistente -> 404", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    mocks.ajustarPuntos.mockRejectedValueOnce(new AjusteError("SALDO_NEGATIVO", "negativo"));
    expect((await ajustar(ADMIN, VALIDO)).status).toBe(409);
    mocks.ajustarPuntos.mockRejectedValueOnce(new AjusteError("USUARIO_NO_EXISTE", "no existe"));
    expect((await ajustar(ADMIN, VALIDO)).status).toBe(404);
  });
});

describe("GET /api/panel/dareup/historial", () => {
  it("ADMIN -> 200 con la página del servicio, pasándole usuario y cursor", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    const res = await historial("userId=u-9&cursor=c1");
    expect(res.status).toBe(200);
    expect(mocks.historialPuntos).toHaveBeenCalledWith(expect.anything(), "u-9", { cursor: "c1" });
  });

  it("USER -> 403 y NO lee; sin sesión -> 403", async () => {
    mocks.getCurrentUser.mockResolvedValue(USER);
    expect((await historial("userId=u-9")).status).toBe(403);
    mocks.getCurrentUser.mockResolvedValue(null);
    expect((await historial("userId=u-9")).status).toBe(403);
    expect(mocks.historialPuntos).not.toHaveBeenCalled();
  });

  it("sin userId -> 400", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    expect((await historial("")).status).toBe(400);
  });
});
