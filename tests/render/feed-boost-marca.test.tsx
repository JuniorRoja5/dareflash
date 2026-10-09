/**
 * LA MARCA DE BOOST EN EL FEED — render real, y ESTÁTICA.
 *
 * ┌─ AQUÍ NO HAY ANIMACIÓN, Y NO ES UN OLVIDO ────────────────────────────────────────────────────┐
 * │ El feed es lo más caro que tiene la app y lo que manda ahí es el vídeo. Un halo que respira o  │
 * │ un flote en cada slide compite con el contenido y cuesta en cada scroll. La marca es una       │
 * │ etiqueta, no un reclamo: aro y palabra, quietos.                                              │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Y una sola primitiva para las dos maquetas del feed y para las tarjetas de la vitrina: las dos del
 * feed ya divergieron una vez, y el día que cambie el tono o la palabra tienen que cambiar juntas.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AutorFeed, AvatarDestacado, MarcaBoost } from "@/components/ui/marca-boost";

afterEach(cleanup);

const marca = () => document.querySelector("[data-marca-boost]");
const aro = () => document.querySelector("[data-avatar-destacado]");

describe("la marca", () => {
  it("dice BOOST y usa el acento del sistema por token", () => {
    render(<MarcaBoost />);
    expect(marca()!.textContent).toBe("Boost");
    // Por token: tiene su valor en los dos temas. Un hex solo se vería bien en uno.
    expect(marca()!.getAttribute("style")).toContain("var(--df-action)");
  });

  it("y NO lleva animación de ninguna clase", () => {
    render(<MarcaBoost />);
    const clases = marca()!.className;
    expect(clases, "la marca se anima").not.toMatch(/animate-|df-float|df-sheen|df-halo|pulse/);
  });
});

describe("el aro del avatar", () => {
  it("solo aparece cuando está destacado", () => {
    const { unmount } = render(<AvatarDestacado nombre="ana" destacado={false} />);
    expect(aro(), "pinta el aro sin Boost").toBeNull();
    unmount();

    render(<AvatarDestacado nombre="ana" destacado />);
    expect(aro()).not.toBeNull();
  });

  it("sin Boost no envuelve nada: nada cambia de sitio para quien no lo tiene", () => {
    // Es la mayoría de la gente. Un envoltorio con padding permanente movería el avatar de todos.
    render(<AvatarDestacado nombre="ana" destacado={false} />);
    expect(document.querySelector("span.p-\\[7px\\]")).toBeNull();
  });

  it("va por tokens y queda FUERA del anillo de nivel", () => {
    render(<AvatarDestacado nombre="ana" puntos={5000} destacado />);
    const estilo = aro()!.getAttribute("style") ?? "";
    expect(estilo).toContain("var(--df-action)");
    expect(estilo).toContain("var(--df-void)");
    // El hueco: sin padding, el aro se pintaría encima del anillo de nivel.
    expect(aro()!.className).toContain("p-[7px]");
  });

  it("y tampoco se anima", () => {
    render(<AvatarDestacado nombre="ana" destacado />);
    expect(aro()!.className).not.toMatch(/animate-|df-float|df-sheen|df-halo|pulse/);
    expect(aro()!.getAttribute("style")).not.toMatch(/animation|transition/);
  });
});

describe("el bloque de autor del feed", () => {
  const montar = (destacado: boolean) =>
    render(
      <AutorFeed
        username="ana"
        nombre="Ana"
        conHandle
        puntos={0}
        destacado={destacado}
        claseNombre="text-white"
        claseHandle="text-white/80"
      />,
    );

  it("con Boost: aro y marca", () => {
    montar(true);
    expect(aro()).not.toBeNull();
    expect(marca()).not.toBeNull();
  });

  it("sin Boost: ni aro ni marca, y el nombre igual", () => {
    montar(false);
    expect(aro()).toBeNull();
    expect(marca()).toBeNull();
    expect(screen.getByText("Ana")).toBeTruthy();
    expect(screen.getByText("@ana")).toBeTruthy();
  });

  it("el handle solo sale cuando hay nombre visible", () => {
    render(
      <AutorFeed
        username="ana"
        nombre="ana"
        conHandle={false}
        destacado
        claseNombre=""
        claseHandle=""
      />,
    );
    // Sin displayName, el @handle ES el nombre prominente: no se repite debajo.
    expect(screen.getAllByText(/ana/)).toHaveLength(1);
    expect(screen.getByText("@ana")).toBeTruthy();
  });

  it("las clases del texto entran por prop: las dos maquetas del feed no son iguales", () => {
    // Sobre el vídeo va en blanco; en el panel, en tokens. Lo que NO cambia es qué se enseña.
    montar(true);
    expect(screen.getByText("Ana").className).toContain("text-white");
  });
});
