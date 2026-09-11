/**
 * El CTA de la barra dice la VERDAD sobre su destino, según quién lo mira. Render real (jsdom): un
 * no-admin ve "Subir vídeo" hacia /crear y NUNCA "Crear reto"; solo el admin ve "Crear reto", hacia el
 * panel. Antes decía "Crear reto" a todo el mundo y llevaba a subir un vídeo.
 */
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ ruta: "/retos" }));

vi.mock("next/navigation", () => ({ usePathname: () => mocks.ruta }));
// `next/link` necesita el contexto del router; aquí basta un <a> con sus props.
vi.mock("next/link", async () => {
  const { createElement } = await import("react");
  return { default: (props: Record<string, unknown>) => createElement("a", props) };
});

import { CtaCrear } from "@/app/(app)/(shell)/cta-crear";

afterEach(() => {
  mocks.ruta = "/retos";
});

function enlace(): HTMLAnchorElement {
  return screen.getByRole("link") as HTMLAnchorElement;
}

describe("CtaCrear", () => {
  it("usuario NO admin -> 'Subir vídeo' a /crear, nunca 'Crear reto'", () => {
    render(<CtaCrear rol="USER" />);
    expect(enlace().getAttribute("href")).toBe("/crear");
    expect(enlace().textContent).toContain("Subir vídeo");
    expect(enlace().textContent).not.toContain("Crear reto");
  });

  it("moderador e invitado, igual: tampoco son admin", () => {
    for (const rol of ["MODERATOR", null]) {
      const { unmount } = render(<CtaCrear rol={rol} />);
      expect(enlace().getAttribute("href")).toBe("/crear");
      expect(enlace().textContent).not.toContain("Crear reto");
      unmount();
    }
  });

  it("ADMIN -> 'Crear reto', al panel", () => {
    render(<CtaCrear rol="ADMIN" />);
    expect(enlace().getAttribute("href")).toBe("/panel/retos");
    expect(enlace().textContent).toContain("Crear reto");
  });

  it("en /inicio se atenúa a secundario (el magenta es del hero)", () => {
    mocks.ruta = "/inicio";
    render(<CtaCrear rol="USER" />);
    expect(enlace().className).toContain("border-line");
    expect(enlace().className).not.toContain("bg-action");
  });
});
