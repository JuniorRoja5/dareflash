/**
 * LOS CENTINELAS DE LOS DICCIONARIOS (Fase 11 · P5b1): los textos que NUNCA pueden aparecer en el
 * JavaScript del navegador.
 *
 * Los textos de la app llegan al navegador como DATOS (props que manda el servidor), nunca dentro de un
 * trozo de JS. Si un componente de cliente importa un diccionario, el compilador mete en su trozo lo
 * que use: a veces el objeto entero (y con él la marca `__idioma`), a veces solo un espacio, a veces el
 * texto suelto (Turbopack sustituye `es.x.y` por la cadena). La marca sola no lo ve todo; por eso se
 * busca también cada texto LARGO del diccionario (≥ 20 caracteres, partido por sus `{parámetros}`) que
 * NO esté escrito en ningún otro fichero de `src/` —uno que sí lo esté puede salir en el JS por ese otro
 * fichero, legítimamente—.
 *
 * Lo usan `check-build-sin-env.mjs` (pre-push) y `ci-revisar-imagenes.sh` (CI). JavaScript plano: lee
 * los diccionarios como TEXTO, sin importar TypeScript, para correr con el Node que traiga el runner.
 * Uso como guion: `node scripts/centinelas-textos.mjs` imprime un centinela por línea.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";

const DICCIONARIOS = ["es.ts", "en.ts", "de.ts"];

function ficheros(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory()
      ? n === "generated"
        ? []
        : ficheros(p)
      : /\.(ts|tsx)$/.test(n)
        ? [p]
        : [];
  });
}

/** La marca y los textos largos de los diccionarios que no viven en ningún otro sitio de `src/`. */
export function centinelasTextos(raiz) {
  const dirTextos = join(raiz, "src", "textos");
  const candidatos = new Set();
  for (const d of DICCIONARIOS) {
    const f = join(dirTextos, d);
    if (!existsSync(f)) continue;
    // Solo los valores: las cadenas entre comillas dobles (los comentarios usan «» y `…`).
    const sinComentarios = readFileSync(f, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      // Solo los comentarios que EMPIEZAN una línea (los únicos que usan los diccionarios): un `//` dentro de
      // una cadena —«https://tu-web.com»— se comía el resto de la línea con su comilla de cierre, y las
      // comillas se emparejaban mal (salían «centinelas» como «,» que casan con cualquier trozo de JS).
      .replace(/^\s*\/\/.*$/gm, "");
    for (const m of sinComentarios.matchAll(/"((?:[^"\\]|\\.)*)"/g)) {
      for (const trozo of m[1].split(/\{\w+\}/)) {
        const t = trozo.trim();
        if (t.length >= 20) candidatos.add(t);
      }
    }
  }
  const resto = ficheros(join(raiz, "src"))
    .filter((f) => !f.startsWith(dirTextos + sep))
    .map((f) => readFileSync(f, "utf8"))
    .join("\n");
  return ["__idioma", ...[...candidatos].filter((t) => !resto.includes(t)).sort()];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.stdout.write(centinelasTextos(process.cwd()).join("\n") + "\n");
}
