/**
 * LAS RUTAS DE LA COLA. Aquí lo que se prueba son las GUARDAS y el copy, así que `requireRole` NO se
 * dobla: se mockea solo la SESIÓN y corre el RBAC real (jerarquía + correo verificado).
 *
 *  - Moderar contenido es `requireRole("MODERATOR")`, nunca `"ADMIN"`: si alguien lo sube, el caso
 *    del MODERADOR se pone rojo, que es el invariante de toda la fase.
 *  - El `targetType` se valida contra la unión de lo denunciable: no se modera "lo que diga el cliente".
 *  - Y ninguna respuesta enseña REMOVED / RESOLVED / DISMISSED.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  MSG_MODERACION_DESCARTADO,
  MSG_MODERACION_NO_ENCONTRADO,
  MSG_MODERACION_RETIRADO,
  MSG_MODERACION_SIN_CAMBIOS,
  MSG_SIN_PERMISO_COLA,
} from "../src/config/constants";
import { issueCsrfToken } from "../src/server/auth/csrf";

const SECRET = "TEST-FIXTURE-cola-secret-suficientemente-largo-de-verdad";
const APP_URL = "http://test.local";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  retirar: vi.fn(),
  descartar: vi.fn(),
  listar: vi.fn(),
}));

vi.mock("@/config/env", () => ({ env: { APP_URL, AUTH_SECRET: SECRET } }));
vi.mock("@/server/auth/current-user", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/server/db/client", () => ({ prisma: {} }));
vi.mock("@/server/services/moderar", () => ({
  retirarPorModeracion: mocks.retirar,
  descartarDenuncias: mocks.descartar,
}));
vi.mock("@/server/services/cola-moderacion", () => ({ listarColaModeracion: mocks.listar }));
vi.mock("@/server/services/reproduccion-servidor", () => ({
  firmarReproduccion: () => ({ src: "s", poster: "p" }),
}));

import { GET as LISTAR } from "../src/app/api/panel/moderacion/route";
import { POST as DESCARTAR } from "../src/app/api/panel/moderacion/descartar/route";
import { POST as RETIRAR } from "../src/app/api/panel/moderacion/retirar/route";

const SESION_ID = "sess-1";
const sesion = (role: string, emailVerified: Date | null = new Date()) => ({
  userId: `actor-${role}`,
  sessionId: SESION_ID,
  role,
  emailVerified,
});
const OBJETO = { targetType: "VIDEO", targetId: "vid-1" };

function peticion(url: string, cuerpo: unknown, csrf = true): Request {
  const headers: Record<string, string> = { Origin: APP_URL, "Content-Type": "application/json" };
  if (csrf) headers["X-CSRF-Token"] = issueCsrfToken(SECRET, SESION_ID);
  return new Request(url, { method: "POST", headers, body: JSON.stringify(cuerpo) });
}
const retirar = (cuerpo: unknown = OBJETO, csrf = true) =>
  RETIRAR(peticion("http://test.local/api/panel/moderacion/retirar", cuerpo, csrf), {});
const descartar = (cuerpo: unknown = OBJETO) =>
  DESCARTAR(peticion("http://test.local/api/panel/moderacion/descartar", cuerpo), {});
const listar = (query = "") =>
  LISTAR(new Request(`http://test.local/api/panel/moderacion${query}`));

const mensaje = async (res: Response): Promise<string> => {
  const cuerpo = await res.json();
  return cuerpo.error?.message ?? cuerpo.mensaje ?? "";
};

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  mocks.getCurrentUser.mockResolvedValue(sesion("MODERATOR"));
  mocks.retirar.mockResolvedValue({ estado: "hecho", denunciasCerradas: 2 });
  mocks.descartar.mockResolvedValue({ estado: "hecho", denunciasCerradas: 2 });
  mocks.listar.mockResolvedValue({ items: [], nextCursor: null });
});

describe("retirar", () => {
  it("un MODERADOR retira: el gate es MODERATOR, no ADMIN", async () => {
    const res = await retirar();

    expect(res.status).toBe(200);
    expect(await mensaje(res)).toBe(MSG_MODERACION_RETIRADO);
    expect(mocks.retirar).toHaveBeenCalledWith(expect.anything(), OBJETO);
  });

  it("y el ADMIN también, por jerarquía", async () => {
    mocks.getCurrentUser.mockResolvedValue(sesion("ADMIN"));
    expect((await retirar()).status).toBe(200);
  });

  it("un USER no modera: 403 en humano y sin tocar nada", async () => {
    mocks.getCurrentUser.mockResolvedValue(sesion("USER"));

    const res = await retirar();

    expect(res.status).toBe(403);
    expect(await mensaje(res)).toBe(MSG_SIN_PERMISO_COLA);
    expect(mocks.retirar).not.toHaveBeenCalled();
  });

  it("sin correo verificado tampoco (la barrera de siempre)", async () => {
    mocks.getCurrentUser.mockResolvedValue(sesion("MODERATOR", null));
    expect((await retirar()).status).toBe(403);
    expect(mocks.retirar).not.toHaveBeenCalled();
  });

  it("sin CSRF -> 403; tipo o id inválidos -> 400; y no se retira nada", async () => {
    expect((await retirar(OBJETO, false)).status).toBe(403);
    for (const cuerpo of [
      { targetType: "USER", targetId: "u1" },
      { targetType: "CUALQUIERA", targetId: "x" },
      { targetType: "VIDEO" },
      { targetId: "vid-1" },
      {},
    ]) {
      expect((await retirar(cuerpo)).status, JSON.stringify(cuerpo)).toBe(400);
    }
    expect(mocks.retirar).not.toHaveBeenCalled();
  });

  it("lo que ya no está -> 404; lo que no cambió -> 200 diciéndolo", async () => {
    mocks.retirar.mockResolvedValueOnce({ estado: "rechazado", motivo: "NO_ENCONTRADO" });
    const ido = await retirar();
    expect(ido.status).toBe(404);
    expect(await mensaje(ido)).toBe(MSG_MODERACION_NO_ENCONTRADO);

    mocks.retirar.mockResolvedValueOnce({ estado: "sin_cambios" });
    const igual = await retirar();
    expect(igual.status).toBe(200);
    expect(await mensaje(igual)).toBe(MSG_MODERACION_SIN_CAMBIOS);
  });
});

describe("descartar", () => {
  it("el moderador descarta, y lo dice en humano", async () => {
    const res = await descartar();
    expect(res.status).toBe(200);
    expect(await mensaje(res)).toBe(MSG_MODERACION_DESCARTADO);
    expect(mocks.descartar).toHaveBeenCalledWith(expect.anything(), OBJETO);
  });

  it("un USER no puede", async () => {
    mocks.getCurrentUser.mockResolvedValue(sesion("USER"));
    expect((await descartar()).status).toBe(403);
    expect(mocks.descartar).not.toHaveBeenCalled();
  });
});

describe("listar (la paginación de la cola)", () => {
  it("es del moderador: un USER no la lee", async () => {
    mocks.getCurrentUser.mockResolvedValue(sesion("USER"));
    expect((await listar()).status).toBe(403);
    expect(mocks.listar).not.toHaveBeenCalled();
  });

  it("pasa el cursor y el reto, y no se cachea", async () => {
    const res = await listar("?cursor=3.abc&reto=reto-1");

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.listar).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ cursor: "3.abc", challengeId: "reto-1" }),
    );
  });
});

describe("copy humano", () => {
  it("ninguna respuesta enseña el vocabulario de la base de datos", async () => {
    for (const r of [
      { estado: "hecho", denunciasCerradas: 1 },
      { estado: "sin_cambios" },
      { estado: "rechazado", motivo: "NO_ENCONTRADO" },
    ]) {
      mocks.retirar.mockResolvedValueOnce(r);
      const texto = JSON.stringify(await (await retirar()).json());
      expect(texto).not.toMatch(/REMOVED|RESOLVED|DISMISSED|OPEN|NO_ENCONTRADO|FORBIDDEN/);
    }
  });
});
