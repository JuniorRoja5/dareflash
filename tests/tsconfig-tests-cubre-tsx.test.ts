/**
 * TODO `tests/` PASA POR EL VERIFICADOR DE TIPOS (Fase 11 · PTT) — también los `.tsx`.
 *
 * ┌─ EL FALLO QUE CIERRA ─────────────────────────────────────────────────────────────────────────────┐
 * │ `tsconfig.test.json` incluía `tests/**\/*.ts` y NO `tests/**\/*.tsx`: ningún test de render       │
 * │ pasaba por `tsc`. Vitest no comprueba tipos (solo los quita), así que corrían verdes con 37       │
 * │ errores escondidos en 14 ficheros: fixtures con la forma de antes de la Fase 8 (sin `esVip`, sin  │
 * │ `colorNombre`), props que la vista ya exige, un `idioma` pasado dos veces. Un test con errores de │
 * │ tipo puede estar probando otra cosa de la que cree, y nadie se entera.                            │
 * └──────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Se mira la PROPIEDAD, no el texto del `include`: se le pide a TypeScript la lista de ficheros que
 * resuelve ese proyecto (con su `extends`, su `include` y su `exclude`) y cada `.ts`/`.tsx` que hay de
 * verdad bajo `tests/` tiene que estar en ella. Así vale para cualquier forma de estrecharlo: quitar
 * el patrón, cambiarlo por una carpeta, o excluir una.
 *
 * Para romperlo a propósito: quitar `"tests/**\/*.tsx"` del `include` de `tsconfig.test.json` (rojo:
 * nombra los `.tsx` que se quedan fuera).
 */
import { readdirSync } from "node:fs";
import path from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

const RAIZ = path.resolve(__dirname, "..");
const TSCONFIG = path.join(RAIZ, "tsconfig.test.json");

/** Los ficheros `.ts`/`.tsx` que hay de verdad bajo `tests/`, como rutas relativas con `/`. */
function ficherosDeTests(): string[] {
  return readdirSync(path.join(RAIZ, "tests"), { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && /\.tsx?$/.test(e.name))
    .map((e) => path.relative(RAIZ, path.join(e.parentPath, e.name)).split(path.sep).join("/"))
    .sort();
}

/** Los ficheros que resuelve `tsconfig.test.json`, como los ve `tsc -p tsconfig.test.json`. */
function ficherosDelProyecto(): Set<string> {
  const leido = ts.readConfigFile(TSCONFIG, ts.sys.readFile);
  expect(leido.error, "tsconfig.test.json no se pudo leer").toBeUndefined();
  const proyecto = ts.parseJsonConfigFileContent(leido.config, ts.sys, RAIZ, undefined, TSCONFIG);
  return new Set(proyecto.fileNames.map((f) => path.relative(RAIZ, f).split(path.sep).join("/")));
}

describe("tsconfig.test.json cubre todo tests/", () => {
  const enDisco = ficherosDeTests();
  const cubiertos = ficherosDelProyecto();

  it("hay tests de las dos clases (si no, el censo no mediría nada)", () => {
    expect(enDisco.filter((f) => f.endsWith(".ts")).length).toBeGreaterThan(0);
    expect(enDisco.filter((f) => f.endsWith(".tsx")).length).toBeGreaterThan(0);
  });

  it("ningún .ts ni .tsx de tests/ se queda fuera del verificador de tipos", () => {
    const fuera = enDisco.filter((f) => !cubiertos.has(f));
    expect(fuera, "estos tests no pasan por `npm run typecheck`").toEqual([]);
  });
});
