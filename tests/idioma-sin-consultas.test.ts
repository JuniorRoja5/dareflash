/**
 * EL IDIOMA NO CUESTA NI UNA CONSULTA (Fase 11 · P5a, invariante 8).
 *
 * El idioma sale de la URL: el proxy lo lee del prefijo y lo pasa en una cabecera, y todo lo demás
 * (`<html lang>`, la canónica, los enlaces, las redirecciones) lo lee de esa cabecera. Nada de eso
 * necesita la base de datos ni la sesión, y corre en CADA página: una consulta aquí sería una consulta
 * más en `/feed`, `/inicio` y todas las demás. La tabla del log general de MariaDB (en el informe de la
 * P5a) lo midió antes y después; esto lo fija.
 *
 * Fija, por fichero: ninguno importa Prisma, el cliente de BD, la sesión ni un servicio; y en
 * `formato-peticion`, las funciones del idioma y de la ruta solo leen `headers()`.
 *
 * Para romperlo: que `idiomaDeLaPeticion` mire la sesión o la BD (p. ej. por la preferencia del usuario,
 * que es de la P5c y va en la MISMA consulta de `validateSession`) → rojo.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();
const leer = (f: string) =>
  readFileSync(path.join(RAIZ, f), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

/** Lo que delata E/S: el cliente de BD, la sesión, un servicio, o una consulta. */
const E_S =
  /@\/server\/(db|auth|services)|current-user|prisma|\$queryRaw|getCurrentUser|validateSession|fetch\(/;

describe("las piezas del idioma no tocan la base de datos ni la sesión", () => {
  it.each([
    "src/proxy.ts",
    "src/lib/idioma-ruta.ts",
    "src/server/metadatos-idioma.ts",
    "src/server/redirigir.ts",
    "src/components/enlace.tsx",
  ])("%s", (f) => {
    expect(leer(f)).not.toMatch(E_S);
  });

  it("en formato-peticion, idiomaDeLaPeticion y rutaDeLaPeticion solo leen headers()", () => {
    const fuente = leer("src/server/formato-peticion.ts");
    for (const nombre of ["idiomaDeLaPeticion", "rutaDeLaPeticion"]) {
      const cuerpo = new RegExp(
        `export async function ${nombre}\\(\\)[^{]*\\{([\\s\\S]*?)\\n\\}`,
      ).exec(fuente)?.[1];
      expect(cuerpo, `no encuentro ${nombre}`).toBeDefined();
      expect(cuerpo).toMatch(/\(await headers\(\)\)\.get\(/);
      expect(cuerpo, `${nombre} hace E/S`).not.toMatch(E_S);
      expect(cuerpo, `${nombre} importa algo`).not.toMatch(/import\(/);
    }
  });
});
