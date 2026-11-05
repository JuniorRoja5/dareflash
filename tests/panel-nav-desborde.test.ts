/**
 * LA BARRA DEL PANEL NO HACE DESPLAZARSE LA PÁGINA EN HORIZONTAL (fase9-diseno).
 *
 * En móvil y tableta la barra de secciones es una fila con `overflow-x-auto`: lo que no cabe se
 * desplaza DENTRO de la barra. Pero cada insignia lleva un texto `sr-only` (posición absoluta), y un
 * elemento absoluto no lo recorta el `overflow` de un antepasado que no sea su bloque contenedor. Sin
 * `relative` en la barra, ese bloque era el documento: los textos escapaban del recorte y la página
 * ENTERA se desplazaba en horizontal (medido en el navegador: 511 px de más a 768, `scrollX` real).
 * Nada fallaba, solo se veía.
 *
 * Y la cabecera: a 390 px el total, el nombre del admin y «Salir» no cabían en una fila (el grupo
 * acababa en 532 px). El nombre y la palabra «pendientes» se quedan para cuando hay ancho.
 *
 * Para romperlo a propósito: quitar `relative` de la barra (rojo); volver a pintar el nombre sin
 * `hidden sm:inline` (rojo).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const leer = (...p: string[]) =>
  readFileSync(path.resolve(__dirname, "..", ...p), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

describe("el panel cabe en el ancho de un móvil", () => {
  it("la barra de secciones es el bloque contenedor de lo que recorta", () => {
    const nav = leer("src", "app", "panel", "panel-nav.tsx");
    const clase = /aria-label="Secciones del panel"\s*className="([^"]+)"/.exec(nav)?.[1] ?? "";
    expect(clase, "no se encontró la clase de la barra").toContain("overflow-x-auto");
    expect(clase.split(/\s+/)).toContain("relative");
    // Y la insignia sigue llevando su texto absoluto: si un día deja de tenerlo, este test sobra.
    expect(leer("src", "app", "panel", "insignia-pendientes.tsx")).toMatch(/sr-only/);
  });

  it("en la cabecera, el nombre de quien mira solo sale con ancho", () => {
    const layout = leer("src", "app", "panel", "layout.tsx");
    expect(layout).toMatch(
      /className="hidden max-w-\[40ch\] truncate[^"]*sm:inline"\s*>\s*\{nombre\}/,
    );
  });
});
