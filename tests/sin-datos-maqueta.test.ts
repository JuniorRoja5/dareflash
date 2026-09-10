/**
 * EL DATO INVENTADO NO VUELVE.
 *
 * `ranking-datos.ts` y `usuario-demo.ts` contenían usuarios y puntuaciones falsos (`lucia.voz`,
 * `nico_skate`, 24.680 pts…) y estaban EN PRODUCCIÓN: los pintaban `/ranking` y el rail de `/inicio`.
 * Se retiraron cuando el ranking pasó a leer datos reales.
 *
 * Este test existe porque borrar un fichero no impide que vuelva. La forma habitual de que el dato
 * falso reaparezca no es que alguien recupere el módulo: es que, para "ver algo" mientras desarrolla
 * una pantalla vacía, se escriba una lista de ejemplo al lado y se quede. Con datos reales, una
 * pantalla vacía es información — significa que todavía no ha ganado nadie.
 *
 * Lo que se prohíbe es que esos módulos EXISTAN o se importen bajo `src/`. Los ficheros de test y la
 * guía de estilo sí pueden llevar ejemplos: son ejemplos declarados como tales, no producción.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

const SRC = join(process.cwd(), "src");

/** Módulos de maqueta retirados. Si vuelve alguno con este nombre, esto lo nombra. */
const MODULOS_RETIRADOS = ["ranking-datos", "usuario-demo"];

/** Nombres inventados que llegaron a estar en producción. Que reaparezcan es la señal. */
const NOMBRES_INVENTADOS = ["lucia.voz", "nico_skate", "usuario_demo", "entrenador_dani"];

/**
 * MAQUETA QUE SIGUE VIVA, enumerada a propósito. Al escribir este test aparecieron TRES módulos más
 * de datos inventados que nadie tenía en la cabeza. No son de esta pieza —cada uno pertenece a una
 * funcionalidad que aún no existe— pero tampoco pueden quedarse invisibles:
 *
 *  - `feed-datos.ts`      comentarios de mentira del panel de escritorio. El modelo `Comment` no
 *                         está construido; se van con la pieza de comentarios.
 *  - `retos-datos.ts`     `RETOS_SEED`. El fichero es MIXTO: también exporta el catálogo de
 *                         categorías, que sí es real y lo usa la subida. Solo se va la semilla.
 *  - `portada-datos.ts`   hero, rejilla y perfiles de Boost de la portada, derivados de esa semilla.
 *                         Boost es Fase 6.
 *
 * Esta lista es una DEUDA DECLARADA, no un permiso: mientras un fichero esté aquí, se sabe qué
 * inventa y por qué sigue. Fuera de ella, cualquier dato falso nuevo se pone rojo. Al construir cada
 * funcionalidad, quitar su línea de aquí es parte del trabajo.
 */
const MAQUETA_PENDIENTE = [
  "components/feed/feed-datos.ts",
  "app/(app)/(shell)/retos/retos-datos.ts",
  "app/(app)/(shell)/inicio/portada-datos.ts",
];

/** Ficheros de código bajo src/, EXCLUIDA la guía de estilo (que es un catálogo de ejemplos). */
function ficherosDeCodigo(dir: string): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const completa = join(dir, entrada);
    if (statSync(completa).isDirectory()) {
      if (entrada === "generated" || entrada === "style-guide") continue;
      salida.push(...ficherosDeCodigo(completa));
    } else if (/\.(ts|tsx)$/.test(entrada)) {
      salida.push(completa);
    }
  }
  return salida;
}

const FICHEROS = ficherosDeCodigo(SRC);

/** Solo CÓDIGO: los comentarios de estas piezas MENCIONAN los módulos para explicar por qué se fueron. */
function soloCodigo(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("no hay datos de maqueta en producción", () => {
  it("hay ficheros que revisar (si no, el test es decorativo)", () => {
    expect(FICHEROS.length).toBeGreaterThan(50);
  });

  it("ningún módulo bajo src/ importa los de maqueta retirados", () => {
    const culpables = FICHEROS.filter((f) => {
      const src = soloCodigo(readFileSync(f, "utf8"));
      return MODULOS_RETIRADOS.some((m) => src.includes(`"${m}"`) || src.includes(`/${m}"`));
    }).map((f) => relative(SRC, f).split(sep).join("/"));
    expect(culpables).toEqual([]);
  });

  it("los módulos de maqueta no existen", () => {
    const revividos = FICHEROS.filter((f) =>
      MODULOS_RETIRADOS.some((m) => f.endsWith(`${m}.ts`) || f.endsWith(`${m}.tsx`)),
    ).map((f) => relative(SRC, f).split(sep).join("/"));
    expect(revividos).toEqual([]);
  });

  it("ningún nombre inventado aparece fuera de la maqueta declarada", () => {
    const culpables = FICHEROS.map((f) => relative(SRC, f).split(sep).join("/"))
      .filter((rel) => !MAQUETA_PENDIENTE.includes(rel))
      .filter((rel) => {
        const src = soloCodigo(readFileSync(join(SRC, rel), "utf8"));
        return NOMBRES_INVENTADOS.some((n) => src.includes(n));
      });
    // Si esto falla: o se ha colado maqueta nueva (bórrala), o has construido una funcionalidad y
    // toca quitar su fichero de MAQUETA_PENDIENTE, no añadir uno.
    expect(culpables).toEqual([]);
  });

  it("la lista de maqueta pendiente no se queda obsoleta: todos sus ficheros existen", () => {
    // Una entrada que ya no existe da permiso a un fichero fantasma y esconde que la deuda se pagó.
    const reales = new Set(FICHEROS.map((f) => relative(SRC, f).split(sep).join("/")));
    expect(MAQUETA_PENDIENTE.filter((m) => !reales.has(m))).toEqual([]);
  });
});
