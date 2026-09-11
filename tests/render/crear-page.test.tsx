/**
 * /crear ES la pantalla de subir vídeo, y la página no pone ninguna condición propia: a quien llega con
 * sesión le enseña la subida. El gate del invitado vive SOLO en el proxy (ver tests/proxy-gate.test.ts,
 * que prueba que con cookie /crear pasa). Si la página empezara a redirigir por su cuenta, el usuario
 * logueado volvería a ver un login fantasma.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

import CrearPage from "@/app/(app)/(shell)/crear/page";

describe("/crear", () => {
  it("pinta la subida de vídeo, no un login", () => {
    render(<CrearPage />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Subir tu vídeo");
    expect(screen.getByRole("button", { name: "Subir un vídeo" })).toBeDefined();
    expect(screen.queryByText(/Iniciar sesión/)).toBeNull();
  });
});
