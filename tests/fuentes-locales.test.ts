/**
 * LAS FUENTES SALEN DEL REPOSITORIO, NO DE GOOGLE (pieza corta, 2026-11).
 *
 * `next/font/google` descarga las fuentes DURANTE `next build`, y esa descarga fallaba a veces: fue la
 * causa de los dos rojos de `docker-build` del 2026-11-06 (el mismo SHA pasaba en otra ejecución). Ahora
 * las fuentes van en `src/app/fuentes` —los MISMOS ficheros que servía Google, byte a byte— y el build se
 * hace SIN RED (`RUN --network=none` en el Dockerfile): si algo vuelve a querer descargar durante el
 * build, falla siempre y en el acto, no de vez en cuando.
 *
 * Lo que se fija:
 *  - ningún fichero importa `next/font/google`;
 *  - el paso del build del Dockerfile corre sin red;
 *  - los nueve trozos (por alfabeto) siguen ahí, cada uno con su `unicode-range`, y solo los latinos se
 *    precargan (como antes: el navegador baja solo el trozo que la página necesita);
 *  - las licencias OFL van junto a los ficheros;
 *  - los respaldos mientras carga tienen las métricas EXACTAS de antes (sin saltos de maquetación nuevos).
 *
 * Para romperlo a propósito: volver a importar `next/font/google` en el layout (rojo); quitar el
 * `--network=none` (rojo); poner `preload: true` en un trozo no latino (rojo); cambiar el `size-adjust`
 * del respaldo de Archivo (rojo).
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { etapaDockerfile } from "./helpers/dockerfile";

const RAIZ = path.resolve(__dirname, "..");
const FUENTES = path.join(RAIZ, "src", "app", "fuentes");
const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function ficherosDeCodigo(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) return f === "generated" ? [] : ficherosDeCodigo(p);
    return /\.(ts|tsx|css)$/.test(f) ? [p] : [];
  });
}

describe("las fuentes, sin Google", () => {
  it("ningún fichero de src importa next/font/google", () => {
    const culpables = ficherosDeCodigo(path.join(RAIZ, "src"))
      .filter((f) => /next\/font\/google/.test(sinComentarios(readFileSync(f, "utf8"))))
      .map((f) => path.relative(RAIZ, f));
    expect(culpables).toEqual([]);
  });

  it("y el build del Dockerfile corre SIN RED", () => {
    const linea = etapaDockerfile("builder")
      .split("\n")
      .find((l) => l.includes("npm run build"));
    expect(linea).toMatch(/^RUN --network=none /);
  });
});

describe("los nueve trozos, como los servía Google", () => {
  const modulo = sinComentarios(readFileSync(path.join(FUENTES, "index.ts"), "utf8"));
  const llamadas = [...modulo.matchAll(/localFont\(\{([\s\S]*?)\n\}\);/g)].map((m) => m[1]!);

  it("una llamada por fichero, y cada fichero existe", () => {
    expect(llamadas).toHaveLength(9);
    for (const c of llamadas) {
      const src = /src: "\.\/([^"]+\.woff2)"/.exec(c)?.[1];
      expect(src, c.slice(0, 60)).toBeDefined();
      expect(existsSync(path.join(FUENTES, src!)), src).toBe(true);
    }
  });

  it("cada trozo con su unicode-range; solo los latinos se precargan; ninguno calcula su respaldo", () => {
    for (const c of llamadas) {
      const src = /src: "\.\/([^"]+)"/.exec(c)![1]!;
      expect(c, src).toMatch(/prop: "unicode-range"/);
      expect(c, src).toMatch(/adjustFontFallback: false/);
      const latino = /-latin\.woff2$/.test(src);
      expect(c, src).toMatch(latino ? /preload: true/ : /preload: false/);
    }
  });

  it("las licencias OFL van junto a los ficheros", () => {
    for (const lic of ["OFL-Archivo.txt", "OFL-IBM-Plex-Sans.txt"]) {
      expect(readFileSync(path.join(FUENTES, lic), "utf8")).toMatch(/SIL Open Font License/);
    }
  });
});

describe("los respaldos mientras carga: las métricas de antes, exactas", () => {
  const css = readFileSync(path.join(RAIZ, "src", "app", "globals.css"), "utf8");
  const cara = (familia: string) =>
    new RegExp(`@font-face \\{\\s*font-family: "${familia}";([^}]*)\\}`).exec(css)?.[1] ?? "";

  it("Archivo: 98.7 % / 88.96 % / 21.28 % (las de next/font/google)", () => {
    const c = cara("DareFlash Archivo Respaldo");
    expect(c).toMatch(/size-adjust: 98\.7%;/);
    expect(c).toMatch(/ascent-override: 88\.96%;/);
    expect(c).toMatch(/descent-override: 21\.28%;/);
  });

  it("Plex: 101.17 % / 101.32 % / 27.18 %", () => {
    const c = cara("DareFlash Plex Respaldo");
    expect(c).toMatch(/size-adjust: 101\.17%;/);
    expect(c).toMatch(/ascent-override: 101\.32%;/);
    expect(c).toMatch(/descent-override: 27\.18%;/);
  });

  it("y la pila termina en esos respaldos (puestos antes, taparían a los trozos de detrás)", () => {
    const modulo = readFileSync(path.join(FUENTES, "index.ts"), "utf8");
    expect(modulo).toMatch(/"DareFlash Archivo Respaldo",?\s*\)/);
    expect(modulo).toMatch(/"DareFlash Plex Respaldo",?\s*\)/);
  });
});
