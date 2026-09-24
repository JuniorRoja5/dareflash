/**
 * EL ORO NO SE PISA CON EL ORO — render real de `FilaPuesto`.
 *
 * La fila marca el puesto 1/2/3 con el ORO del podio, y Legend lleva ESE MISMO oro (el token
 * `--df-rank`, compartido a propósito: medalla y corona dicen las dos "lo más alto"). Dos dorados
 * pegados con dos significados no se leen, así que donde el oro ya está haciendo de puesto el emblema
 * se retira y el nivel lo dice la insignia de texto que va al lado.
 *
 * Para romperlo: pasar `puntos` también en las filas de podio (rojo), o quitarle el emblema a las
 * filas normales (rojo).
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { FilaPuesto } from "@/components/ui/fila-puesto";

afterEach(cleanup);

const pintar = (puesto: number, puntos?: number) =>
  render(
    <FilaPuesto
      puesto={puesto}
      username="yuyu"
      imagen={null}
      cifra={3}
      unidad="victorias"
      puntos={puntos}
    />,
  ).container;

describe("filas de PODIO (1, 2 y 3)", () => {
  it("no pintan emblema, ni siquiera a un Legend", () => {
    for (const puesto of [1, 2, 3]) {
      const c = pintar(puesto, 10_000);
      expect(c.querySelector("svg"), `puesto ${puesto}`).toBeNull();
    }
  });

  it("y el puesto sigue marcado en oro: lo que se retira es el nivel, no la medalla", () => {
    const c = pintar(1, 10_000);
    expect(c.querySelector(".df-puesto-podio")).not.toBeNull();
  });
});

describe("filas normales (4 en adelante)", () => {
  it("sí pintan el emblema del nivel", () => {
    const c = pintar(4, 10_000);
    const svg = c.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("aria-label")).toBe("Nivel Legend");
  });

  it("sin puntos no hay emblema, esté en el puesto que esté", () => {
    expect(pintar(4).querySelector("svg")).toBeNull();
    expect(pintar(1).querySelector("svg")).toBeNull();
  });
});
