/**
 * EL LOGOTIPO CABE EN LA COLUMNA — la cuenta, no la confianza.
 *
 * Nacio sin esta cuenta y llego a PRODUCCION saliendose: marca de 28 px y palabra de 22 px pedian
 * 219 px en una columna que da 184. El fallo es de layout y jsdom no mide layout, asi que la
 * tentacion es decir "esto solo lo caza el ojo" y fijar nada mas que una clase de contencion. Se
 * puede hacer mejor: lo que decide si cabe es una SUMA, y una suma si se comprueba.
 *
 * Todo lo que entra en la suma se LEE del codigo, no se copia aqui: el ancho de la columna y su
 * relleno salen de `navegacion.tsx`, el relleno del propio logo de como se usa alli, y los dos
 * tamanos de `logo.tsx`. Cambiar cualquiera de esos cuatro numeros sin rehacer la cuenta cae en rojo.
 *
 * LA UNICA CONSTANTE MEDIDA A MANO es el ancho de la palabra, y va ATADA A LA PALABRA QUE SE MIDIO
 * (`MEDIDA`): con la medida de otra palabra la suma no comprueba nada. Paso (Fase 11 · PM2): la cifra
 * era la de «DAREFLASH» (7,85 em) y el test seguia en verde con «REVOLFLASH», que mide 8,77 em y dejaba
 * ~3 px. Ahora el test exige que la palabra medida sea la marca actual en mayusculas.
 *
 * COMO SE MIDE (repetirlo al cambiar la marca): en el navegador, con la fuente display CARGADA
 * (`document.fonts.check`), en la barra lateral de escritorio: el ancho del `<span>` de la palabra
 * (`getBoundingClientRect().width`) dividido por su `font-size` calculado. Asi se midio «REVOLFLASH»
 * el 20 nov 2026: 140,3 px a 16 px = 8,77 em. La holgura exigida (10 px) cubre el margen de esa medida.
 *
 * Para romperlo a proposito: atar la medida a otra palabra (rojo, «vuelve a medir»); devolver la
 * palabra a 16 px (rojo: no cabe con 10 px de holgura); subir la marca a `h-7` (rojo); estrechar la
 * columna a `w-48` (rojo) o quitarle la contencion (rojo).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { MARCA } from "../src/config/marca";

const RAIZ = path.resolve(__dirname, "..");
const leer = (rel: string): string => readFileSync(path.resolve(RAIZ, rel), "utf8");

const LOGO = leer("src/components/ui/logo.tsx");
const NAV = leer("src/components/ui/navegacion.tsx");
const CSS = leer("src/app/globals.css");

/** 1 unidad de la escala de espaciado de Tailwind = 4 px. */
const U = 4;

/** La escala tipografica SALE de `globals.css`: aqui no se copia ningun tamano. */
const ESCALA = new Map(
  [...CSS.matchAll(/--text-([a-z0-9]+):\s*([\d.]+)rem;/g)].map((m) => [
    `text-${m[1]!}`,
    parseFloat(m[2]!) * 16,
  ]),
);

/**
 * El ancho de la palabra en ems, ATADO a la palabra que se midio. Ver el docblock: como se mide. Si la
 * marca cambia, esto se vuelve a medir: el test lo exige.
 */
const MEDIDA = { palabra: "REVOLFLASH", em: 8.77 };

/** El tamano de la palabra en px: de la escala (`text-base`) o un valor fijo (`text-[15px]`). */
const RE_TAMANO = /truncate (text-(?:[a-z0-9]+|\[\d+(?:\.\d+)?px\]))/;
function pxDe(clase: string): number | undefined {
  const fijo = /^text-\[([\d.]+)px\]$/.exec(clase);
  return fijo ? Number(fijo[1]) : ESCALA.get(clase);
}

/** El SVG de la marca: su ancho sale de la proporcion del viewBox, no de un numero suelto. */
const VIEWBOX = /viewBox="0 0 (\d+) (\d+)"/.exec(LOGO);

/**
 * El `className` de la barra LATERAL, acotado por sus senas: columna (`flex-col`) con filete a la
 * derecha (`border-r`). Sin acotar, un `w-(\d+)` suelto encuentra el `w-5` del primer icono —paso,
 * y la cuenta salio con una columna de 20 px—.
 */
const CLASE_LATERAL = [...NAV.matchAll(/className="([^"]*)"/g)]
  .map((m) => m[1]!)
  .find((c) => c.includes("flex-col") && c.includes("border-r"));

