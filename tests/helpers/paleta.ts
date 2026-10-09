/**
 * LA PALETA, LEÍDA DE `globals.css`. Los tests que miden color —`paleta-clara`, `paleta-oscura` y
 * `paleta-niveles`— arrancan todos del mismo sitio: los bloques de tokens `--df-*`. El lector estaba
 * COPIADO en cada uno, y tres copias de un lector son tres formas de que uno deje de mirar donde cree
 * que mira (basta con que alguien reformatee el selector en el CSS y arregle solo dos).
 *
 * Esto NO mide: las fórmulas (contraste WCAG, CIEDE2000, tono) viven en `./color`. Aquí solo se lee.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { expect } from "vitest";

export const CSS = readFileSync(
  path.resolve(__dirname, "..", "..", "src", "app", "globals.css"),
  "utf8",
);

/**
 * SELECTORES EXACTOS de los dos bloques de paleta, tal cual están escritos en el CSS (incluido el
 * salto de línea del oscuro, que lleva los DOS selectores para que un subárbol pueda pedir oscuro
 * dentro de una página clara — así se queda oscuro el panel). Si alguien los reformatea, `tokensDe`
 * no encuentra el bloque y cae en rojo aquí, en un sitio, en vez de en tres a medias.
 */
export const SELECTOR_OSCURO = ':root,\n[data-theme="dark"]';
export const SELECTOR_CLARO = '[data-theme="light"]';

/**
 * SE LEE SIN COMENTARIOS, y esto no es cosmético: un diente lo descubrió. Comentar la línea de un
 * token lo deja DENTRO del comentario, donde el regex lo encuentra igual, y el test seguía diciendo
 * que estaba definido. O sea que se podía quitar un color de un tema sin que ninguno de los tres
 * guards se quejara, y ese tema se quedaba heredando el valor del otro: texto oscuro sobre fondo
 * oscuro, o un acento que no pega. Los comentarios se quitan ANTES de buscar el bloque, así que los
 * índices son coherentes entre sí.
 *
 * `CSS` se exporta en crudo a propósito: quien necesita el fuente tal cual (los casos estructurales
 * que miran una clase) ya se lo limpia por su cuenta.
 */
const SIN_COMENTARIOS = CSS.replace(/\/\*[\s\S]*?\*\//g, "");

/** Los `--df-*: valor;` de un bloque, por el selector con el que empieza. */
export function tokensDe(selector: string): Map<string, string> {
  const i = SIN_COMENTARIOS.indexOf(selector);
  expect(i, `no está el bloque ${selector}`).toBeGreaterThan(-1);
  const abre = SIN_COMENTARIOS.indexOf("{", i);
  const cierra = SIN_COMENTARIOS.indexOf("\n}", abre);
  const cuerpo = SIN_COMENTARIOS.slice(abre, cierra);
  const tokens = new Map<string, string>();
  for (const m of cuerpo.matchAll(/(--df-[a-z-]+):\s*([^;]+);/g)) {
    tokens.set(m[1]!, m[2]!.trim());
  }
  return tokens;
}

export const OSCURO = tokensDe(SELECTOR_OSCURO);
export const CLARO = tokensDe(SELECTOR_CLARO);

/**
 * Solo los que son un color sólido: los degradados y las sombras no se miden con contraste. Si falta
 * o no es un hex devuelve "", que revienta al medirlo — así el rojo sale en el test que lo usa (con su
 * nombre) y no al cargar el fichero, que dejaría la suite entera sin ejecutarse.
 */
export const hex = (tokens: Map<string, string>, nombre: string): string => {
  const v = tokens.get(nombre) ?? "";
  return /^#[0-9a-f]{6}$/i.test(v) ? v : "";
};
