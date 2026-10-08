/**
 * LA VITRINA DE PERFILES BOOST — render real de la página (componente de servidor, `await` y al DOM).
 *
 * Lo que se fija:
 *  - PINTA LO QUE DEVUELVE LA CONSULTA, en su orden, una tarjeta por perfil.
 *  - CADA TARJETA LLEVA AL PERFIL de esa persona.
 *  - NO NUMERA: el orden es cronológico, y numerar hasta el cuarenta sugeriría un ranking.
 *  - VACÍO HONESTO: sin destacados lo dice e invita; cero relleno.
 *  - UN SOLO MAGENTA, el de destacarse. Mirar la lista no es una acción.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PerfilDestacado } from "@/server/services/boost-destacados";

const H = vi.hoisted(() => ({ perfiles: [] as unknown[] }));

vi.mock("@/server/db/client", () => ({ prisma: {} }));
vi.mock("@/server/services/boost-destacados", () => ({
  destacadosVigentes: async () => H.perfiles,
}));
vi.mock("next/link", async () => {
  const { createElement } = await import("react");
  return { default: (props: Record<string, unknown>) => createElement("a", props) };
});

import DestacadosPage from "@/app/(app)/(shell)/destacados/page";

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

async function pintar(perfiles: PerfilDestacado[]) {
  H.perfiles = perfiles;
  render(await DestacadosPage());
}

const tarjetas = () => [...document.querySelectorAll("[data-destacado]")];

describe("con destacados", () => {
  it("pinta una tarjeta por perfil, en el orden que llega", async () => {
    await pintar([perfil(1), perfil(2), perfil(3)]);
    expect(tarjetas().map((t) => t.getAttribute("data-destacado"))).toEqual([
      "usuaria1",
      "usuaria2",
      "usuaria3",
    ]);
  });

  it("cada tarjeta lleva AL PERFIL de esa persona", async () => {
    await pintar([perfil(1), perfil(2)]);
    expect(tarjetas().map((t) => t.getAttribute("href"))).toEqual(["/u/usuaria1", "/u/usuaria2"]);
  });

  it("NO numera: el orden es cronológico, no de mérito", async () => {
    // En la fila de cinco de la portada la posición dice algo. Aquí, un "1" junto a una cara
    // sugeriría que alguien va ganando, y lo único que pasó es que activó más tarde.
    await pintar([perfil(1), perfil(2), perfil(3)]);
    for (const t of tarjetas()) {
      expect(t.textContent ?? "", "la vitrina está numerando").not.toMatch(/^\s*\d/);
    }
  });

  it("y dice que esto NO es el ranking", async () => {
    // Es la confusión natural de una vitrina de caras ordenada.
    await pintar([perfil(1)]);
    expect(screen.getByText(/no es el ranking/i)).toBeTruthy();
  });

  it("enseña el nombre visible cuando lo hay, y el handle cuando no", async () => {
    await pintar([perfil(1, { displayName: "La Primera" }), perfil(2)]);
    expect(tarjetas()[0]!.textContent).toContain("La Primera");
    expect(tarjetas()[1]!.textContent).toContain("usuaria2");
  });
});

describe("sin destacados", () => {
  it("no pinta ni una tarjeta: la vitrina vacía NO se rellena", async () => {
    await pintar([]);
    expect(tarjetas()).toHaveLength(0);
  });

  it("y lo dice invitando", async () => {
    await pintar([]);
    expect(screen.getByText(/no hay ning[úu]n perfil destacado/i)).toBeTruthy();
    expect(screen.getByText(/puedes ser el primero/i)).toBeTruthy();
  });

  it("ningún nombre de la vieja maqueta aparece en ningún caso", async () => {
    for (const perfiles of [[], [perfil(1)]]) {
      cleanup();
      await pintar(perfiles);
      const texto = document.body.textContent ?? "";
      for (const inventado of ["sara_p", "laia10", "nico_skate", "bea"]) {
        expect(texto, `vuelve ${inventado}`).not.toContain(inventado);
      }
    }
  });
});

describe("un solo magenta: la acción es destacarse", () => {
  const magentas = () =>
    [...document.querySelectorAll("a, button")].filter((e) => e.className.includes("bg-action"));

  it("con destacados, uno solo, y lleva a /boosts", async () => {
    await pintar([perfil(1), perfil(2)]);
    expect(magentas()).toHaveLength(1);
    expect(magentas()[0]!.getAttribute("href")).toBe("/boosts");
  });

  it("y sin destacados sigue habiendo exactamente uno: el hueco invita a llenarlo", async () => {
    await pintar([]);
    expect(magentas()).toHaveLength(1);
    expect(magentas()[0]!.getAttribute("href")).toBe("/boosts");
  });

  it("las tarjetas NO compiten con él: mirar no es una acción", async () => {
    await pintar([perfil(1), perfil(2), perfil(3)]);
    for (const t of tarjetas()) {
      expect(t.className, "una tarjeta lleva el acento de acción").not.toContain("bg-action");
    }
  });
});
