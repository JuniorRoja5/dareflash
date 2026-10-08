/**
 * LOS PERFILES DESTACADOS DE LA PORTADA — render real, con la maqueta ya retirada.
 *
 * Esta fila pintaba cinco usuarios INVENTADOS (`PERFILES_BOOST`) a todo el que entraba. Lo que se
 * fija aquí es que ahora dice la verdad:
 *
 *  - LOS DATOS LLEGAN DE FUERA (prop), no de un módulo de maqueta: el componente no puede inventar.
 *  - EL ORDEN QUE LLEGA ES EL QUE SE PINTA. La posición es el sitio en la fila, no un dato que
 *    alguien compre.
 *  - VACÍO HONESTO: sin destacados se invita, no se rellena.
 *  - CADA TARJETA LLEVA A SU PERFIL, y el enlace de la cabecera a /boosts (antes iba a /perfil, que
 *    no tiene nada que ver con destacar).
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", async () => {
  const { createElement } = await import("react");
  return { default: (props: Record<string, unknown>) => createElement("a", props) };
});

import { BoostDestacados } from "@/app/(app)/(shell)/inicio/boost-destacados";
import type { PerfilDestacado } from "@/server/services/boost-destacados";

afterEach(cleanup);

const perfil = (n: number, extra: Partial<PerfilDestacado> = {}): PerfilDestacado => ({
  activacionId: `a${n}`,
  userId: `u${n}`,
  username: `usuaria${n}`,
  displayName: null,
  imagen: null,
  puntos: n * 100,
  destacadoDesdeMs: Date.now() - n * 60_000,
  expiraEnMs: Date.now() + 60 * 60_000,
  ...extra,
});

const tarjetas = () => [...document.querySelectorAll("[data-destacado]")];

describe("con destacados reales", () => {
  it("pinta uno por aparición, en el orden que llega", () => {
    render(<BoostDestacados perfiles={[perfil(1), perfil(2), perfil(3)]} />);

    expect(tarjetas()).toHaveLength(3);
    expect(tarjetas().map((t) => t.getAttribute("data-destacado"))).toEqual([
      "usuaria1",
      "usuaria2",
      "usuaria3",
    ]);
  });

  it("la POSICIÓN es el sitio en la fila, no un dato de la aparición", () => {
    // Nadie compra "el puesto 1": se numera lo que se pinta, por orden.
    render(<BoostDestacados perfiles={[perfil(7), perfil(8)]} />);
    expect(within(tarjetas()[0] as HTMLElement).getByText("1")).toBeTruthy();
    expect(within(tarjetas()[1] as HTMLElement).getByText("2")).toBeTruthy();
  });

  it("cada tarjeta lleva AL PERFIL de esa persona", () => {
    render(<BoostDestacados perfiles={[perfil(1)]} />);
    expect(tarjetas()[0]!.getAttribute("href")).toBe("/u/usuaria1");
  });

  it("enseña el nombre visible cuando lo hay, y el handle cuando no", () => {
    render(
      <BoostDestacados
        perfiles={[perfil(1, { displayName: "La Primera" }), perfil(2, { displayName: null })]}
      />,
    );
    expect(tarjetas()[0]!.textContent).toContain("La Primera");
    expect(tarjetas()[1]!.textContent).toContain("usuaria2");
  });

  it("y el nivel se DERIVA de los puntos, como en todo el producto", () => {
    // Si el nivel viniera como dato, dos pantallas podrían decir niveles distintos del mismo saldo.
    render(<BoostDestacados perfiles={[perfil(1, { puntos: 0 }), perfil(2, { puntos: 5000 })]} />);
    expect(tarjetas()[0]!.textContent).not.toBe(tarjetas()[1]!.textContent);
  });
});

describe("sin destacados", () => {
  it("no pinta ni un perfil: la lista vacía NO se rellena", () => {
    // Era el fallo anterior: cinco usuarios de ejemplo para que no se viera vacío.
    render(<BoostDestacados perfiles={[]} />);
    expect(tarjetas()).toHaveLength(0);
  });

  it("y lo dice invitando, que es lo que un hueco tiene que hacer", () => {
    render(<BoostDestacados perfiles={[]} />);
    expect(screen.getByText(/no hay ning[úu]n perfil destacado/i)).toBeTruthy();
  });

  it("ningún nombre de la vieja maqueta aparece en ningún caso", () => {
    for (const perfiles of [[], [perfil(1)]]) {
      cleanup();
      render(<BoostDestacados perfiles={perfiles} />);
      const texto = document.body.textContent ?? "";
      for (const inventado of ["sara_p", "laia10", "nico_skate", "bea", "rae"]) {
        expect(texto, `vuelve ${inventado}`).not.toContain(inventado);
      }
    }
  });
});

describe("la cabecera invita a destacar", () => {
  it("el enlace va a /boosts, que es donde se compran y se gastan", () => {
    // Antes apuntaba a /perfil. Era el enlace de un botón que tampoco hacía nada.
    render(<BoostDestacados perfiles={[perfil(1)]} />);
    const invitacion = screen.getByText(/Destaca tu perfil/);
    expect(invitacion.closest("a")?.getAttribute("href")).toBe("/boosts");
  });
});
