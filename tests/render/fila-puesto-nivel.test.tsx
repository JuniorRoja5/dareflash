/**
 * EL NIVEL EN EL PODIO — render real de `FilaPuesto`.
 *
 * Antes se retiraba el nivel a los CINCO en las filas de podio, y era pasarse: el problema no era "el
 * podio", era el ORO. La fila marca el puesto 1/2/3 con `--df-rank`, y ese es el token que comparte
 * Legend; verde, fuego y cian conviven con el oro sin estorbarlo.
 *
 * Para romperlo: retirar el anillo a todos en el podio otra vez (rojo), o dejar que Legend lo pinte
 * encima del marcador dorado (rojo).
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { FilaPuesto } from "@/components/ui/fila-puesto";
import { NIVELES } from "@/lib/niveles";

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

const nivelDe = (c: HTMLElement) =>
  c.querySelector("[data-nivel]")?.getAttribute("data-nivel") ?? null;

describe("en el PODIO (puestos 1, 2 y 3)", () => {
  it("los niveles que NO se pisan con el oro sí pintan su anillo", () => {
    for (const n of NIVELES.filter((x) => x.emblema && x.clave !== "legend")) {
      for (const puesto of [1, 2, 3]) {
        expect(nivelDe(pintar(puesto, n.minimo)), `${n.clave} en el puesto ${puesto}`).toBe(
          n.clave,
        );
      }
    }
  });

  it("LEGEND no: su oro es el MISMO token que marca el puesto", () => {
    for (const puesto of [1, 2, 3]) {
      expect(nivelDe(pintar(puesto, 10_000)), `puesto ${puesto}`).toBeNull();
    }
    // Y el marcador de puesto sigue en su sitio: lo que se retira es el nivel, no la medalla.
    expect(pintar(1, 10_000).querySelector(".df-puesto-podio")).not.toBeNull();
  });
});

describe("fuera del podio (4 en adelante)", () => {
  it("todos pintan su anillo, Legend incluido: ahí no hay oro con el que chocar", () => {
    for (const n of NIVELES.filter((x) => x.emblema)) {
      expect(nivelDe(pintar(4, n.minimo)), n.clave).toBe(n.clave);
    }
  });

  it("sin puntos no hay anillo, esté en el puesto que esté", () => {
    expect(nivelDe(pintar(4))).toBeNull();
    expect(nivelDe(pintar(1))).toBeNull();
  });
});
