/**
 * EL FEED NO SE ANIMA, Y LA MARCA DE BOOST TAMPOCO.
 *
 * ┌─ POR QUÉ ESTO ES ESTRUCTURAL Y NO UN TEST DE RENDER ──────────────────────────────────────────┐
 * │ La promesa es "en el feed no hay animación continua", y eso es una afirmación sobre TODO el    │
 * │ componente, no sobre las pantallas que alguien se acordó de montar. Un test de render solo ve  │
 * │ lo que monta; el agujero está en el trozo que nadie montó. Es la misma lección que el nivel en │
 * │ los avatares: cada pantalla verde por separado y la promesa falsa durante una versión entera.  │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * El feed es lo más caro de la app: un halo que respira o un flote por slide compite con el vídeo y
 * se paga en cada scroll. La marca de Boost resalta con aro y palabra, quietos.
 *
 * NO PROHÍBE LAS TRANSICIONES DE INTERACCIÓN (un `hover` que cambia de color al pasar por encima no
 * corre solo); lo que se prohíbe es el movimiento CONTINUO: `animate-*`, las utilidades `df-float` /
 * `df-sheen` / `df-halo` y los `@keyframes` propios.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();
const crudo = (...p: string[]) => readFileSync(join(RAIZ, ...p), "utf8");
/** Sin comentarios: los docblocks EXPLICAN que aquí no se anima, y explicarlo no es cumplirlo. */
const leer = (...p: string[]) =>
  crudo(...p)
    .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const FEED = ["src", "components", "feed", "feed-vertical.tsx"];
const MARCA = ["src", "components", "ui", "marca-boost.tsx"];

/** Movimiento que corre SOLO, sin que nadie interactúe. */
const CONTINUO = /animate-|df-float|df-sheen|df-halo|df-rise|df-barra|@keyframes|animation:/;

describe("el feed de vídeo", () => {
  it("no monta movimiento continuo", () => {
    expect(leer(...FEED), "el feed se anima").not.toMatch(CONTINUO);
  });

  it("y el bloque de autor con su marca tampoco", () => {
    expect(leer(...MARCA), "la marca de Boost se anima").not.toMatch(CONTINUO);
  });

  it("ni se mueve desde JS, que se saltaría `prefers-reduced-motion`", () => {
    // La regla global apaga animaciones y transiciones con `!important`, pero no puede apagar un
    // bucle de `requestAnimationFrame`.
    for (const ruta of [FEED, MARCA]) {
      expect(leer(...ruta), ruta.join("/")).not.toMatch(/requestAnimationFrame|\.animate\(/);
    }
  });
});

describe("la marca sale de la primitiva, no copiada en cada sitio", () => {
  it("el feed no dibuja su propia etiqueta de Boost", () => {
    const feed = leer(...FEED);
    expect(feed).toContain("AutorFeed");
    // Ni la palabra a mano ni un aro propio: eso serían dos copias más que divergir (el feed pinta
    // DOS maquetas, móvil y escritorio, y ya divergieron una vez).
    expect(feed, "el feed escribe su propia marca").not.toMatch(/>Boost</);
    expect(feed, "el feed dibuja su propio aro").not.toMatch(/--df-action/);
  });

  it("y la tarjeta de la vitrina usa la MISMA", () => {
    const tarjeta = leer("src", "components", "ui", "tarjeta-destacado.tsx");
    expect(tarjeta).toContain("<MarcaBoost");
    expect(tarjeta, "la tarjeta volvió a escribir la palabra a mano").not.toMatch(/>\s*Boost\s*</);
  });
});

describe("el detector mira el CÓDIGO, no el comentario", () => {
  it("quitar comentarios cambia los ficheros", () => {
    for (const ruta of [FEED, MARCA]) {
      expect(leer(...ruta).length, ruta.join("/")).toBeLessThan(crudo(...ruta).length);
    }
    // Control real: los dos ficheros NOMBRAN en prosa el movimiento que no tienen.
    expect(crudo(...MARCA)).toMatch(/halo que respira|flote/);
    expect(leer(...MARCA)).not.toMatch(/halo que respira/);
  });
});
