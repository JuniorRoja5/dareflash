/**
 * LAS RUTAS DE GOBIERNO DE CUENTAS. Aquí lo que se prueba de verdad son las GUARDAS, así que
 * `requireRole` NO se dobla: se mockea solo la SESIÓN (`getCurrentUser`) y corre el RBAC real, con su
 * jerarquía (USER < MODERATOR < ADMIN) y su exigencia de correo verificado. Por eso:
 *
 *  - si alguien cambia el guard de suspender a `requireRole("ADMIN")`, el caso del MODERADOR se pone
 *    rojo (que es justo el invariante de esta fase: moderar no es ser administrador);
 *  - si alguien baja el de rol a `requireRole("MODERATOR")`, el caso del moderador nombrando se pone
 *    rojo (nombrar rol no es moderar).
 *
 * Y que `ADMIN` no sea expresable por la API se comprueba contra Zod, no contra el servicio.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  MSG_CUENTA_NO_ENCONTRADA,
  MSG_ROL_INVALIDO,
  MSG_SIN_PERMISO_MODERAR,
  MSG_SIN_PERMISO_ROLES,
  MSG_SUSPENDER_NO_PERMITIDO,
} from "../src/config/constants";
import { issueCsrfToken } from "../src/server/auth/csrf";

const SECRET = "TEST-FIXTURE-cuentas-secret-suficientemente-largo-de-verdad";
const APP_URL = "http://test.local";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  asignarRol: vi.fn(),
  suspenderCuenta: vi.fn(),
  levantarSuspension: vi.fn(),
}));

vi.mock("@/config/env", () => ({ env: { APP_URL, AUTH_SECRET: SECRET } }));
vi.mock("@/server/auth/current-user", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/server/db/client", () => ({ prisma: {} }));
vi.mock("@/server/services/gobierno-cuentas", () => ({
  asignarRol: mocks.asignarRol,
  suspenderCuenta: mocks.suspenderCuenta,
  levantarSuspension: mocks.levantarSuspension,
}));

import { POST as LEVANTAR } from "../src/app/api/panel/cuentas/[id]/levantar/route";
import { POST as ROL } from "../src/app/api/panel/cuentas/[id]/rol/route";
import { POST as SUSPENDER } from "../src/app/api/panel/cuentas/[id]/suspender/route";

const SESION_ID = "sess-1";
const sesion = (role: string, emailVerified: Date | null = new Date()) => ({
  userId: `actor-${role}`,
  sessionId: SESION_ID,
  role,
  emailVerified,
});

function peticion(url: string, cuerpo?: unknown, csrf = true): Request {
  const headers: Record<string, string> = { Origin: APP_URL, "Content-Type": "application/json" };
  if (csrf) headers["X-CSRF-Token"] = issueCsrfToken(SECRET, SESION_ID);
  return new Request(url, {
    method: "POST",
    headers,
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
  });
}
const ctx = (id = "user-9") => ({ params: Promise.resolve({ id }) });

const rol = (cuerpo: unknown, id = "user-9", csrf = true) =>
  ROL(peticion(`http://test.local/api/panel/cuentas/${id}/rol`, cuerpo, csrf), ctx(id));
const suspender = (id = "user-9", csrf = true) =>
  SUSPENDER(
    peticion(`http://test.local/api/panel/cuentas/${id}/suspender`, undefined, csrf),
    ctx(id),
  );
const levantar = (id = "user-9") =>
  LEVANTAR(peticion(`http://test.local/api/panel/cuentas/${id}/levantar`), ctx(id));

const mensaje = async (res: Response): Promise<string> => (await res.json()).error?.message ?? "";

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  mocks.getCurrentUser.mockResolvedValue(sesion("ADMIN"));
  mocks.asignarRol.mockResolvedValue({ estado: "hecho" });
  mocks.suspenderCuenta.mockResolvedValue({ estado: "hecho" });
  mocks.levantarSuspension.mockResolvedValue({ estado: "hecho" });
});

describe("POST .../rol — solo el superadmin nombra", () => {
  it("el ADMIN asigna: el actor sale de la SESIÓN, no del cuerpo", async () => {
    const res = await rol({ rol: "MODERATOR", actorId: "otro", rolActor: "ADMIN" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, cambiado: true });
    expect(mocks.asignarRol).toHaveBeenCalledWith(expect.anything(), {
      actorId: "actor-ADMIN",
      rolActor: "ADMIN",
      userId: "user-9",
      rolPedido: "MODERATOR",
    });
  });

  it("un MODERADOR no nombra: 403 en humano y el servicio ni se llama", async () => {
    mocks.getCurrentUser.mockResolvedValue(sesion("MODERATOR"));

    const res = await rol({ rol: "MODERATOR" });

    expect(res.status).toBe(403);
    expect(await mensaje(res)).toBe(MSG_SIN_PERMISO_ROLES);
    expect(mocks.asignarRol).not.toHaveBeenCalled();
  });

  it("pedir ADMIN -> 400 por Zod: no es expresable por la API", async () => {
    for (const valor of ["ADMIN", "admin", "SUPERADMIN", "", 1, null]) {
      const res = await rol({ rol: valor });
      expect(res.status, String(valor)).toBe(400);
      expect(await mensaje(res)).toBe(MSG_ROL_INVALIDO);
    }
    expect(mocks.asignarRol).not.toHaveBeenCalled();
  });

  it("sin CSRF -> 403; sin correo verificado -> 403; y no se asigna nada", async () => {
    expect((await rol({ rol: "USER" }, "user-9", false)).status).toBe(403);
    mocks.getCurrentUser.mockResolvedValue(sesion("ADMIN", null));
    expect((await rol({ rol: "USER" })).status).toBe(403);
    expect(mocks.asignarRol).not.toHaveBeenCalled();
  });

  it("idempotente: 'ya lo tenía' responde ok, no error", async () => {
    mocks.asignarRol.mockResolvedValueOnce({ estado: "sin_cambios" });
    const res = await rol({ rol: "USER" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, cambiado: false });
  });

  it("cuenta inexistente -> 404; regla que dice no -> 403; los dos en humano", async () => {
    mocks.asignarRol.mockResolvedValueOnce({ estado: "rechazado", motivo: "NO_ENCONTRADA" });
    const noExiste = await rol({ rol: "USER" });
    expect(noExiste.status).toBe(404);
    expect(await mensaje(noExiste)).toBe(MSG_CUENTA_NO_ENCONTRADA);

    mocks.asignarRol.mockResolvedValueOnce({ estado: "rechazado", motivo: "NO_PERMITIDO" });
    const noPuede = await rol({ rol: "USER" });
    expect(noPuede.status).toBe(403);
    expect(await mensaje(noPuede)).not.toMatch(/FORBIDDEN|NO_PERMITIDO/);
  });
});

describe("POST .../suspender y .../levantar — moderar, no administrar", () => {
  it("un MODERADOR suspende (el gate es MODERATOR, no ADMIN)", async () => {
    mocks.getCurrentUser.mockResolvedValue(sesion("MODERATOR"));

    const res = await suspender();

    expect(res.status).toBe(200);
    expect(mocks.suspenderCuenta).toHaveBeenCalledWith(expect.anything(), {
      actorId: "actor-MODERATOR",
      rolActor: "MODERATOR",
      userId: "user-9",
    });
  });

  it("y el ADMIN también, por jerarquía", async () => {
    expect((await suspender()).status).toBe(200);
    expect((await levantar()).status).toBe(200);
  });

  it("un USER no modera: 403 y sin tocar nada", async () => {
    mocks.getCurrentUser.mockResolvedValue(sesion("USER"));

    const res = await suspender();

    expect(res.status).toBe(403);
    expect(await mensaje(res)).toBe(MSG_SIN_PERMISO_MODERAR);
    expect(mocks.suspenderCuenta).not.toHaveBeenCalled();
  });

  it("destino privilegiado -> 403 con copy humano (lo decide el servicio)", async () => {
    mocks.suspenderCuenta.mockResolvedValueOnce({ estado: "rechazado", motivo: "NO_PERMITIDO" });
    const res = await suspender();
    expect(res.status).toBe(403);
    expect(await mensaje(res)).toBe(MSG_SUSPENDER_NO_PERMITIDO);
  });

  it("levantar es idempotente y también en humano", async () => {
    mocks.levantarSuspension.mockResolvedValueOnce({ estado: "sin_cambios" });
    const res = await levantar();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, cambiado: false });
  });

  it("ninguna respuesta enseña códigos al usuario", async () => {
    for (const r of [
      { estado: "rechazado", motivo: "NO_ENCONTRADA" },
      { estado: "rechazado", motivo: "NO_PERMITIDO" },
    ]) {
      mocks.suspenderCuenta.mockResolvedValueOnce(r);
      const texto = await mensaje(await suspender());
      expect(texto).not.toMatch(/FORBIDDEN|NOT_FOUND|NO_PERMITIDO|NO_ENCONTRADA|BAN/);
    }
  });
});
