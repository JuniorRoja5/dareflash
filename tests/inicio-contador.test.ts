/**
 * Inicio — formato de contadores PURO con dientes (Paso C · feed). < 1000 tal cual; miles -> "K";
 * millones -> "M". Romper el formato (no compactar) cae en rojo. Lo demas del feed (VOTA unico
 * magenta, pildora neutra) viaja por construccion con las primitivas / los tokens.
 */
import { describe, expect, it } from "vitest";

import { formatearContador } from "../src/app/(app)/_inicio/inicio-datos";

describe("formatearContador", () => {
  it("por debajo de 1000 se muestra tal cual", () => {
    expect(formatearContador(0)).toBe("0");
    expect(formatearContador(342)).toBe("342");
    expect(formatearContador(999)).toBe("999");
  });

  it("miles -> K (con 1 decimal, sin .0)", () => {
    expect(formatearContador(1000)).toBe("1K");
    expect(formatearContador(1200)).toBe("1.2K");
    expect(formatearContador(12400)).toBe("12.4K");
    expect(formatearContador(210000)).toBe("210K");
  });

  it("millones -> M", () => {
    expect(formatearContador(1_200_000)).toBe("1.2M");
    expect(formatearContador(5_000_000)).toBe("5M");
  });
});
