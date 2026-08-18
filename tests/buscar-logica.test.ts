/**
 * BÚSQUEDA · piezas PURAS de la vista /buscar (sin red ni estado): validación de la consulta,
 * construcción de la URL del endpoint, y DESTINO de los chips de categoría (a /retos filtrado).
 */
import { describe, expect, it } from "vitest";

import {
  categoriaValida,
  consultaValida,
  hrefCategoria,
  urlBuscar,
} from "../src/app/(app)/(shell)/buscar/buscar-logica";
import { CATEGORIES } from "../src/config/constants";

describe("consultaValida", () => {
  it(">= 2 caracteres tras recortar", () => {
    expect(consultaValida("a")).toBe(false);
    expect(consultaValida(" a ")).toBe(false);
    expect(consultaValida("ab")).toBe(true);
    expect(consultaValida("  ab  ")).toBe(true);
  });
});

describe("urlBuscar", () => {
  it("construye q (recortado) + tipo; el cursor es opcional", () => {
    expect(urlBuscar({ q: " ana ", tipo: "usuarios" })).toBe("/api/buscar?q=ana&tipo=usuarios");
    expect(urlBuscar({ q: "reto x", tipo: "retos", cursor: "abc" })).toBe(
      "/api/buscar?q=reto+x&tipo=retos&cursor=abc",
    );
  });
});

describe("hrefCategoria", () => {
  it("destino /retos filtrado, para TODAS las claves reales", () => {
    for (const c of CATEGORIES) {
      expect(hrefCategoria(c.key)).toBe(`/retos?categoria=${c.key}`);
    }
  });
});

describe("categoriaValida", () => {
  it("acepta claves conocidas; null para desconocidas o vacías", () => {
    expect(categoriaValida("fitness")).toBe("fitness");
    expect(categoriaValida("noexiste")).toBeNull();
    expect(categoriaValida(null)).toBeNull();
    expect(categoriaValida(undefined)).toBeNull();
    expect(categoriaValida("")).toBeNull();
  });
});
