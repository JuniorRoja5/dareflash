/**
 * EL GRAFO DE IMPORTS DE `src`, leído del texto (sin compilar): qué módulos arrastra cada fichero.
 *
 * Lo usan los tests que fijan qué NO llega al navegador (Fase 11 · P1b: zod). Un componente de cliente
 * (`"use client"`) lleva al JS de la página todo lo que importa por VALOR, transitivamente; un
 * `import type` se borra al compilar y no cuenta. Un `import()` dinámico SÍ cuenta: sale en un trozo
 * aparte, pero lo descarga el navegador igual.
 *
 * Conservador a propósito: un `import { type A } from "x"` (todos los nombres de tipo, sin la palabra
 * `type` delante de las llaves) cuenta como arista. Con `verbatimModuleSyntax` deja un `import "x"`
 * detrás; mejor un rojo que hay que mirar que un verde que no mira.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

export const RAIZ = path.resolve(__dirname, "../..");
const SRC = path.join(RAIZ, "src");

/** Ruta relativa a la raíz, con `/`: así se nombra un fichero en un mensaje de fallo. */
export const rel = (f: string): string => path.relative(RAIZ, f).replaceAll("\\", "/");

/** Todos los .ts/.tsx de `src`, sin el cliente generado de Prisma. */
export function ficherosDeSrc(): string[] {
  const out: string[] = [];
  (function rec(d: string) {
    for (const n of readdirSync(d)) {
      const p = path.join(d, n);
      if (statSync(p).isDirectory()) {
        if (n !== "generated") rec(p);
      } else if (/\.(ts|tsx)$/.test(n)) out.push(p);
    }
  })(SRC);
  return out;
}

/** Sin comentarios: un `import ... from "zod"` citado en un docblock no es un import. */
export function sinComentarios(texto: string): string {
  return texto
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
}

export const esCliente = (texto: string): boolean => /^\s*["']use client["']/.test(texto);

const RE_IMPORT =
  /(?:^|\n)\s*(?:import|export)\s+(type\s+)?(?:[^;'"]*?\s+from\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

/** Los especificadores que un fichero importa por VALOR (estáticos, re-exports, efectos y dinámicos). */
export function especificadores(texto: string): string[] {
  const out: string[] = [];
  for (const m of sinComentarios(texto).matchAll(RE_IMPORT)) {
    if (m[1]) continue; // import type / export type
    out.push((m[2] ?? m[3])!);
  }
  return out;
}

/** Resuelve `@/…` y rutas relativas a un fichero de `src`; un paquete (`zod`, `react`…) da `null`. */
export function resolver(desde: string, espec: string): string | null {
  let base: string;
  if (espec.startsWith("@/")) base = path.join(SRC, espec.slice(2));
  else if (espec.startsWith(".")) base = path.resolve(path.dirname(desde), espec);
  else return null;
  for (const c of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
  ])
    if (existsSync(c) && statSync(c).isFile()) return c;
  return null;
}

/**
 * Desde `origen`, la cadena MÁS CORTA de imports por valor hasta un fichero que importa un paquete que
 * cumpla `esPaquete` (p. ej. `zod`). `null` si no llega. La cadena acaba en el paquete:
 * `[origen, …, fichero que lo importa, "zod"]`.
 */
export function cadenaHasta(
  origen: string,
  esPaquete: (espec: string) => boolean,
  leer: (f: string) => string = (f) => readFileSync(f, "utf8"),
): string[] | null {
  const visto = new Set([origen]);
  const cola: string[][] = [[origen]];
  while (cola.length > 0) {
    const cadena = cola.shift()!;
    const f = cadena.at(-1)!;
    for (const espec of especificadores(leer(f))) {
      if (esPaquete(espec)) return [...cadena.map(rel), espec];
      const r = resolver(f, espec);
      if (r && !visto.has(r)) {
        visto.add(r);
        cola.push([...cadena, r]);
      }
    }
  }
  return null;
}
