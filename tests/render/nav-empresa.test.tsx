/**
 * LA NAV DE UNA CUENTA DE EMPRESA, PINTADA (Fase 9, P2). `empresa-shell` fija las LISTAS; esto
 * comprueba que los componentes las usan de verdad: una lista correcta que la barra no lee no
 * cambia nada en pantalla.
 *
 * Para romperlo a propósito: que `NavegacionLateral` ignore `esCuentaEmpresa` (rojo: vuelven Perfil,
 * Puntos y el VIP); volver a pintar "+" fijo en el círculo central (rojo); que el menú «Más» lea
 * siempre `NAV_MOVIL_MAS` (rojo).
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", async () => {
  const { createElement } = await import("react");
  return { default: (props: Record<string, unknown>) => createElement("a", props) };
});

import { NavegacionInferior, NavegacionLateral } from "@/components/ui/navegacion";
import { CTA_EMPRESA, CTA_USUARIO } from "@/lib/cta-principal";

afterEach(cleanup);

const hrefs = (): string[] => screen.getAllByRole("link").map((a) => a.getAttribute("href") ?? "");

/** Lo que una empresa no debe ver ofrecido en ninguna barra. */
const DE_PARTICIPANTE = ["/perfil", "/puntos", "/referidos", "/destacados", "/vip", "/crear"];

describe("escritorio: la lateral de la empresa", () => {
  it("mirar y su cuenta, y nada de participante", () => {
    render(<NavegacionLateral esCuentaEmpresa />);
    expect(hrefs()).toEqual(["/inicio", "/feed", "/retos", "/ranking", "/empresa/cuenta"]);
    for (const h of DE_PARTICIPANTE) expect(hrefs(), h).not.toContain(h);
    expect(document.querySelector("[data-nav-vip]")).toBeNull();
  });

  it("y la del participante sigue como estaba", () => {
    render(<NavegacionLateral />);
    expect(hrefs()).toContain("/perfil");
    expect(hrefs()).not.toContain("/empresa/cuenta");
  });
});

describe("móvil: la barra de la empresa", () => {
  it("el central lleva a su portal, con su escaparate y SIN «+»", () => {
    render(<NavegacionInferior rol="USER" esCuentaEmpresa />);
    const central = screen.getByRole("link", { name: CTA_EMPRESA.texto });
    expect(central.getAttribute("href")).toBe(CTA_EMPRESA.href);
    expect(central.querySelector("[data-cta-empresa]")).not.toBeNull();
    expect(screen.queryByText("+")).toBeNull();
  });

  it("Feed, Retos, su portal y Cuenta; nada de participante", () => {
    render(<NavegacionInferior rol="USER" esCuentaEmpresa />);
    expect(hrefs()).toEqual(["/feed", "/retos", CTA_EMPRESA.href, "/empresa/cuenta"]);
    for (const h of DE_PARTICIPANTE) expect(hrefs(), h).not.toContain(h);
  });

  it("el menú «Más» trae lo SUYO: Inicio y Ranking", () => {
    render(<NavegacionInferior rol="USER" esCuentaEmpresa />);
    fireEvent.click(screen.getByRole("button", { name: /Más/ }));
    expect(hrefs()).toEqual(expect.arrayContaining(["/inicio", "/ranking"]));
    for (const h of DE_PARTICIPANTE) expect(hrefs(), h).not.toContain(h);
  });

  it("y el participante sigue con su «+» a subir vídeo", () => {
    render(<NavegacionInferior rol="USER" />);
    expect(screen.getByText("+").closest("a")?.getAttribute("href")).toBe(CTA_USUARIO.href);
  });
});
