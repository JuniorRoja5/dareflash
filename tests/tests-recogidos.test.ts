/**
 * QUE NINGÚN TEST SE QUEDE SIN CORRER. Los dos proyectos de vitest se reparten los ficheros por PATRÓN
 * (`tests/**\/*.test.ts` para node, `tests/render/**\/*.test.tsx` para jsdom), así que un fichero mal
 * colocado no falla: SENCILLAMENTE NO SE EJECUTA, y la suite sigue verde.
 *
 * Pasó de verdad escribiendo el deep-link del aviso: un `tests/feed-deep-link-page.test.tsx` en la raíz
 * no lo recogía ninguno de los dos. Las dos reglas que lo evitan:
 *  - un `.test.tsx` vive bajo `tests/render/` (es el único proyecto con DOM);
 *  - un `.test.ts` NO vive bajo `tests/render/` (ahí correría en node, sin DOM, o no correría).
 */
import { readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = path.resolve(__dirname);

/** Todos los ficheros de test, como rutas relativas a `tests/` con separadores "/". */
function ficherosDeTest(dir = RAIZ): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) return ficherosDeTest(abs);
    if (!/\.test\.(ts|tsx)$/.test(e.name)) return [];
    return [path.relative(RAIZ, abs).split(path.sep).join("/")];
  });
}

describe("los dos proyectos de vitest recogen TODOS los ficheros de test", () => {
  const ficheros = ficherosDeTest();

  it("hay tests que comprobar (si esto falla, el recorrido está roto)", () => {
    expect(ficheros.length).toBeGreaterThan(50);
  });

  it("un .test.tsx solo vive bajo tests/render/ (el proyecto con DOM)", () => {
    const fuera = ficheros.filter((f) => f.endsWith(".tsx") && !f.startsWith("render/"));
    expect(fuera).toEqual([]);
  });

  it("un .test.ts NO vive bajo tests/render/", () => {
    const dentro = ficheros.filter((f) => f.endsWith(".ts") && f.startsWith("render/"));
    expect(dentro).toEqual([]);
  });
});
