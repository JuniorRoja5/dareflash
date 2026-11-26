/**
 * Inicio · formato de contadores PURO con dientes (Paso C · feed). < 1000 tal cual; desde mil, la forma
 * COMPACTA DEL IDIOMA (P5b2b, del formateador único): en inglés, la de siempre («1.2K», «5M»); en
 * español, la suya («1,2 mil», «1,2 M»), y no el punto decimal inglés que salía antes. Romper el
 * formato (no compactar, o volver a escribirlo a mano) cae en rojo.
 */
import { describe, expect, it } from "vitest";

import { formatearContador } from "../src/components/feed/feed-datos";

/** El espacio que pone `Intl` puede ser de no separación: se compara la forma, no el carácter. */
const es = (n: number) => formatearContador(n, "es").replace(/\s/g, " ");

describe("formatearContador", () => {
  it("por debajo de 1000 se muestra tal cual", () => {
    for (const idioma of ["es", "en"] as const) {
      expect(formatearContador(0, idioma)).toBe("0");
      expect(formatearContador(342, idioma)).toBe("342");
      expect(formatearContador(999, idioma)).toBe("999");
    }
  });

  it("en inglés, miles -> K y millones -> M (con 1 decimal, sin .0): lo de siempre", () => {
    expect(formatearContador(1000, "en")).toBe("1K");
    expect(formatearContador(1200, "en")).toBe("1.2K");
    expect(formatearContador(12400, "en")).toBe("12.4K");
    expect(formatearContador(210000, "en")).toBe("210K");
    expect(formatearContador(1_200_000, "en")).toBe("1.2M");
    expect(formatearContador(5_000_000, "en")).toBe("5M");
  });

  it("en español, la forma española: «mil» y coma decimal", () => {
    expect(es(1000)).toBe("1 mil");
    expect(es(1200)).toBe("1,2 mil");
    expect(es(12400)).toBe("12,4 mil");
    expect(es(210000)).toBe("210 mil");
    expect(es(1_200_000)).toBe("1,2 M");
    expect(es(5_000_000)).toBe("5 M");
  });
});
