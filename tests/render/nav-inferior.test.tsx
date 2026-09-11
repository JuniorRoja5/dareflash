/**
 * El [+] de la barra inferior (móvil) es el MISMO CTA principal que el de la barra de escritorio y el
 * hero: por rol y de la misma fuente (`ctaPrincipal`). Antes decía "Crear" e iba a /crear para todos,
 * un tercer sitio con su propio texto por donde el CTA podía volver a divergir.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// `next/link` necesita el contexto del router; aquí basta un <a> con sus props.
vi.mock("next/link", async () => {
  const { createElement } = await import("react");
  return { default: (props: Record<string, unknown>) => createElement("a", props) };
});

import { NavegacionInferior } from "@/components/ui/navegacion";
import { CTA_ADMIN, CTA_USUARIO } from "@/lib/cta-principal";

/** El enlace del [+] (el único que no pinta nombre, solo el signo). */
function mas(): HTMLAnchorElement {
  const a = screen.getByText("+").closest("a");
  if (!a) throw new Error("no se pintó el [+]");
  return a;
}

const resto = (): string[] =>
  screen
    .getAllByRole("link")
    .filter((a) => a !== mas())
    .map((a) => a.getAttribute("href") ?? "");

describe("el [+] de la nav móvil", () => {
  it("usuario, moderador e invitado -> su acción real: subir un vídeo", () => {
    for (const rol of ["USER", "MODERATOR", null]) {
      const { unmount } = render(<NavegacionInferior rol={rol} />);
      expect(mas().getAttribute("href")).toBe(CTA_USUARIO.href);
      expect(mas().getAttribute("aria-label")).toBe(CTA_USUARIO.texto);
      unmount();
    }
  });

  it("ADMIN -> crear un reto, en el panel", () => {
    render(<NavegacionInferior rol="ADMIN" />);
    expect(mas().getAttribute("href")).toBe(CTA_ADMIN.href);
    expect(mas().getAttribute("aria-label")).toBe(CTA_ADMIN.texto);
  });

  it("en móvil el icono de PERFIL lleva las no-leídas (neutro, con el mismo tope que la campana)", () => {
    const perfil = () => screen.getByText("Perfil").closest("a")!;
    const { unmount } = render(<NavegacionInferior rol="USER" noLeidas={3} />);
    expect(perfil().textContent).toContain("3");
    expect(perfil().textContent).toContain("avisos sin leer");
    expect(screen.getByText("3").className).toContain("bg-text-dim");
    unmount();

    const otra = render(<NavegacionInferior rol="USER" noLeidas={150} />);
    expect(perfil().textContent).toContain("99+");
    otra.unmount();

    render(<NavegacionInferior rol="USER" noLeidas={0} />);
    expect(perfil().textContent).toBe("Perfil");
  });

  it("el rol solo cambia el [+]: el resto de destinos son los mismos", () => {
    const { unmount } = render(<NavegacionInferior rol="USER" />);
    const deUsuario = resto();
    unmount();
    render(<NavegacionInferior rol="ADMIN" />);
    expect(resto()).toEqual(deUsuario);
    expect(deUsuario).toEqual(["/feed", "/retos", "/ranking", "/perfil"]);
  });
});
