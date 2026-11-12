/**
 * LA PORTADA EN 3D SUTIL (rediseño de /inicio): las imágenes y el movimiento.
 *
 * Lo que se fija, porque cada cosa se puede deshacer sin que nada falle a la vista:
 *  - IMÁGENES: cada pieza existe en `public/img/3d` para los dos temas, en los dos tamaños y los dos
 *    formatos, con su tamaño real (sin estirar) y por debajo de 80 KB. El color sale de los tokens
 *    (el script no lleva ningún hex), y los originales no entran ni en git ni en la imagen.
 *  - MOVIMIENTO: la inclinación solo se enciende con puntero fino que pasa por encima, sin
 *    reduced-motion y sin Save-Data; el rayo se para con reduced-motion de forma EXPLÍCITA (la regla
 *    global acorta duraciones, y a una animación atada al scroll eso no la para); Save-Data lo apaga
 *    todo; el destacado ya no flota solo.
 *  - PROFUNDIDAD por LUMINOSIDAD, no por sombra, en las tarjetas que se inclinan (MARCA.md).
 *
 * Para romperlo a propósito: borrar una de las imágenes (rojo); quitar el `prefers-reduced-motion`
 * del `Inclinable` (rojo); quitar la regla explícita del rayo bajo reduced-motion (rojo); volver a
 * poner `shadow-[var(--df-shadow-md)]` en la tarjeta de la rejilla (rojo); escribir un hex en el script
 * (rojo).
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { PIEZAS_3D } from "../src/components/ui/imagen-3d";

const RAIZ = path.resolve(__dirname, "..");
const leer = (...p: string[]) => readFileSync(path.join(RAIZ, ...p), "utf8");
const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("las imágenes 3D", () => {
  const ficheros = Object.entries(PIEZAS_3D).flatMap(([pieza, anchos]) =>
    ["oscuro", "claro"].flatMap((tema) =>
      anchos.flatMap((ancho) =>
        ["avif", "webp"].map((ext) => ({
          ruta: path.join(RAIZ, "public", "img", "3d", `${pieza}-${tema}-${ancho}.${ext}`),
          ancho,
        })),
      ),
    ),
  );

  it("cada pieza, en los dos temas, los dos tamaños y los dos formatos, de ≤ 80 KB", () => {
    expect(ficheros.length).toBe(Object.keys(PIEZAS_3D).length * 8);
    for (const f of ficheros) {
      expect(existsSync(f.ruta), path.basename(f.ruta)).toBe(true);
      expect(statSync(f.ruta).size, path.basename(f.ruta)).toBeLessThanOrEqual(80 * 1024);
    }
  });

  it("con su tamaño real (nada estirado: los originales son de 512 px)", async () => {
    for (const f of ficheros.filter((x) => x.ruta.endsWith(".webp"))) {
      const m = await sharp(f.ruta).metadata();
      expect(m.width, path.basename(f.ruta)).toBe(f.ancho);
      expect(m.hasAlpha, path.basename(f.ruta)).toBe(true);
      expect(f.ancho).toBeLessThanOrEqual(512);
    }
  });

  it("el color sale de los tokens: el script no lleva ni un hex", () => {
    const script = sinComentarios(leer("scripts", "optimizar-recursos-3d.mjs"));
    expect(script).not.toMatch(/#[0-9a-fA-F]{6}\b/);
    expect(script).toMatch(/df-action/);
    expect(script).toMatch(/df-money/);
    expect(script).toMatch(/df-rank/);
  });

  it("los originales, fuera del repositorio y de la imagen", () => {
    expect(leer(".gitignore")).toMatch(/^\/recursos\/$/m);
    expect(leer(".dockerignore")).toMatch(/^recursos$/m);
  });
});

describe("el movimiento", () => {
  const inclinable = sinComentarios(leer("src", "components", "ui", "inclinable.tsx"));
  const css = leer("src", "app", "globals.css");

  it("la inclinación solo con puntero fino, sin reduced-motion y sin Save-Data", () => {
    expect(inclinable).toMatch(/\(hover: hover\) and \(pointer: fine\)/);
    expect(inclinable).toMatch(/!window\.matchMedia\("\(prefers-reduced-motion: reduce\)"\)/);
    expect(inclinable).toMatch(/!el\.closest\("\[data-ahorro\]"\)/);
    // Y el CSS solo enciende el brillo cuando el componente se ha encendido.
    expect(css).toMatch(/\.df-inclinable\[data-inclina\]:hover \.df-brillo/);
  });

  it("el rayo se para con reduced-motion de forma EXPLÍCITA (atado al scroll no tiene duración)", () => {
    // DENTRO del bloque global, y no en uno aparte (los tests de la red global leerían el primero).
    const i = css.indexOf("@media (prefers-reduced-motion: reduce)");
    const bloque = css.slice(i, css.indexOf("\n}", i));
    expect(bloque).toMatch(/\*,/);
    expect(bloque).toMatch(/\.df-rayo \{\s*animation: none !important;/);
    expect(css.split("@media (prefers-reduced-motion: reduce)")).toHaveLength(2);
  });

  it("Save-Data: la página lo lee de la cabecera y `data-ahorro` lo apaga todo", () => {
    const pagina = leer("src", "app", "(app)", "(shell)", "inicio", "page.tsx");
    expect(pagina).toMatch(/get\("save-data"\)/);
    expect(pagina).toMatch(/data-ahorro=\{ahorro \? "1" : undefined\}/);
    expect(css).toMatch(/\[data-ahorro\] \.df-rayo,\s*\[data-ahorro\] \.df-rise,/);
  });

  it("el barrido `df-sheen` no se mueve en la portada (había una docena a la vez), ni con Save-Data", () => {
    for (const f of [
      ["src", "app", "(app)", "(shell)", "retos", "tarjeta-vertical.tsx"],
      ["src", "app", "(app)", "(shell)", "inicio", "hero-destacado.tsx"],
    ]) {
      expect(sinComentarios(leer(...f)), f.at(-1)).not.toMatch(/df-sheen/);
    }
    // La tarjeta compartida con /retos (Próximos) se para DENTRO de la portada.
    expect(css).toMatch(/\[data-portada\] \.df-sheen::after \{\s*animation: none;/);
    expect(leer("src", "app", "(app)", "(shell)", "inicio", "page.tsx")).toMatch(/data-portada\b/);
    expect(css).toMatch(/\[data-ahorro\] \.df-sheen::after \{\s*animation: none !important;/);
  });

  it("el destacado ya no flota solo (con el rayo y el recuento serían tres cosas moviéndose)", () => {
    const hero = sinComentarios(
      leer("src", "app", "(app)", "(shell)", "inicio", "hero-destacado.tsx"),
    );
    expect(hero).not.toMatch(/df-float/);
  });
});

describe("profundidad por luminosidad, no por sombra", () => {
  it("las tarjetas que se inclinan no usan las sombras de profundidad", () => {
    for (const f of [
      ["src", "app", "(app)", "(shell)", "retos", "tarjeta-vertical.tsx"],
      ["src", "app", "(app)", "(shell)", "inicio", "hero-destacado.tsx"],
    ]) {
      const c = sinComentarios(leer(...f));
      expect(c, f.at(-1)).toMatch(/<Inclinable/);
      expect(c, f.at(-1)).not.toMatch(/--df-shadow-(sm|md|lg)/);
    }
  });
});
