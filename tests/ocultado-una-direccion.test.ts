/**
 * NADA DES-OCULTA SOLO.
 *
 * Es el invariante que no puede romperse en silencio, y el que más fácil se rompe: dentro de unos
 * meses alguien escribe un barrido razonable —"si el recuento baja de tres, vuelve a mostrarlo"— y
 * nada falla. Lo que ese barrido haría de verdad es devolver a la vista contenido que un moderador
 * puede haber mirado y escondido, sin que quede rastro de que una máquina deshizo a una persona.
 *
 * LA PUERTA DE VUELTA ES UNA Y TIENE NOMBRE: `levantarAutoOcultoEnTx`, y solo la llama el
 * moderador (descartar, o confirmar antes de retirar). Este test cuenta las puertas.
 *
 * Para romperlo: escribir `ocultoAutoEn: null` en cualquier otro fichero (rojo), llamar a
 * `levantarAutoOcultoEnTx` desde un job o un barrido (rojo), o exportar desde la regla pura algo
 * que suene a des-ocultar (rojo, en `tests/umbral-ocultado`).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();
const SRC = join(RAIZ, "src");

/** Todos los .ts/.tsx de `src`, sin el cliente generado, con los comentarios quitados. */
function ficheros(dir: string): Array<{ rel: string; codigo: string }> {
  return readdirSync(dir).flatMap((e) => {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) {
      return e === "generated" ? [] : ficheros(p);
    }
    if (!/\.tsx?$/.test(p)) return [];
    return [
      {
        rel: p.slice(RAIZ.length + 1).replace(/\\/g, "/"),
        // Sin comentarios: los docblocks de esta pieza EXPLICAN la regla ("lo quita únicamente el
        // descartar del moderador") y nombran lo que prohíben. Juzgar el texto del comentario
        // convertiría la documentación en una infracción.
        codigo: readFileSync(p, "utf8")
          .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "")
          .replace(/^\s*\/\/.*$/gm, "")
          .replace(/^\s*\/\/\/.*$/gm, ""),
      },
    ];
  });
}

const TODOS = ficheros(SRC);

describe("hay código que vigilar", () => {
  it("el barrido encuentra ficheros y encuentra la pieza", () => {
    // Sin esto, un cambio de rutas dejaría todo lo de abajo en verde por no mirar nada.
    expect(TODOS.length).toBeGreaterThan(100);
    expect(TODOS.some((f) => f.rel === "src/server/services/ocultado-automatico.ts")).toBe(true);
  });
});

describe("quién puede escribir el ocultado", () => {
  it("SOLO `ocultado-automatico` pone `ocultoAutoEn` a una fecha", () => {
    const escriben = TODOS.filter((f) => /ocultoAutoEn:\s*ahora/.test(f.codigo)).map((f) => f.rel);
    expect(escriben).toEqual(["src/server/services/ocultado-automatico.ts"]);
  });

  it("SOLO `ocultado-automatico` lo pone a null (la puerta de vuelta es una)", () => {
    // `ocultoAutoEn: null` aparece también en las constantes de VISIBILIDAD, que es una lectura
    // (un `where`), no una escritura. Se distinguen por fichero: las dos constantes viven en sus
    // propios módulos y no escriben nada.
    const VISIBILIDAD = [
      "src/server/services/video-visible.ts",
      "src/server/services/comentario-visible.ts",
    ];
    const tocan = TODOS.filter((f) => /ocultoAutoEn:\s*null/.test(f.codigo))
      .map((f) => f.rel)
      .filter((rel) => !VISIBILIDAD.includes(rel));
    expect(tocan).toEqual(["src/server/services/ocultado-automatico.ts"]);
  });

  it("y la puerta de vuelta solo la abre el MODERADOR", () => {
    const llaman = TODOS.filter(
      (f) =>
        /levantarAutoOcultoEnTx\s*\(/.test(f.codigo) &&
        f.rel !== "src/server/services/ocultado-automatico.ts",
    ).map((f) => f.rel);
    // `moderar.ts` y nadie más: ni un job, ni un barrido, ni una ruta pública.
    expect(llaman).toEqual(["src/server/services/moderar.ts"]);
  });
});

describe("ningún automatismo la abre", () => {
  const AUTOMATISMOS = TODOS.filter(
    (f) => f.rel.startsWith("src/server/jobs/") || /reconciliacion|barrido/i.test(f.rel),
  );

  it("hay automatismos que mirar", () => {
    expect(AUTOMATISMOS.length).toBeGreaterThan(2);
  });

  it.each(AUTOMATISMOS.map((f) => f.rel))("%s no toca el ocultado", (rel) => {
    const f = TODOS.find((x) => x.rel === rel)!;
    expect(f.codigo, "un job no puede des-ocultar").not.toMatch(/levantarAutoOcultoEnTx/);
    expect(f.codigo, "un job no puede escribir la columna").not.toMatch(/ocultoAutoEn/);
  });
});

describe("el worker no tiene un barrido que lo levante", () => {
  it("el bucle del worker no menciona el ocultado", () => {
    const worker = TODOS.find((f) => f.rel === "src/server/jobs/worker.ts")!;
    expect(worker.codigo).not.toMatch(/ocultoAuto/i);
    // Y el control: el worker SÍ tiene barridos, así que el fichero no está vacío ni es el que no es.
    expect(worker.codigo).toMatch(/claimJobs|bucleWorker/);
  });
});
