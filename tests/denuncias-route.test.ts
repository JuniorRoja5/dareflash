/**
 * POST /api/denuncias — la ruta. Con dientes:
 *  - el denunciante sale de la SESIÓN, nunca del cuerpo;
 *  - un `targetType` que el servidor no sabe resolver, o un motivo inventado, se rechazan por Zod y
 *    no llegan al servicio;
 *  - el correo SIN VERIFICAR no denuncia (misma barrera que votar o comentar), y no se consulta nada;
 *  - denunciar dos veces lo mismo responde 200 con copy amable: NO es un 409 ni un error;
 *  - sin CSRF no se escribe nada.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  MSG_DENUNCIA_GRACIAS,
  MSG_DENUNCIA_NO_DISPONIBLE,
  MSG_DENUNCIA_PROPIO,
  MSG_DENUNCIA_SIN_VERIFICAR,
  MSG_DENUNCIA_YA,
} from "../src/config/constants";
import { issueCsrfToken } from "../src/server/auth/csrf";

const SECRET = "TEST-FIXTURE-denuncias-secret-suficientemente-largo-de-verdad";
const APP_URL = "http://test.local";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  rateLimit: vi.fn(),
  denunciar: vi.fn(),
}));

vi.mock("@/config/env", () => ({ env: { APP_URL, AUTH_SECRET: SECRET } }));
vi.mock("@/server/auth/current-user", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/server/db/client", () => ({ prisma: {} }));
vi.mock("@/server/security/rate-limit", () => ({ rateLimit: mocks.rateLimit }));
vi.mock("@/server/services/denuncias", () => ({ denunciar: mocks.denunciar }));

import { POST } from "../src/app/api/denuncias/route";

const USER = {
  userId: "user-1",
  sessionId: "sess-u",
  role: "USER",
  emailVerified: new Date("2026-01-01T00:00:00Z"),
};
const CUERPO = { targetType: "VIDEO", targetId: "vid-1", reason: "SPAM" };

function denunciar(cuerpo: unknown, csrf = true): Promise<Response> {
  const headers: Record<string, string> = { Origin: APP_URL, "Content-Type": "application/json" };
  if (csrf) headers["X-CSRF-Token"] = issueCsrfToken(SECRET, USER.sessionId);
  return POST(
    new Request("http://test.local/api/denuncias", {
      method: "POST",
      headers,
      body: JSON.stringify(cuerpo),
    }),
    {},
  );
}

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  mocks.getCurrentUser.mockResolvedValue(USER);
  mocks.rateLimit.mockResolvedValue({ allowed: true });
  mocks.denunciar.mockResolvedValue({ estado: "registrada" });
});

describe("registrar", () => {
  it("201 con el copy del servidor; el denunciante es el de la SESIÓN", async () => {
    const res = await denunciar({ ...CUERPO, reporterId: "otra-persona" });

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ mensaje: MSG_DENUNCIA_GRACIAS });
    expect(mocks.denunciar).toHaveBeenCalledWith(expect.anything(), {
      reporterId: "user-1",
      targetType: "VIDEO",
      targetId: "vid-1",
      reason: "SPAM",
    });
  });

  it("un COMENTARIO también", async () => {
    const res = await denunciar({ targetType: "COMMENT", targetId: "c1", reason: "MENORES" });
    expect(res.status).toBe(201);
    expect(mocks.denunciar).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ targetType: "COMMENT", reason: "MENORES" }),
    );
  });
});

describe("lo que no entra", () => {
  it("un motivo fuera de la unión -> 400, y el servicio ni se llama", async () => {
    for (const reason of ["PORQUE_SI", "spam", "", 42, null]) {
      expect((await denunciar({ ...CUERPO, reason })).status, String(reason)).toBe(400);
    }
    expect(mocks.denunciar).not.toHaveBeenCalled();
  });

  it("un targetType que el servidor no sabe resolver -> 400 (aunque exista en la tabla)", async () => {
    // USER y SUBMISSION están en el tipo de la fila, pero nada los comprueba todavía: aceptarlos
    // sería abrir denuncias contra objetos que nadie valida.
    for (const targetType of ["USER", "SUBMISSION", "CUALQUIERA", ""]) {
      expect((await denunciar({ ...CUERPO, targetType })).status, targetType).toBe(400);
    }
    expect(mocks.denunciar).not.toHaveBeenCalled();
  });

  it("sin cuerpo válido -> 400; sin CSRF -> 403; con el tope agotado -> 429", async () => {
    expect((await denunciar({ nada: 1 })).status).toBe(400);
    expect((await denunciar(CUERPO, false)).status).toBe(403);
    mocks.rateLimit.mockResolvedValueOnce({ allowed: false });
    expect((await denunciar(CUERPO)).status).toBe(429);
    expect(mocks.denunciar).not.toHaveBeenCalled();
  });

  it("correo SIN VERIFICAR -> 403 con su motivo, y no se denuncia", async () => {
    mocks.getCurrentUser.mockResolvedValue({ ...USER, emailVerified: null });

    const res = await denunciar(CUERPO);

    expect(res.status).toBe(403);
    expect((await res.json()).error.message).toBe(MSG_DENUNCIA_SIN_VERIFICAR);
    expect(mocks.denunciar).not.toHaveBeenCalled();
    // Ni siquiera gasta cubo de rate limit: la barrera va antes.
    expect(mocks.rateLimit).not.toHaveBeenCalled();
  });
});

describe("lo que responde el servicio, en humano", () => {
  it("repetida -> 200 amable, NO un 409", async () => {
    mocks.denunciar.mockResolvedValueOnce({ estado: "repetida" });

    const res = await denunciar(CUERPO);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ mensaje: MSG_DENUNCIA_YA });
  });

  it("lo propio -> 400 con su copy; lo que ya no está -> 404 con el suyo", async () => {
    mocks.denunciar.mockResolvedValueOnce({ estado: "rechazada", motivo: "PROPIO" });
    const propio = await denunciar(CUERPO);
    expect(propio.status).toBe(400);
    expect((await propio.json()).error.message).toBe(MSG_DENUNCIA_PROPIO);

    mocks.denunciar.mockResolvedValueOnce({ estado: "rechazada", motivo: "NO_DISPONIBLE" });
    const ido = await denunciar(CUERPO);
    expect(ido.status).toBe(404);
    expect((await ido.json()).error.message).toBe(MSG_DENUNCIA_NO_DISPONIBLE);
  });

  it("ninguna respuesta lleva códigos crudos al usuario", async () => {
    for (const estado of [
      { estado: "registrada" },
      { estado: "repetida" },
      { estado: "rechazada", motivo: "PROPIO" },
    ]) {
      mocks.denunciar.mockResolvedValueOnce(estado);
      const cuerpo = await (await denunciar(CUERPO)).json();
      const texto = JSON.stringify(cuerpo);
      expect(texto).not.toMatch(/NO_DISPONIBLE|PROPIO|P2002|SPAM/);
    }
  });
});
