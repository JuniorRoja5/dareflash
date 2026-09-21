/**
 * Guards del PANEL — cableado, en dos niveles:
 *
 *  - EL SHELL (`protegerPanel`, en el layout) deja entrar a MODERATOR o superior. Ya no es la barrera
 *    que decide quién ve qué: solo quién entra al edificio.
 *  - CADA PÁGINA (`requireSeccion`) exige el rol de SU sección, leído de `secciones.ts`. Es lo que
 *    impide que abrir el shell regale al moderador las secciones de negocio (retos, dinero, puntos).
 *
 * Con DIENTES: se mockea `getCurrentUser` (NO `requireRole`), así el RBAC real corre entero, con su
 * jerarquía y su exigencia de correo verificado.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SessionUser } from "../src/server/auth/session";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));

vi.mock("@/server/auth/current-user", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, notFound: mocks.notFound }));

import { protegerPanel, requireSeccion } from "../src/app/panel/panel-guard";

function usuario(role: SessionUser["role"], emailVerified: Date | null = new Date()): SessionUser {
  return { userId: "u1", role, emailVerified, sessionId: "s1" };
}

beforeEach(() => {
  mocks.getCurrentUser.mockReset();
  mocks.redirect.mockClear();
  mocks.notFound.mockClear();
});

describe("protegerPanel", () => {
  it("ADMIN verificado -> devuelve el admin, SIN redirect (entra al panel)", async () => {
    mocks.getCurrentUser.mockResolvedValue(usuario("ADMIN"));
    const u = await protegerPanel();
    expect(u.role).toBe("ADMIN");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("USER verificado -> redirige a / (no revela que el panel existe)", async () => {
    mocks.getCurrentUser.mockResolvedValue(usuario("USER"));
    await expect(protegerPanel()).rejects.toThrow("REDIRECT:/");
    expect(mocks.redirect).toHaveBeenCalledWith("/");
  });

  it("MODERATOR verificado -> ENTRA al shell (el panel dejó de ser solo del admin)", async () => {
    // Antes este caso redirigía: el shell exigía ADMIN. Se abrió a propósito cuando existieron
    // moderadores de verdad; lo que decide qué ve cada uno es ahora `requireSeccion`.
    mocks.getCurrentUser.mockResolvedValue(usuario("MODERATOR"));
    const u = await protegerPanel();
    expect(u.role).toBe("MODERATOR");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("sin sesión -> redirige a login con vuelta al panel", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    await expect(protegerPanel()).rejects.toThrow("REDIRECT:/entrar?siguiente=%2Fpanel");
    expect(mocks.redirect).toHaveBeenCalledWith("/entrar?siguiente=%2Fpanel");
  });

  it("ADMIN NO verificado -> redirige a / (requireRole parte de email verificado)", async () => {
    mocks.getCurrentUser.mockResolvedValue(usuario("ADMIN", null));
    await expect(protegerPanel()).rejects.toThrow("REDIRECT:/");
    expect(mocks.redirect).toHaveBeenCalledWith("/");
  });
});

describe("requireSeccion (el guard de cada página)", () => {
  it("un MODERADOR entra en SU trabajo: moderación y cuentas", async () => {
    mocks.getCurrentUser.mockResolvedValue(usuario("MODERATOR"));
    for (const ruta of ["/panel/moderacion", "/panel/usuarios"]) {
      const u = await requireSeccion(ruta);
      expect(u.role, ruta).toBe("MODERATOR");
    }
    expect(mocks.notFound).not.toHaveBeenCalled();
  });

  it("y NO entra en las de negocio: para él no existen (404, no un 'no tienes permiso')", async () => {
    mocks.getCurrentUser.mockResolvedValue(usuario("MODERATOR"));
    for (const ruta of [
      "/panel",
      "/panel/retos",
      "/panel/retos/abc",
      "/panel/ranking",
      "/panel/notificaciones",
      "/panel/monedero",
      "/panel/boost",
    ]) {
      await expect(requireSeccion(ruta), ruta).rejects.toThrow("NOT_FOUND");
    }
    // Ni una sola de esas llegó a redirigir: no se le cuenta a dónde ir, simplemente no está.
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("el ADMIN entra en todas, incluidas las del moderador (jerarquía)", async () => {
    mocks.getCurrentUser.mockResolvedValue(usuario("ADMIN"));
    for (const ruta of ["/panel", "/panel/retos", "/panel/moderacion", "/panel/usuarios"]) {
      expect((await requireSeccion(ruta)).role, ruta).toBe("ADMIN");
    }
  });

  it("una subruta hereda el rol de SU sección (el detalle de un reto es Retos)", async () => {
    mocks.getCurrentUser.mockResolvedValue(usuario("MODERATOR"));
    await expect(requireSeccion("/panel/retos/lo-que-sea")).rejects.toThrow("NOT_FOUND");
  });

  it("sin sesión -> a login, y vuelve a la página que pedía", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    await expect(requireSeccion("/panel/moderacion")).rejects.toThrow(
      "REDIRECT:/entrar?siguiente=%2Fpanel%2Fmoderacion",
    );
  });

  it("una ruta del panel SIN sección revienta: una página sin guard no se resuelve dejando pasar", async () => {
    mocks.getCurrentUser.mockResolvedValue(usuario("ADMIN"));
    await expect(requireSeccion("/panel/seccion-que-no-existe")).rejects.toThrow(
      /sin sección declarada/i,
    );
  });
});