const USO_LOGO = /<Logo className="([^"]*)"/.exec(NAV)?.[1] ?? "";

describe("la cuenta cuadra: el logotipo entra en la barra lateral", () => {
  it("se leyeron las cuatro medidas del codigo (si no, la suma no significa nada)", () => {
    expect(ESCALA.size, "la escala tipografica de globals.css").toBeGreaterThanOrEqual(6);
    expect(VIEWBOX, "el viewBox de la marca").toBeTruthy();
    expect(CLASE_LATERAL, "no se encontro el className de la barra lateral").toBeTruthy();
    // Los NUMEROS, no solo las cadenas: una columna de 20 px no es un fallo del layout, es un
    // fallo del test, y asi se nota aqui y no en la suma de abajo.
    expect(Number(/\bw-(\d+)\b/.exec(CLASE_LATERAL!)?.[1] ?? 0)).toBeGreaterThanOrEqual(40);
    expect(Number(/\bp-(\d+)\b/.exec(CLASE_LATERAL!)?.[1] ?? 0)).toBeGreaterThan(0);
    // Y las dos del propio logotipo, con su mensaje: sin esto, quitar `truncate` o cambiar la
    // forma del `<Marca>` revienta la suma de abajo con un "null" en vez de decir que falta.
    expect(/<Marca className="h-(\d+)/.test(LOGO), "el alto de la marca").toBe(true);
    expect(RE_TAMANO.test(LOGO), "el tamano de la palabra").toBe(true);
  });

  it("la medida es de la palabra que se pinta HOY (la marca en mayusculas)", () => {
    expect(
      MEDIDA.palabra,
      `la medida es de «${MEDIDA.palabra}» y el logo pinta «${MARCA.toUpperCase()}»: vuelve a medir ` +
        "el ancho de la palabra (ver el docblock) y actualiza MEDIDA",
    ).toBe(MARCA.toUpperCase());
  });

  it("marca + hueco + palabra caben, con holgura para el margen de la medida", () => {
    // --- lo que da la columna ---
    const anchoColumna = Number(/\bw-(\d+)\b/.exec(CLASE_LATERAL!)![1]) * U;
    const rellenoNav = Number(/\bp-(\d+)\b/.exec(CLASE_LATERAL!)![1]) * U * 2;
    const rellenoLogo = (Number(/px-(\d+)/.exec(USO_LOGO)?.[1] ?? 0) || 0) * U * 2;
    const disponible = anchoColumna - rellenoNav - rellenoLogo;

    // --- lo que pide el logotipo ---
    const altoMarca = Number(/<Marca className="h-(\d+)/.exec(LOGO)![1]) * U;
    const anchoMarca = (altoMarca * Number(VIEWBOX![1])) / Number(VIEWBOX![2]);
    const hueco = Number(/items-center gap-(\d+)/.exec(LOGO)![1]) * U;
    const clasePalabra = RE_TAMANO.exec(LOGO)![1]!;
    const tamanoPalabra = pxDe(clasePalabra);
    expect(
      tamanoPalabra,
      `${clasePalabra} no esta en la escala ni es un tamano en px`,
    ).toBeDefined();
    const anchoPalabra = tamanoPalabra! * MEDIDA.em;

    const total = anchoMarca + hueco + anchoPalabra;
    // 10 px de holgura: la medida de la palabra tiene un ~3% de error (unos 4 px a este tamano) y
    // un logotipo pegado al borde se lee como un fallo aunque tecnicamente quepa.
    expect(
      Math.round(total),
      `el logotipo pide ${Math.round(total)} px y la columna da ${disponible}`,
    ).toBeLessThanOrEqual(disponible - 10);
  });
});

describe("y si algun dia no cupiera, no empuja la columna", () => {
  it("el conjunto esta contenido y la palabra cede antes que el bloque", () => {
    // La valvula, no el plan: con la fuente de reserva las metricas son otras y pueden venir mas
    // anchas. Entre recortar la palabra y romper el ancho de la nav, se recorta.
    expect(LOGO).toMatch(/role="img"[\s\S]*?className=\{`[^`]*min-w-0[^`]*max-w-full/);
    expect(LOGO).toMatch(/className="min-w-0 truncate/);
  });

  it("y la marca NO se encoge: el rayo se deforma, la palabra no", () => {
    expect(LOGO).toMatch(/<Marca className="[^"]*shrink-0/);
  });
});
