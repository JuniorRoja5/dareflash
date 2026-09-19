/**
 * EL TEMA SE SIRVE DESDE EL SERVIDOR, y solo desde dos sitios. Estructural, como el guard del panel:
 * lo que fija no es un resultado sino DECISIONES que se pueden deshacer sin que falle nada.
 *
 *  - SIN PARPADEO: el `data-theme` sale ya en el HTML, leído de la cookie en el layout raíz. Si alguien
 *    lo mueve a `localStorage` y un efecto, el primer pintado vuelve a ser oscuro siempre y el claro
 *    entra de golpe al hidratar. Eso no falla en ningún test... salvo en este.
 *  - EL PANEL ES OSCURO SIEMPRE: su layout vuelve a declarar el tema oscuro, así que da igual lo que
 *    elija el visitante en el sitio público.
 *  - NADIE MÁS TOCA EL TEMA: solo el layout raíz (lo sirve), el del panel (lo fija) y el conmutador
 *    (lo cambia). Un tercer sitio que escriba `data-theme` sería una segunda verdad.
 *  - CERO HEX SUELTOS: un color escrito a mano en un componente no cambia con el tema. Con dos temas
 *    eso deja de ser una cuestión de estilo y pasa a ser un fallo visible.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const SRC = path.resolve(__dirname, "..", "src");

/**
 * SIN COMENTARIOS. Un comentario no pinta nada, y por eso no vale como prueba de que algo se hace:
 * la primera versión de este test daba por bueno el panel porque su propio comentario mencionaba
 * `data-theme="dark"` — al quitar el atributo de verdad, el test seguía en verde. Lo cazaron las
 * roturas a propósito.
 */
const sinComentarios = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const leer = (rel: string): string => sinComentarios(readFileSync(path.join(SRC, rel), "utf8"));

function ficheros(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) return ficheros(p);
    return /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}
const TODOS = [...ficheros(path.join(SRC, "app")), ...ficheros(path.join(SRC, "components"))].map(
  (f) => ({
    rel: path.relative(SRC, f).split(path.sep).join("/"),
    codigo: sinComentarios(readFileSync(f, "utf8")),
  }),
);

describe("el tema llega en el HTML, no después", () => {
  it("el layout raíz lee la COOKIE y escribe `data-theme` en <html>", () => {
    const layout = leer("app/layout.tsx");
    expect(layout).toContain("temaDesdeCookie");
    expect(layout).toContain("TEMA_COOKIE");
    expect(layout).toMatch(/<html[\s\S]*?data-theme=\{atributoTema\(tema\)\}/);
  });

  it("y el color de la barra del navegador se calcula por petición, no fijo", () => {
    const layout = leer("app/layout.tsx");
    expect(layout).toContain("generateViewport");
    expect(layout).toContain("TEMA_COLOR_BARRA[tema]");
    // El `themeColor` fijo de antes mentía en cuanto la página era blanca.
    expect(layout).not.toMatch(/themeColor:\s*"#/);
  });

  it("la preferencia va en COOKIE, no en localStorage (que el servidor no puede leer)", () => {
    expect(leer("components/ui/conmutador-tema.tsx")).not.toContain("localStorage");
    expect(leer("components/ui/conmutador-tema.tsx")).toContain("document.cookie");
  });
});

describe("el panel es oscuro siempre", () => {
  it("su layout vuelve a declarar el tema oscuro", () => {
    expect(leer("app/panel/layout.tsx")).toContain('data-theme="dark"');
  });

  it("y no monta el conmutador: ahí no hay tema que elegir", () => {
    const delPanel = TODOS.filter((f) => f.rel.startsWith("app/panel/"));
    expect(delPanel.filter((f) => f.codigo.includes("ConmutadorTema")).map((f) => f.rel)).toEqual(
      [],
    );
  });
});

describe("una sola verdad", () => {
  it("solo el layout raíz y el del panel escriben `data-theme`", () => {
    const culpables = TODOS.filter((f) => f.codigo.includes("data-theme=")).map((f) => f.rel);
    expect(culpables.sort()).toEqual(["app/layout.tsx", "app/panel/layout.tsx"]);
  });

  it("y solo el conmutador lo ESCRIBE (leerlo puede cualquiera)", () => {
    // Leer el tema es legítimo —el fondo de vídeo lo mira para no montarse en claro—; ESCRIBIRLO en
    // dos sitios sería tener dos interruptores que se pisan.
    const escriben = TODOS.filter((f) => /dataset\.theme\s*=[^=]/.test(f.codigo)).map((f) => f.rel);
    expect(escriben).toEqual(["components/ui/conmutador-tema.tsx"]);
  });
});

describe("cero hex sueltos: el color sale de los tokens", () => {
  /**
   * `/style-guide` es la referencia de diseño y su trabajo es justamente ENSEÑAR los valores: ahí los
   * hex son el contenido, no un color pintado a mano. Es dev-only (ver `style-guide-visibility`).
   */
  const EXENTOS = ["app/style-guide/page.tsx"];

  it("ningún componente del sitio escribe un color literal", () => {
    const culpables = TODOS.filter((f) => !EXENTOS.includes(f.rel))
      .filter((f) => /#[0-9a-fA-F]{6}\b/.test(f.codigo))
      .map((f) => f.rel);
    expect(culpables).toEqual([]);
  });
});
