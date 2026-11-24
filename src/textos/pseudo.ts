/**
 * EL PSEUDO-IDIOMA `xx` (Fase 11 · P5b1) — SOLO para desarrollo. Se GENERA del castellano, así que no
 * puede quedarse sin una clave: cada texto sale con sus acentos cambiados, un 30 % más largo y entre
 * corchetes («[Ŕéţöš åçţîṽöš ·····]»). Sirve para dos cosas que una revisión de código no ve:
 *  - un texto que NO sale entre corchetes no ha pasado por `t()`: está escrito a mano;
 *  - un texto un 30 % más largo enseña dónde se desborda la maqueta (el alemán es así de largo).
 * Los `{parámetros}` se respetan tal cual: si no, `t` no podría rellenarlos.
 */
import type { Espacio, Fuente, Texto } from "./plantilla";

const ACENTOS: Record<string, string> = {
  a: "å",
  e: "é",
  i: "î",
  o: "ö",
  u: "ü",
  c: "ç",
  n: "ñ",
  s: "š",
  t: "ţ",
  r: "ŕ",
  y: "ý",
  v: "ṽ",
  A: "Å",
  E: "É",
  I: "Î",
  O: "Ö",
  U: "Ü",
  C: "Ç",
  N: "Ñ",
  S: "Š",
  T: "Ţ",
  R: "Ŕ",
  Y: "Ý",
  V: "Ṽ",
};

/**
 * Lo que NO se toca: un `{parámetro}`, la apertura de una marca (`{resaltado:`) y la `}` que la cierra.
 * Si se acentuaran, `t` no podría rellenar el parámetro y `tRico` no reconocería la marca: el `xx`
 * enseñaría las llaves en vez del formato.
 */
const INTOCABLE = /(\{\w+\}|\{\w+:|\})/;
const esIntocable = (p: string) => /^(\{\w+\}|\{\w+:|\})$/.test(p);

/** Un texto en pseudo-idioma. Los parámetros y las marcas, tal cual; las palabras de dentro, sí cambian. */
export function pseudoTexto(texto: string): string {
  const partes = texto.split(INTOCABLE);
  const cambiado = partes
    .map((p) => (esIntocable(p) ? p : [...p].map((c) => ACENTOS[c] ?? c).join("")))
    .join("");
  const visibles = partes.filter((p) => !esIntocable(p)).join("").length;
  const relleno = Math.max(1, Math.ceil(visibles * 0.3));
  return `[${cambiado} ${"·".repeat(relleno)}]`;
}

function pseudoDe(t: Texto): Texto {
  return typeof t === "string"
    ? pseudoTexto(t)
    : { one: pseudoTexto(t.one), other: pseudoTexto(t.other) };
}

/** El diccionario entero en pseudo-idioma, con la MISMA forma que el de partida. */
export function pseudoDiccionario<F extends Fuente>(fuente: F): F {
  const salida: Record<string, unknown> = { __idioma: "xx" };
  for (const [nombre, valor] of Object.entries(fuente)) {
    if (nombre === "__idioma" || typeof valor === "string") continue;
    const espacio: Record<string, Texto> = {};
    for (const [clave, texto] of Object.entries(valor as Espacio)) espacio[clave] = pseudoDe(texto);
    salida[nombre] = espacio;
  }
  return salida as F;
}
