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
import { resolverServidor } from "../helpers/render-servidor";
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
  esVip: false,
  carril: 0,
  colorNombre: null,
  ...extra,
});

const tarjetas = () => [...document.querySelectorAll("[data-destacado]")];

describe("con destacados reales", () => {
  it("pinta uno por aparición, en el orden que llega", async () => {
    render(
      await resolverServidor(<BoostDestacados perfiles={[perfil(1), perfil(2), perfil(3)]} />),
    );

    expect(tarjetas()).toHaveLength(3);
    expect(tarjetas().map((t) => t.getAttribute("data-destacado"))).toEqual([
      "usuaria1",
      "usuaria2",
      "usuaria3",
    ]);
  });

  it("la POSICIÓN es el sitio en la fila, no un dato de la aparición", async () => {
    // Nadie compra "el puesto 1": se numera lo que se pinta, por orden.
    render(await resolverServidor(<BoostDestacados perfiles={[perfil(7), perfil(8)]} />));
    expect(within(tarjetas()[0] as HTMLElement).getByText("1")).toBeTruthy();
    expect(within(tarjetas()[1] as HTMLElement).getByText("2")).toBeTruthy();
  });

  it("cada tarjeta lleva AL PERFIL de esa persona", async () => {
    render(await resolverServidor(<BoostDestacados perfiles={[perfil(1)]} />));
    expect(tarjetas()[0]!.getAttribute("href")).toBe("/u/usuaria1");
  });

  it("enseña el nombre visible cuando lo hay, y el handle cuando no", async () => {
    render(
      await resolverServidor(
        <BoostDestacados
          perfiles={[perfil(1, { displayName: "La Primera" }), perfil(2, { displayName: null })]}
        />,
      ),
    );
    expect(tarjetas()[0]!.textContent).toContain("La Primera");
    expect(tarjetas()[1]!.textContent).toContain("usuaria2");
  });

  it("y el nivel se DERIVA de los puntos, como en todo el producto", async () => {
    // Si el nivel viniera como dato, dos pantallas podrían decir niveles distintos del mismo saldo.
    render(
      await resolverServidor(
        <BoostDestacados perfiles={[perfil(1, { puntos: 0 }), perfil(2, { puntos: 5000 })]} />,
      ),
    );
    expect(tarjetas()[0]!.textContent).not.toBe(tarjetas()[1]!.textContent);
  });
});

describe("sin destacados", () => {
  it("no pinta ni un perfil: la lista vacía NO se rellena", async () => {
    // Era el fallo anterior: cinco usuarios de ejemplo para que no se viera vacío.
    render(await resolverServidor(<BoostDestacados perfiles={[]} />));
    expect(tarjetas()).toHaveLength(0);
  });

  it("y lo dice invitando, que es lo que un hueco tiene que hacer", async () => {
    render(await resolverServidor(<BoostDestacados perfiles={[]} />));
    expect(screen.getByText(/no hay ning[úu]n perfil destacado/i)).toBeTruthy();
  });

  it("ningún nombre de la vieja maqueta aparece en ningún caso", async () => {
    for (const perfiles of [[], [perfil(1)]]) {
      cleanup();
      render(await resolverServidor(<BoostDestacados perfiles={perfiles} />));
      const texto = document.body.textContent ?? "";
      for (const inventado of ["sara_p", "laia10", "nico_skate", "bea", "rae"]) {
        expect(texto, `vuelve ${inventado}`).not.toContain(inventado);
      }
    }
  });
});

describe("la cabecera invita a destacar", () => {
  it("el enlace va a /boosts, que es donde se compran y se gastan", async () => {
    // Antes apuntaba a /perfil. Era el enlace de un botón que tampoco hacía nada.
    render(await resolverServidor(<BoostDestacados perfiles={[perfil(1)]} />));
    const invitacion = screen.getByText(/Destaca tu perfil/);
    expect(invitacion.closest("a")?.getAttribute("href")).toBe("/boosts");
  });
});

/**
 * A UNA CUENTA DE EMPRESA, la fila sin sus puertas (Fase 9, P2): /destacados y /boosts son pantallas
 * de participante que la apartan a su portal, y "puedes ser el primero" la invitaría a comprar.
 * Para romperlo a propósito: ignorar `soloMirar` (rojo los dos).
 */
describe("una cuenta de empresa mira la fila, sin sus puertas", () => {
  it("ve los perfiles, pero ni «Ver todos» ni «Destaca tu perfil»", async () => {
    render(await resolverServidor(<BoostDestacados perfiles={[perfil(1), perfil(2)]} soloMirar />));
    expect(tarjetas()).toHaveLength(2);
    expect(screen.queryByText(/Ver todos/)).toBeNull();
    expect(screen.queryByText(/Destaca tu perfil/)).toBeNull();
  });

  it("y vacía no la invita a ser la primera", async () => {
    render(await resolverServidor(<BoostDestacados perfiles={[]} soloMirar />));
    expect(screen.getByText(/no hay ningún perfil destacado/)).toBeTruthy();
    expect(screen.queryByText(/Puedes ser el primero/)).toBeNull();
  });
});
