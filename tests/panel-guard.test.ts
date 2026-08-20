/**
 * Guard del PANEL de admin (M4) — cableado. `requireRole` ya tiene tests; aquí se prueba que el layout
 * llama a `requireRole("ADMIN")` (no a `requireUser`) y traduce sus fallos a los redirects correctos.
 * Con DIENTES: se mockea `getCurrentUser` (NO `requireRole`), así `requireRole` corre de verdad; si el
 * guard usara `requireUser`, el caso USER dejaría de redirigir y su test caería.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SessionUser } from "../src/server/auth/session";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock("@/server/auth/current-user", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { protegerPanel } from "../src/app/panel/panel-guard";

function usuario(role: SessionUser["role"], emailVerified: Date | null = new Date()): SessionUser {
  return { userId: "u1", role, emailVerified, sessionId: "s1" };
}

beforeEach(() => {
  mocks.getCurrentUser.mockReset();
  mocks.redirect.mockClear();
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

  it("MODERATOR verificado -> redirige a / (el rol no basta; necesitaría ser ADMIN)", async () => {
    mocks.getCurrentUser.mockResolvedValue(usuario("MODERATOR"));
    await expect(protegerPanel()).rejects.toThrow("REDIRECT:/");
    expect(mocks.redirect).toHaveBeenCalledWith("/");
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
