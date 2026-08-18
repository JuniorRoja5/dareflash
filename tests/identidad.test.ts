/**
 * Identidad en la UI (pieza pura). Regla TikTok/YouTube: el displayName manda; el @handle es
 * secundario y solo si hay displayName. Con dientes: preferir el handle sobre el displayName (el bug
 * que destapó P1) cae en rojo.
 */
import { describe, expect, it } from "vitest";

import { mostrarHandleSecundario, nombreMostrado } from "../src/lib/identidad";

describe("nombreMostrado", () => {
  it("con displayName -> el displayName (NO el handle)", () => {
    expect(nombreMostrado("Yuyu", "user_ab12cd")).toBe("Yuyu");
  });

  it("sin displayName (null/undefined/vacío/espacios) -> el handle hace de nombre", () => {
    expect(nombreMostrado(null, "user_ab12cd")).toBe("user_ab12cd");
    expect(nombreMostrado(undefined, "yuyu")).toBe("yuyu");
    expect(nombreMostrado("", "yuyu")).toBe("yuyu");
    expect(nombreMostrado("   ", "yuyu")).toBe("yuyu");
  });

  it("recorta el displayName", () => {
    expect(nombreMostrado("  Ana  ", "ana99")).toBe("Ana");
  });
});

describe("mostrarHandleSecundario", () => {
  it("hay displayName -> sí se muestra el @handle debajo", () => {
    expect(mostrarHandleSecundario("Yuyu")).toBe(true);
  });

  it("no hay displayName -> NO se muestra (el handle ya es el nombre, no duplicar)", () => {
    expect(mostrarHandleSecundario(null)).toBe(false);
    expect(mostrarHandleSecundario(undefined)).toBe(false);
    expect(mostrarHandleSecundario("")).toBe(false);
    expect(mostrarHandleSecundario("   ")).toBe(false);
  });
});
