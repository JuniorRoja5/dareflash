/**
 * LA PUERTA AL VIP, EN LAS DOS BARRAS — render real.
 *
 * ┌─ POR QUÉ UN TEST DE COMPOSICIÓN Y NO SOLO EL DEL CATÁLOGO ───────────────────────────────────┐
 * │ Que `NAV_DESTINOS` tenga el destino con su `acento: "vip"` no pinta nada: lo pintan DOS       │
 * │ componentes distintos, y cada uno puede ignorar el acento sin que el catálogo se entere. El   │
 * │ caso que se escapa es el de móvil, donde este menú es la ÚNICA puerta al VIP y nadie la mira  │
 * │ al tocar la barra lateral.                                                                     │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Lo que se fija: la fila existe en las dos, va en ORO (nunca en `--df-action`), lleva su icono, y
 * NINGUNA otra fila se lleva el acento por el camino.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", async () => {
  const { createElement } = await import("react");
  return { default: (props: Record<string, unknown>) => createElement("a", props) };
});

import { NavegacionLateral } from "@/components/ui/navegacion";

afterEach(cleanup);

/** La fila dorada, sea cual sea la barra que la monte. */
const filaVip = () => document.querySelector("[data-nav-vip]") as HTMLElement | null;

describe("la barra lateral de escritorio", () => {
  it("lleva la puerta al VIP, con su nombre y su ruta", () => {
    render(<NavegacionLateral />);
    const fila = filaVip();
    expect(fila, "no hay puerta al VIP en la barra lateral").toBeTruthy();
    expect(fila!.getAttribute("href")).toBe("/vip");
    expect(fila!.textContent).toBe("Hazte VIP Mythic");
  });

  it("va en ORO y NUNCA en el verde de acción", () => {
    render(<NavegacionLateral />);
    // El atributo CRUDO: jsdom no resuelve `var(…)`, así que la propiedad computada vendría vacía
    // y el caso pasaría sin mirar nada.
    const estilo = filaVip()!.getAttribute("style") ?? "";
    // LA TINTA, no "hay oro en algún sitio": `toContain("var(--vip-gold)")` lo cumpliría un filete
    // dorado alrededor de un texto verde. Y con límite por delante, porque
    // "background-color: var(--vip-gold)" contiene "color: var(--vip-gold)" como subcadena.
    expect(estilo).toMatch(/(^|;\s*)color: var\(--vip-gold\)/);
    expect(estilo).not.toContain("--df-action");
    expect(filaVip()!.className, "la fila usa el relleno del botón principal").not.toContain(
      "bg-action",
    );
  });

  it("y lleva icono: un destino sin dibujo deja un hueco al lado del texto", () => {
    render(<NavegacionLateral />);
    expect(filaVip()!.querySelector("svg"), "la fila del VIP no tiene icono").toBeTruthy();
  });

  it("es la ÚNICA fila con el acento: el oro no se derrama", () => {
    render(<NavegacionLateral />);
    expect(document.querySelectorAll("[data-nav-vip]")).toHaveLength(1);
    const dorados = [...document.querySelectorAll("a")].filter((a) =>
      (a.getAttribute("style") ?? "").includes("--vip-gold"),
    );
    expect(dorados).toHaveLength(1);
  });

  it("se le enseña a todo el mundo: la barra no sabe quién es VIP", () => {
    // `NavegacionLateral` no recibe ni sesión ni suscripción, así que no puede esconderla — y
    // esconderla a un VIP dejaría la baja sin puerta, que es donde se cancela.
    render(<NavegacionLateral activo="vip" />);
    expect(filaVip()!.getAttribute("aria-current")).toBe("page");
  });
});

describe("el menú «Más» de móvil", () => {
  /** Los iconos los pasa la barra; aquí basta con que la fila los reciba. */
  it("también lleva la puerta, y también en oro", async () => {
    const { MenuMasMovil } = await import("@/components/ui/menu-mas-movil");
    const { NAV_MOVIL_MAS } = await import("@/components/ui/logic");
    const icono = Object.fromEntries(NAV_MOVIL_MAS.map((c) => [c, null]));

    render(<MenuMasMovil icono={icono} />);
    fireEvent.click(screen.getByRole("button", { name: /Más/ }));

    const fila = filaVip();
    expect(fila, "en móvil el VIP se ha quedado sin puerta dorada").toBeTruthy();
    expect(fila!.getAttribute("href")).toBe("/vip");
    // La TINTA en oro, con el mismo cuidado que en la lateral (ver el caso de allí).
    expect(fila!.getAttribute("style") ?? "").toMatch(/(^|;\s*)color: var\(--vip-gold\)/);
    expect(document.querySelectorAll("[data-nav-vip]")).toHaveLength(1);
  });
});
