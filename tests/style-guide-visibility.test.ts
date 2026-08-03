/**
 * /style-guide es DEV-ONLY por construccion. Este test ata el invariante: en produccion la ruta se
 * oculta (404), en desarrollo se ve. Romper el predicado (p.ej. devolver siempre false) lo pone en
 * rojo. Es el pestillo que impide que la referencia interna de diseño acabe viva en produccion.
 */
import { describe, expect, it } from "vitest";

import { styleGuideHidden } from "../src/app/style-guide/visibility";

describe("/style-guide dev-only por construccion", () => {
  it("en PRODUCCION se oculta (404)", () => {
    expect(styleGuideHidden("production")).toBe(true);
  });

  it("en DESARROLLO es visible (es donde se revisa)", () => {
    expect(styleGuideHidden("development")).toBe(false);
  });

  it("fail-secure: cualquier valor que no sea 'development' oculta (undefined, 'test'...)", () => {
    expect(styleGuideHidden(undefined)).toBe(true);
    expect(styleGuideHidden("test")).toBe(true);
    expect(styleGuideHidden("prod")).toBe(true);
  });
});
