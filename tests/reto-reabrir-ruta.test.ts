/**
 * LA RUTA DE REABRIR: quién puede, qué se le dice y qué queda escrito.
 *
 * La REGLA (qué reto se puede reabrir) vive en `reabrirReto` y tiene su propio fichero con los
 * cuatro rechazos contra base de datos. Aquí se fija la otra mitad, que no se ve desde allí:
 *
 *  - SOLO ADMIN, con su propio `requireRole` y no confiando en el layout. Un USER no reabre nada.
 *  - CADA RECHAZO TIENE SU COPY Y SU CÓDIGO. Son cuatro situaciones que piden cuatro acciones
 *    distintas del admin —corrige las fechas, resuelve el empate, crea un reto nuevo— y un "no se
 *    pudo" genérico lo dejaría probando lo mismo otra vez.
 *  - SE AUDITA, y solo cuando de verdad se reabrió: una traza de algo que no ocurrió ensucia el
 *    registro que tiene que ser fiable.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { issueCsrfToken } from "../src/server/auth/csrf";

const SECRET = "TEST-FIXTURE-reabrir-secret-suficientemente-largo-para-hmac";
const APP_URL = "http://test.local";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  reabrirReto: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock("@/config/env", () => ({ env: { APP_URL, AUTH_SECRET: SECRET } }));
vi.mock("@/server/auth/current-user", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/server/db/client", () => ({
  prisma: { auditLog: { create: mocks.auditCreate } },
}));
vi.mock("@/server/services/retos-admin", async (orig) => {
  const real = await orig<typeof import("@/server/services/retos-admin")>();
  return { ...real, reabrirReto: mocks.reabrirReto };
});

import { POST as REABRIR } from "../src/app/api/panel/retos/[id]/reabrir/route";

const ADMIN = { userId: "admin-1", sessionId: "sess-a", role: "ADMIN", emailVerified: new Date() };
const USER = { userId: "user-1", sessionId: "sess-u", role: "USER", emailVerified: new Date() };

beforeEach(() => {
  mocks.getCurrentUser.mockReset();
  mocks.reabrirReto.mockReset();
  mocks.auditCreate.mockReset();
  mocks.reabrirReto.mockResolvedValue({ estado: "reabierto" });
  mocks.auditCreate.mockResolvedValue({});
});
afterEach(() => {
  vi.restoreAllMocks();
});

function pedir(sesion: { sessionId: string }, id = "r-1"): Promise<Response> {
  const csrf = issueCsrfToken(SECRET, sesion.sessionId);
  return REABRIR(
    new Request(`${APP_URL}/api/panel/retos/${id}/reabrir`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: APP_URL,
        "X-CSRF-Token": csrf,
      },
      body: JSON.stringify({}),
    }),
    { params: Promise.resolve({ id }) },
  );
}

describe("quién puede reabrir", () => {
  it("el ADMIN, y queda la traza con su nombre", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);

    const res = await pedir(ADMIN);

    expect(res.status).toBe(200);
    expect(mocks.reabrirReto).toHaveBeenCalledWith(expect.anything(), "r-1");
    expect(mocks.auditCreate).toHaveBeenCalledTimes(1);
    expect(mocks.auditCreate.mock.calls[0]?.[0]).toMatchObject({
      data: {
        actorId: ADMIN.userId,
        action: "CHALLENGE_REOPEN",
        targetType: "CHALLENGE",
        targetId: "r-1",
      },
    });
  });

  it("un USER no: 403, y el servicio NI SE LLAMA", async () => {
    mocks.getCurrentUser.mockResolvedValue(USER);

    const res = await pedir(USER);

    expect(res.status).toBe(403);
    expect(mocks.reabrirReto, "llegó al servicio con un USER").not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });
});

describe("cada rechazo dice QUÉ hacer", () => {
  it.each([
    ["NO_CERRADO", 404, /no está cerrado/i],
    ["CON_RESULTADOS", 409, /ganador/i],
    ["EMPATE_PENDIENTE", 409, /empate/i],
    ["CIERRE_PASADO", 409, /fechas/i],
  ])("%s -> %i con copy propio", async (motivo, http, patron) => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    mocks.reabrirReto.mockResolvedValue({ estado: "rechazado", motivo });

    const res = await pedir(ADMIN);

    expect(res.status).toBe(http);
    const cuerpo = (await res.json()) as { error?: { code?: string; message?: string } };
    expect(cuerpo.error?.code).toBe(motivo);
    expect(cuerpo.error?.message, `el copy de ${motivo} no dice qué hacer`).toMatch(patron);
  });

  it("los cuatro copys son DISTINTOS: si dos coinciden, uno de los dos no ayuda", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    const mensajes: string[] = [];
    for (const motivo of ["NO_CERRADO", "CON_RESULTADOS", "EMPATE_PENDIENTE", "CIERRE_PASADO"]) {
      mocks.reabrirReto.mockResolvedValue({ estado: "rechazado", motivo });
      const cuerpo = (await (await pedir(ADMIN)).json()) as { error?: { message?: string } };
      mensajes.push(cuerpo.error?.message ?? "");
    }
    expect(new Set(mensajes).size).toBe(4);
  });

  it("y un rechazo NO deja traza: no hubo nada que auditar", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    mocks.reabrirReto.mockResolvedValue({ estado: "rechazado", motivo: "CON_RESULTADOS" });

    await pedir(ADMIN);

    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });
});

describe("la protección de siempre", () => {
  it("sin CSRF no pasa (lo pone `mutatingRoute`, no esta ruta)", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);

    const res = await REABRIR(
      new Request(`${APP_URL}/api/panel/retos/r-1/reabrir`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: APP_URL },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: "r-1" }) },
    );

    expect(res.status).not.toBe(200);
    expect(mocks.reabrirReto).not.toHaveBeenCalled();
  });

  it("y con un Origin ajeno tampoco", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    const csrf = issueCsrfToken(SECRET, ADMIN.sessionId);

    const res = await REABRIR(
      new Request(`${APP_URL}/api/panel/retos/r-1/reabrir`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://malo.example",
          "X-CSRF-Token": csrf,
        },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: "r-1" }) },
    );

    expect(res.status).not.toBe(200);
    expect(mocks.reabrirReto).not.toHaveBeenCalled();
  });
});
