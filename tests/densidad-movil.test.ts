/**
 * DENSIDAD EN MÓVIL — vistazo ≠ reproducción.
 *
 * Tres pantallas se veían apretadas en producción (listado de retos, ficha del detalle y rejilla de
 * participaciones) y las tres tenían el MISMO origen: una miniatura 9:16 a ancho completo en una
 * superficie de VISTAZO. El 9:16 es correcto cuando el vídeo ES la pantalla; en una rejilla significa
 * que ver quién participa cuesta un scroll por persona.
 *
 * Esto es CSS, así que no se puede ejecutar en Node: se fija por estructura. Lo que protege no es un
 * número de píxeles —eso lo ajusta Sergio— sino la DECISIÓN de que las dos proporciones no se mezclen,
 * que es lo que se deshace solo en cuanto alguien "unifique" la caja otra vez.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const raiz = path.resolve(__dirname, "..");
const leer = (rel: string): string => readFileSync(path.join(raiz, rel), "utf8");

/** Sobre el CÓDIGO: un comentario que explica por qué ya no hay un 9:16 no es un 9:16. */
const soloCodigo = (fuente: string): string =>
  fuente.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "").replace(/^\s*\/\/.*$/gm, "");

const CAJA = "src/components/ui/caja-video.tsx";
const REJILLA = "src/app/(app)/(shell)/retos/[codigo]/participaciones-reto.tsx";
const TARJETA = "src/app/(app)/(shell)/retos/tarjeta-reto.tsx";
const FICHA = "src/app/(app)/(shell)/retos/[codigo]/page.tsx";

describe("la primitiva distingue las dos proporciones", () => {
  it("ofrece `reproduccion` y `miniatura`, y la miniatura NO es 9:16 en móvil", () => {
    const src = leer(CAJA);
    expect(src).toContain("reproduccion:");
    expect(src).toContain("miniatura:");
    // La de reproducción sigue siendo la de siempre.
    expect(src).toMatch(/reproduccion:\s*"aspect-\[9\/16\] lg:aspect-video"/);
    // Y la de vistazo NO puede ser 9:16: es justo lo que reventaba la densidad.
    expect(src).not.toMatch(/miniatura:\s*"aspect-\[9\/16\]/);
    expect(src).toMatch(/miniatura:\s*"aspect-\[[^\]]+\] lg:aspect-video"/);
  });

  it("el DEFECTO es `reproduccion`: el feed y el modal no cambian sin pedirlo", () => {
    // Si el defecto fuera `miniatura`, el reproductor del detalle se encogería sin que nadie lo pida.
    expect(leer(CAJA)).toContain('proporcion = "reproduccion"');
  });

  it("la proporción vive SOLO en la primitiva, no suelta en cada rejilla", () => {
    // Un `aspect-*` a mano en el consumidor es como llegamos aquí: cada superficie decidiendo por su
    // cuenta y divergiendo. La rejilla pide una PROPORCIÓN, no una clase.
    const celda = soloCodigo(leer(REJILLA));
    expect(celda).toContain('proporcion="miniatura"');
    expect(celda).not.toMatch(/<CajaVideo[\s\S]{0,400}?aspect-\[/);
  });
});

describe("rejilla de participaciones: varias por pantalla", () => {
  it("son DOS columnas ya en móvil, no una", () => {
    const src = soloCodigo(leer(REJILLA));
    // Con una sola columna y miniatura 9:16, cada participación ocupaba más de una pantalla.
    expect(src).toMatch(/grid grid-cols-2 /);
    expect(src).not.toMatch(/className="grid gap-4 sm:grid-cols-2/);
  });

  it("la reproducción inmersiva sigue estando al tocar: la rejilla es solo el vistazo", () => {
    // La densidad no puede haberse ganado quitando el feed: se entra a él desde la celda.
    const src = leer(REJILLA);
    expect(src).toContain("<FeedVertical");
    expect(src).toContain("onAbrir");
  });
});

describe("listado de retos: la portada no ocupa la pantalla", () => {
  it("la portada es APAISADA en móvil, y 16:9 en escritorio como estaba", () => {
    const src = soloCodigo(leer(TARJETA));
    expect(src).not.toContain("aspect-[9/16]");
    expect(src).toMatch(/aspect-\[4\/3\][^"]*lg:aspect-video/);
  });
});

describe("ficha del detalle: compacta en móvil, igual en escritorio", () => {
  it("el banner es más bajo en móvil y recupera 16:9 en lg", () => {
    const src = soloCodigo(leer(FICHA));
    expect(src).toMatch(/aspect-\[16\/7\][^"]*lg:aspect-video/);
  });

  it.each([
    ["el relleno de la ficha", /className="p-4 lg:p-6"/],
    ["el título", /text-xl leading-tight[^"]*lg:text-2xl/],
    ["el hueco antes del botón", /mt-5 lg:mt-8/],
    ["la separación entre ficha y participaciones", /gap-5 lg:[^"]*gap-8/],
  ])("%s se aprieta en móvil y se restaura en lg", (_caso, patron) => {
    // Cada uno lleva su `lg:`: comprimir el móvil NO puede cambiar el escritorio, que ya estaba bien.
    expect(soloCodigo(leer(FICHA))).toMatch(patron);
  });
});
