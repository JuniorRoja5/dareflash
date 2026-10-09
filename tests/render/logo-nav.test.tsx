/**
 * EL LOGOTIPO EN LA BARRA LATERAL — render real. Lo que se fija aquí y no se puede ver leyendo el
 * fuente:
 *
 *  - SE ANUNCIA UNA VEZ, Y CON EL NOMBRE DE LA MARCA. El lockup es `role="img"` + `aria-label`, así
 *    que un lector de pantalla dice "DareFlash" una sola vez, y no la marca y después la palabra.
 *  - LA PALABRA SE SIGUE VIENDO. Es el fallo que tendría una marca metida entera dentro del SVG: si
 *    la fuente no carga, el nombre desaparece. Aquí la palabra es texto real del documento.
 *  - NO ES UN ENLACE. "Inicio" ya es una fila de la nav; dos puertas al mismo sitio, pegadas, son
 *    una trampa para el dedo. Si alguien envuelve el logotipo en un <Link>, este caso cae.
 *  - Y LA NAV SIGUE COMPLETA: cambiar la cabecera no se puede llevar por delante un destino.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// `next/link` necesita el contexto del router; aquí basta un <a> con sus props.
vi.mock("next/link", async () => {
  const { createElement } = await import("react");
  return { default: (props: Record<string, unknown>) => createElement("a", props) };
});

import { NavegacionLateral } from "@/components/ui/navegacion";
import { NAV_ESCRITORIO } from "@/components/ui/logic";

describe("la marca del cromo de escritorio", () => {
  it("se anuncia UNA vez como DareFlash", () => {
    render(<NavegacionLateral />);
    expect(screen.getAllByRole("img", { name: "DareFlash" })).toHaveLength(1);
  });

  it("y la palabra se pinta de verdad (no depende de que cargue la fuente)", () => {
    render(<NavegacionLateral />);
    expect(screen.getByText("DAREFLASH")).toBeTruthy();
  });

  it("el logotipo NO es un enlace", () => {
    render(<NavegacionLateral />);
    const marca = screen.getByRole("img", { name: "DareFlash" });
    expect(marca.closest("a"), "el logotipo quedó envuelto en un enlace").toBeNull();
  });

  it("y la nav sigue teniendo todos sus destinos", () => {
    render(<NavegacionLateral />);
    expect(screen.getAllByRole("link")).toHaveLength(NAV_ESCRITORIO.length);
  });
});
