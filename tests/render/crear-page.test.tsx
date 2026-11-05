/**
 * /crear ES la pantalla de subir vídeo, y la página no pone ninguna condición de SESIÓN propia: a quien
 * llega con sesión le enseña la subida. El gate del invitado vive SOLO en el proxy (ver
 * tests/proxy-gate.test.ts, que prueba que con cookie /crear pasa). Si la página empezara a redirigir
 * al login por su cuenta, el usuario logueado volvería a ver un login fantasma.
 *
 * La ÚNICA condición que sí pone es otra cosa (Fase 9, P2): una cuenta de EMPRESA no sube vídeos, y en
 * vez de enseñarle un botón que el servidor le negaría, la manda a su portal. Ni al login, ni a nadie
 * más: el participante y el invitado siguen viendo lo mismo que antes.
 */
import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({ sesion: null as unknown }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("@/server/auth/current-user", () => ({ getCurrentUser: async () => H.sesion }));

import CrearPage from "@/app/(app)/(shell)/crear/page";

const sesion = (esCuentaEmpresa: boolean) => ({
  userId: "u-1",
  role: "USER",
  emailVerified: new Date(),
  esCuentaEmpresa,
  sessionId: "s-1",
});

beforeEach(() => {
  H.sesion = null;
});

describe("/crear", () => {
  it("con sesión de participante, pinta la subida de vídeo, no un login", async () => {
    H.sesion = sesion(false);
    render((await CrearPage()) as ReactElement);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Subir tu vídeo");
    expect(screen.getByRole("button", { name: "Subir un vídeo" })).toBeDefined();
    expect(screen.queryByText(/Iniciar sesión/)).toBeNull();
  });

  it("sin sesión tampoco manda al login: ese gate es del proxy", async () => {
    render((await CrearPage()) as ReactElement);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Subir tu vídeo");
  });

  it("una cuenta de empresa va a su portal: no sube vídeos", async () => {
    H.sesion = sesion(true);
    await expect(CrearPage()).rejects.toThrow("REDIRECT:/empresa");
  });
});
