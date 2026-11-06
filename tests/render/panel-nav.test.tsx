/**
 * LA NAV DEL PANEL ENSEÑA LO QUE EL ROL ALCANZA. No es seguridad —la aplica `requireSeccion` en cada
 * página—, pero sí es honestidad: una barra que ofrece "Retos" a un moderador le promete una pantalla
 * que va a responder 404.
 *
 * Sale de la MISMA lista que el guard (`secciones.ts`), así que las dos no pueden discrepar.
 *
 * Y LA INSIGNIA DE PENDIENTES se pinta de verdad: el número junto a «Empresas» es lo que hace que el
 * admin se entere sin buscar (corrección de P1, lo pidió Junior tras probarlo en producción).
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/panel/moderacion" }));

import { PanelNav } from "@/app/panel/panel-nav";
import { SECCIONES_PANEL } from "@/app/panel/secciones";

const NADA = { empresas: 0, propuestas: 0, publicidad: 0 };

const enlaces = (): string[] =>
  screen.getAllByRole("link").map((a) => a.getAttribute("href") ?? "");

describe("PanelNav", () => {
  it("un MODERADOR solo ve su trabajo", () => {
    render(<PanelNav rol="MODERATOR" pendientes={NADA} />);
    expect(enlaces()).toEqual(["/panel/moderacion", "/panel/usuarios"]);
    // Nada de negocio: ni retos, ni puntos, ni anuncios, ni dinero.
    for (const href of ["/panel", "/panel/retos", "/panel/ranking", "/panel/notificaciones"]) {
      expect(enlaces(), href).not.toContain(href);
    }
  });

  it("un ADMINISTRADOR las ve todas", () => {
    render(<PanelNav rol="ADMIN" pendientes={NADA} />);
    expect(enlaces()).toEqual(SECCIONES_PANEL.map((s) => s.href));
  });

  it("y la sección activa se marca igual que antes", () => {
    render(<PanelNav rol="MODERATOR" pendientes={NADA} />);
    const activo = screen.getByRole("link", { name: /Moderación/ });
    expect(activo.getAttribute("aria-current")).toBe("page");
  });
});

describe("la insignia de pendientes", () => {
  it("con empresas por verificar, el número sale junto a «Empresas»", () => {
    render(<PanelNav rol="ADMIN" pendientes={{ empresas: 3, propuestas: 0, publicidad: 0 }} />);
    const empresas = screen.getByRole("link", { name: /Empresas/ });
    const insignia = empresas.querySelector("[data-insignia]");
    expect(insignia?.getAttribute("data-insignia")).toBe("3");
    expect(insignia?.textContent).toContain("3");
    // Y solo ahí: ninguna otra sección tiene cifra todavía.
    expect(document.querySelectorAll("[data-insignia]")).toHaveLength(1);
  });

  it("con cero, no se pinta (una insignia con un 0 enseña a no mirarla)", () => {
    render(<PanelNav rol="ADMIN" pendientes={NADA} />);
    expect(document.querySelectorAll("[data-insignia]")).toHaveLength(0);
  });

  it("y a un moderador no se le pinta aunque las haya: no es su sección", () => {
    render(<PanelNav rol="MODERATOR" pendientes={{ empresas: 3, propuestas: 0, publicidad: 0 }} />);
    expect(document.querySelectorAll("[data-insignia]")).toHaveLength(0);
  });
});
