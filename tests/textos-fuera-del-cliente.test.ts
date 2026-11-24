/**
 * NINGÚN DICCIONARIO VIAJA EN EL JAVASCRIPT DEL NAVEGADOR (Fase 11 · P5b1) — estructural.
 *
 * Los diccionarios (`src/textos/es.ts`, y en la P5c `en.ts` y `de.ts`) solo los importa el servidor
 * (`textos/servidor`). Un componente de cliente recibe SOLO sus espacios, como props, desde el servidor;
 * si un `"use client"` llegara a importar un diccionario por cualquier cadena de imports, el diccionario
 * ENTERO —todos los textos de la app— iría en el JS de esa página. Esto recorre el grafo de imports POR
 * VALOR (un `import type` se borra al compilar y no cuenta) desde cada fichero de cliente y nombra la
 * cadena si llega. La SEGUNDA red, sobre el build de verdad, está en `ci-revisar-imagenes.sh` (busca la
 * marca `__idioma` en los trozos de la imagen web) y en `check-build-sin-env`.
 *
 * Para romperlo: `import { es } from "@/textos/es"` en un componente de cliente (rojo, con la cadena), o
 * importar un valor de `@/textos/servidor` desde uno (rojo: arrastra los diccionarios).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { especificadores, ficherosDeSrc, resolver } from "./helpers/grafo-imports";

const RAIZ = process.cwd();
const rel = (f: string) => path.relative(RAIZ, f).replaceAll("\\", "/");
const DICCIONARIOS = /src\/textos\/(es|en|de)\.ts$/;

/** La cadena más corta de imports por valor desde `origen` hasta un diccionario, o `null`. */
function cadenaHastaDiccionario(origen: string): string[] | null {
  const visto = new Set([origen]);
  const cola: string[][] = [[origen]];
  while (cola.length > 0) {
    const cadena = cola.shift()!;
    const f = cadena.at(-1)!;
    for (const espec of especificadores(readFileSync(f, "utf8"))) {
      const r = resolver(f, espec);
      if (!r || visto.has(r)) continue;
      if (DICCIONARIOS.test(rel(r))) return [...cadena, r].map(rel);
      visto.add(r);
      cola.push([...cadena, r]);
    }
  }
  return null;
}

const deCliente = ficherosDeSrc().filter((f) =>
  /^\s*["']use client["']/.test(readFileSync(f, "utf8")),
);

describe("los diccionarios no llegan al cliente", () => {
  it("hay componentes de cliente que recorrer (si no, no probaría nada)", () => {
    expect(deCliente.length).toBeGreaterThan(50);
  });

  it("ningún 'use client' alcanza un diccionario por ninguna cadena de imports", () => {
    const cadenas = deCliente.map(cadenaHastaDiccionario).filter((c): c is string[] => c !== null);
    expect(
      cadenas.map((c) => c.join(" → ")),
      "un diccionario viaja al navegador",
    ).toEqual([]);
  });

  it("el detector SÍ ve una cadena (control: si no la viera, el anterior sería un verde vacío)", () => {
    const servidor = path.join(RAIZ, "src/textos/servidor.ts");
    expect(cadenaHastaDiccionario(servidor)).toEqual([
      "src/textos/servidor.ts",
      "src/textos/es.ts",
    ]);
  });

  it("y el castellano lleva su marca de idioma (la que busca la revisión de la imagen)", () => {
    expect(readFileSync(path.join(RAIZ, "src/textos/es.ts"), "utf8")).toMatch(/__idioma: "es"/);
  });

  it("las dos redes sobre el BUILD siguen ahí: la imagen web en CI y el build local del pre-push", () => {
    const revisar = readFileSync(path.join(RAIZ, "scripts/ci-revisar-imagenes.sh"), "utf8");
    expect(revisar).toMatch(/grep -rl "__idioma" \/app\/\.next\/static/);
    expect(revisar).toMatch(/fallo "web: un diccionario de textos viaja en el JS del navegador/);
    const local = readFileSync(path.join(RAIZ, "scripts/check-build-sin-env.mjs"), "utf8");
    expect(local).toMatch(/includes\("__idioma"\)/);
    expect(local).toMatch(/join\(root, "\.next", "static"\)/);
  });
});
