/**
 * Dinero en céntimos enteros (M5), PURO. Con dientes: la conversión importe->céntimos usa aritmética
 * entera (no `* 100` en float) y rechaza formatos inválidos.
 */
import { describe, expect, it } from "vitest";

import { centimosAImporte, importeACentimos } from "../src/lib/dinero";

describe("importeACentimos", () => {
  it("convierte importes válidos (coma o punto, hasta 2 decimales) a céntimos enteros", () => {
    expect(importeACentimos("20")).toBe(2000);
    expect(importeACentimos("20.5")).toBe(2050);
    expect(importeACentimos("20,50")).toBe(2050);
    expect(importeACentimos("0")).toBe(0);
    expect(importeACentimos("  1.05  ")).toBe(105);
    // 20.10 * 100 en float da 2009.9999...; con aritmética entera es exacto.
    expect(importeACentimos("20.10")).toBe(2010);
  });

  it("rechaza formatos inválidos -> null", () => {
    expect(importeACentimos("")).toBeNull();
    expect(importeACentimos("abc")).toBeNull();
    expect(importeACentimos("20.999")).toBeNull(); // más de 2 decimales
    expect(importeACentimos("-5")).toBeNull(); // negativo
    expect(importeACentimos("1e3")).toBeNull();
  });
});

describe("centimosAImporte", () => {
  it("formatea céntimos a importe con 2 decimales", () => {
    expect(centimosAImporte(2000)).toBe("20.00");
    expect(centimosAImporte(2050)).toBe("20.50");
    expect(centimosAImporte(5)).toBe("0.05");
    expect(centimosAImporte(0)).toBe("0.00");
  });
});
