/**
 * La barra superior ya no es maqueta en su parte de avisos. Estructural, porque la regresión no rompe
 * nada visible en un test de comportamiento: bastaría volver a escribir el botón con su "3" para que el
 * invitado viera otra vez un recuento inventado — CERO datos falsos.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const barra = readFileSync(
  path.resolve(__dirname, "..", "src", "app", "(app)", "(shell)", "barra-superior.tsx"),
  "utf8",
)
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

describe("la campana de la barra", () => {
  it("es la real (`CampanaNotificaciones`) y SOLO se monta con sesión", () => {
    expect(barra).toMatch(/usuario \? <CampanaNotificaciones\b[^>]*noLeidas=\{noLeidas\}/);
  });

  it("no queda el recuento inventado de la maqueta", () => {
    expect(barra).not.toMatch(/sin leer\)|>\s*3\s*</);
  });
});
