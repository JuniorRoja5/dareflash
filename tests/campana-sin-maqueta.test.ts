/**
 * La barra superior ya no es maqueta en su parte de avisos. Estructural, porque la regresión no rompe
 * nada visible en un test de comportamiento: bastaría volver a escribir el botón con su "3" para que el
 * invitado viera otra vez un recuento inventado — CERO datos falsos.
 *
 * Y el número de la campana sale del contador COMPARTIDO de avisos, no de un estado propio: dos estados
 * (el de la campana y el del icono de Perfil) podrían contradecirse, y uno quieto fue justo el defecto.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const leer = (...partes: string[]): string =>
  readFileSync(path.resolve(__dirname, "..", "src", "app", "(app)", ...partes), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

describe("la campana de la barra", () => {
  it("es la real (`CampanaNotificaciones`) y SOLO se monta con sesión", () => {
    expect(leer("(shell)", "barra-superior.tsx")).toMatch(/usuario \? <CampanaNotificaciones\b/);
  });

  it("no queda el recuento inventado de la maqueta", () => {
    expect(leer("(shell)", "barra-superior.tsx")).not.toMatch(/sin leer\)|>\s*3\s*</);
  });

  it("su número sale del contador compartido, igual que el del icono de Perfil", () => {
    expect(leer("(shell)", "campana-notificaciones.tsx")).toMatch(/useNoLeidas\(\)/);
    expect(leer("nav-activa.tsx")).toMatch(/useNoLeidas\(\)/);
    // Y el proveedor que lo lleva envuelve el armazón entero (campana y barra inferior dentro).
    expect(leer("layout.tsx")).toMatch(/<ProveedorAvisos\b/);
  });
});
