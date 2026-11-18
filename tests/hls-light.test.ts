/**
 * hls.js LIGHT, BAJO DEMANDA Y PRIMERO (Fase 11 · P1c). Test ESTRUCTURAL.
 *
 * Por qué existe: `hls.js` completo pesaba ~172 KB gzip en `/feed` (el 42 % de lo que descarga). El
 * build `hls.js/light` hace lo mismo para lo que usamos (sin subtítulos, audio alternativo, DRM, CMCD
 * ni intersticiales) por ~62 KB gzip menos (medido en `/feed`), en todos los navegadores. Lo que fija:
 *
 * 1. Solo se pide `hls.js/light`, y solo por `import()` dinámico: volver a `import("hls.js")` (el
 *    completo) o importarlo de forma estática en cualquier fichero es rojo, nombrando dónde.
 * 2. Ningún `"use client"` lo arrastra por un import ESTÁTICO (recorredor de la P1b): iría en el JS de
 *    la página antes de que haya un vídeo en pantalla.
 * 3. El ORDEN del reproductor no cambia: hls.js primero, HLS nativo solo como último recurso. El token
 *    de Bunny va en la QUERY y el nativo no lo propaga a los segmentos (rutas relativas) → 403 en
 *    Safari/iOS si se invirtiera. Y el docblock cuenta ese orden, no el contrario (lo contaba).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  RAIZ,
  cadenaHasta,
  esCliente,
  ficherosDeSrc,
  rel,
  sinComentarios,
} from "./helpers/grafo-imports";

const esHls = (espec: string) => espec === "hls.js" || espec.startsWith("hls.js/");
const todos = ficherosDeSrc();
const REPRODUCTOR = "src/components/ui/reproductor-hls.tsx";
const reproductor = readFileSync(path.join(RAIZ, REPRODUCTOR), "utf8");

describe("hls.js: solo el build light, y solo bajo demanda", () => {
  it("todo import() de hls.js pide `hls.js/light` (el completo pesa ~62 KB gzip más)", () => {
    const dinamicos = todos.flatMap((f) =>
      [...sinComentarios(readFileSync(f, "utf8")).matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)]
        .map((m) => m[1]!)
        .filter(esHls)
        .map((espec) => `${rel(f)}: import("${espec}")`),
    );
    // Control positivo: hay exactamente uno, el del reproductor. Si desapareciera (o cambiara de forma
    // y el regex dejara de verlo), el caso de abajo pasaría a verde sin mirar nada.
    expect(dinamicos).toEqual([`${REPRODUCTOR}: import("hls.js/light")`]);
  });

  it("ningún fichero importa hls.js de forma ESTÁTICA por valor (solo `import type`, que se borra)", () => {
    // Sin los `.d.ts`: son solo tipos (el de `hls.js/light` reexporta los del paquete) y no generan JS.
    const estaticos = todos
      .filter((f) => !f.endsWith(".d.ts"))
      .flatMap((f) =>
        [
          ...sinComentarios(readFileSync(f, "utf8")).matchAll(
            /(?:^|\n)\s*(?:import|export)\s+(?!type\s)(?:[^;'"]*?\s+from\s+)?["'](hls\.js(?:\/[^"']*)?)["']/g,
          ),
        ].map((m) => `${rel(f)}: ${m[1]}`),
      );
    expect(estaticos).toEqual([]);
  });

  it("ningún `use client` llega a hls.js por una cadena de imports estáticos", () => {
    const clientes = todos.filter((f) => esCliente(readFileSync(f, "utf8")));
    expect(clientes.length).toBeGreaterThan(80);
    const cadenas = clientes
      .map((c) => cadenaHasta(c, esHls, undefined, { dinamicos: false }))
      .filter((c): c is string[] => c !== null)
      .map((c) => c.join(" -> "));
    expect(cadenas, `hls.js entraría en el JS de la página:\n${cadenas.join("\n")}`).toEqual([]);
    // Y el detector muerde: CON los dinámicos, el reproductor sí llega (es su `import()`).
    expect(cadenaHasta(path.join(RAIZ, REPRODUCTOR), esHls)).toEqual([REPRODUCTOR, "hls.js/light"]);
  });
});

describe("el orden del reproductor: hls.js primero, nativo como último recurso", () => {
  it("se intenta hls.js ANTES de mirar si el navegador reproduce HLS por su cuenta", () => {
    const codigo = sinComentarios(reproductor);
    const hls = codigo.indexOf('import("hls.js/light")');
    const nativo = codigo.indexOf("canPlayType(HLS_NATIVO)");
    expect(hls).toBeGreaterThan(-1);
    expect(nativo).toBeGreaterThan(-1);
    expect(hls).toBeLessThan(nativo);
    // El nativo solo si hls.js no corre.
    expect(codigo).toMatch(/if \(!usaHlsJs\) \{\s*if \(video\.canPlayType\(HLS_NATIVO\)\)/);
  });

  it("el docblock cuenta ESE orden y su porqué (antes prometía el nativo primero)", () => {
    const doc = /\/\*\*[\s\S]*?\*\/\s*type Variante/.exec(reproductor)?.[0] ?? "";
    expect(doc, "no encuentro el docblock del reproductor").not.toBe("");
    expect(doc).not.toMatch(/HLS NATIVO donde el navegador lo soporta/);
    expect(doc).toMatch(/`hls\.js` PRIMERO/);
    expect(doc).toMatch(/último recurso/);
    expect(doc).toMatch(/QUERY/);
    expect(doc).toMatch(/RELATIVAS/);
  });
});
