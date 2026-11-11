/**
 * LA LISTA DE RETOS DEL PANEL CABE EN UN MÓVIL (Fase 9 · P14, revisión).
 *
 * La tabla «Retos existentes» iba también en móvil, con un `min-w-[720px]` y la promesa de que
 * «scrolleaba en su propio contenedor». No lo hacía: en la columna única del panel, la celda de la
 * rejilla crecía hasta lo que medía la tabla y la página ENTERA se desplazaba en horizontal (medido en el
 * navegador a 390: 1174 px de documento). Nada fallaba, solo se veía.
 *
 * El arreglo es la regla de diseño, como en las colas de empresas y propuestas: tabla desde `md`,
 * tarjetas debajo. Y la sección lleva `min-w-0`, para que entre `md` y `lg` la tabla se desplace dentro
 * de su contenedor en vez de ensanchar la página.
 *
 * Para romperlo a propósito: quitar `hidden` (o `md:block`) del contenedor de la tabla (rojo); quitar
 * `md:hidden` de las tarjetas (rojo); quitar `min-w-0` de la sección (rojo).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const leer = (...p: string[]) =>
  readFileSync(path.resolve(__dirname, "..", ...p), "utf8")
    .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const clases = (s: string) => s.split(/\s+/);

describe("la lista de retos del panel no desplaza la página a 390", () => {
  const lista = leer("src", "app", "panel", "lista-retos.tsx");

  it("la tabla solo sale desde md", () => {
    // El contenedor INMEDIATO de la tabla: el último className antes de `<table`.
    const antes = lista.slice(0, lista.indexOf("<table"));
    const contenedor = [...antes.matchAll(/className="([^"]+)"/g)].pop()?.[1] ?? "";
    expect(contenedor, "no se encontró el contenedor de la tabla").toContain("overflow-x-auto");
    expect(clases(contenedor)).toContain("hidden");
    expect(clases(contenedor)).toContain("md:block");
  });

  it("en móvil, tarjetas, una por reto, y se esconden desde md", () => {
    const m = /<ul className="([^"]+)">\s*\{retos\.map/.exec(lista);
    expect(m, "no se encontró la lista de tarjetas").not.toBeNull();
    expect(clases(m![1] ?? "")).toContain("md:hidden");
    expect(lista).toMatch(/data-reto-movil=\{r\.id\}/);
  });

  it("las dos vistas ofrecen los MISMOS botones (una sola pieza, montada dos veces)", () => {
    expect(lista.match(/<AccionesReto\b/g)).toHaveLength(2);
    expect(lista.match(/>\s*Gestionar\s*</g)).toHaveLength(1);
  });

  it("la sección de la lista no crece con la tabla (min-w-0)", () => {
    const panel = leer("src", "app", "panel", "retos-panel.tsx");
    const m = /<section className="([^"]+)">\s*<h2[^>]*>\s*Retos existentes/.exec(panel);
    expect(m, "no se encontró la sección de la lista").not.toBeNull();
    expect(clases(m![1] ?? "")).toContain("min-w-0");
  });
});
