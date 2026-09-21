/**
 * LA NAV DEL PANEL ENSEÑA LO QUE EL ROL ALCANZA. No es seguridad —la aplica `requireSeccion` en cada
 * página—, pero sí es honestidad: una barra que ofrece "Retos" a un moderador le promete una pantalla
 * que va a responder 404.
 *
 * Sale de la MISMA lista que el guard (`secciones.ts`), así que las dos no pueden discrepar.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/panel/moderacion" }));

import { PanelNav } from "@/app/panel/panel-nav";
import { SECCIONES_PANEL } from "@/app/panel/secciones";

const enlaces = (): string[] =>
  screen.getAllByRole("link").map((a) => a.getAttribute("href") ?? "");

describe("PanelNav", () => {
  it("un MODERADOR solo ve su trabajo", () => {
    render(<PanelNav rol="MODERATOR" />);
    expect(enlaces()).toEqual(["/panel/moderacion", "/panel/usuarios"]);
    // Nada de negocio: ni retos, ni puntos, ni anuncios, ni dinero.
    for (const href of ["/panel", "/panel/retos", "/panel/ranking", "/panel/notificaciones"]) {
      expect(enlaces(), href).not.toContain(href);
    }
  });

  it("un ADMINISTRADOR las ve todas", () => {
    render(<PanelNav rol="ADMIN" />);
    expect(enlaces()).toEqual(SECCIONES_PANEL.map((s) => s.href));
  });

  it("y la sección activa se marca igual que antes", () => {
    render(<PanelNav rol="MODERATOR" />);
    const activo = screen.getByRole("link", { name: /Moderación/ });
    expect(activo.getAttribute("aria-current")).toBe("page");
  });
});
