/**
 * NADA DE TEXTO ESCRITO A MANO EN LO QUE YA ESTÁ EXTRAÍDO (Fase 11 · P5b1) — censo estructural, por AST.
 *
 * En las zonas extraídas (el armazón, el feed, la portada y los retos), lo que un usuario lee u oye sale
 * de `t()`: el texto de JSX, los atributos que se leen (`aria-label`, `alt`, `title`, `placeholder`,
 * `label`) y las cadenas que se pintan desde una expresión. Si alguien vuelve a escribir una frase a
 * mano, en inglés o alemán saldría en castellano y el pseudo-idioma no la marcaría: rojo, con fichero y
 * línea. Qué cuenta y qué no, en `helpers/texto-a-mano`.
 *
 * SIN EXCEPCIONES desde la P5b2b: la lista de zonas pendientes (`PENDIENTES_P5B2`) llegó a cero y se
 * retiró. Todo `.tsx` de `src/app` y `src/components` fuera de las zonas de abajo pasa el censo.
 *
 * Fuera del censo, a propósito: el panel (no se traduce), la API (tiene el suyo desde la P5b3, por AST
 * sobre los mensajes: `textos-api`) y las dos páginas internas de desarrollo (`/style-guide`,
 * `/reproduccion-test`).
 *
 * Para romperlo: escribir `<p>Hola</p>` en cualquier componente de la app (rojo con el fichero).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { textosAMano } from "./helpers/texto-a-mano";

const RAIZ = process.cwd();
const FUERA = [
  "src/app/panel/",
  "src/app/api/",
  "src/app/style-guide/",
  "src/app/reproduccion-test/",
];

function tsx(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? tsx(p) : /\.tsx$/.test(n) ? [p] : [];
  });
}

const ficheros = [...tsx(path.join(RAIZ, "src/app")), ...tsx(path.join(RAIZ, "src/components"))]
  .map((f) => path.relative(RAIZ, f).replaceAll("\\", "/"))
  .filter((f) => !FUERA.some((x) => f.startsWith(x)));
const aMano = new Map(
  ficheros.map((f) => [f, textosAMano(f, readFileSync(path.join(RAIZ, f), "utf8"))]),
);

describe("el texto de la interfaz sale de t()", () => {
  it("el censo recorre la app y ve el texto a mano (si no, no probaría nada)", () => {
    expect(ficheros.length).toBeGreaterThan(150);
    expect(
      textosAMano("x.tsx", 'export const X = () => <p aria-label="Hola">{a ? "sí" : "no"}</p>;'),
    ).toEqual(['1: aria-label="Hola"', '1: "sí"', '1: "no"']);
    expect(
      textosAMano(
        "x.tsx",
        'export const X = () => <p className="a">{a === "b" ? t("x") : null}</p>;',
      ),
    ).toEqual([]);
  });

  it("y ve el texto que llega a la pantalla por otro camino (P5b2a), sin confundirlo con un código", () => {
    // El título de una pestaña, el de un objeto que se pinta y lo que recibe un `set…` de React: por
    // ahí se escaparon a la P5b1 los estados de un vídeo y los títulos de cada página.
    expect(textosAMano("x.tsx", 'export const metadata = { title: "Mis puntos" };')).toEqual([
      '1: "Mis puntos"',
    ]);
    expect(textosAMano("x.tsx", 'const C = { texto: "Publicado", tono: "ok" };')).toEqual([
      '1: "Publicado"',
    ]);
    expect(textosAMano("x.tsx", 'setError(msg || "No se pudo."); setAviso(`Hola ${n}`);')).toEqual([
      '1: "No se pudo."',
      "1: `Hola ${n}`",
    ]);
    // Y los CÓDIGOS que viajan por los mismos caminos no cuentan: no tienen forma de frase.
    expect(
      textosAMano("x.tsx", 'setEstado("enviando"); const C = { titulo: "idle", tono: "ok" };'),
    ).toEqual([]);
  });

  it("ningún componente de la app tiene texto escrito a mano", () => {
    const culpables = [...aMano]
      .filter(([, t]) => t.length > 0)
      .map(([f, t]) => `${f} → ${t.slice(0, 3).join(" | ")}`);
    expect(culpables, `texto a mano fuera de t(): ${culpables.join("; ")}`).toEqual([]);
  });
});
