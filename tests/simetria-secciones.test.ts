/**
 * LAS DOS SECCIONES SE VEN DE LA MISMA FAMILIA.
 *
 * /puntos recibió el tratamiento de vida primero y /referidos se quedó a medias: heredó las
 * primitivas pero no el cuerpo, así que una parecía terminada y la otra un borrador de la misma
 * app. Eso no lo caza ningún test de la otra pieza —cada pantalla pasaba sus guards por separado—,
 * y es justo la clase de diferencia que vuelve a aparecer en cuanto se toque una sola de las dos.
 *
 * LO QUE SE FIJA ES EL IDIOMA COMPARTIDO, no el diseño: que los dos heroes sean superficie glass
 * elevada con su halo, y que las listas de las dos vayan con el mismo tratamiento sobrio. Si mañana
 * se decide que el idioma es otro, se cambia aquí y en los dos sitios a la vez — que es el punto.
 *
 * Para romperlo: dejar cualquiera de los dos heroes en `bg-surface` plano (rojo), quitarle el halo
 * a uno (rojo), o darle a una lista el cuerpo del hero (rojo).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();
/** Sin comentarios: un docblock que EXPLIQUE el idioma no lo aplica. */
const leer = (...p: string[]) =>
  readFileSync(join(RAIZ, ...p), "utf8")
    .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const SHELL = ["src", "app", "(app)", "(shell)"];

const HEROES = [
  { seccion: "puntos", fichero: "hero-nivel.tsx" },
  { seccion: "referidos", fichero: "hero-invitacion.tsx" },
] as const;

describe.each(HEROES)("el hero de /$seccion tiene cuerpo", ({ seccion, fichero }) => {
  const src = leer(...SHELL, seccion, fichero);

  it("es superficie GLASS, no un rectángulo plano del color del fondo", () => {
    // El fallo original, literal: `bg-surface` + filete se confunde con la página. El resto del
    // producto (retos, buscar, boost) ya usaba superficie al 60% + desenfoque.
    expect(src, "sin superficie translúcida").toContain("bg-surface/60");
    expect(src, "sin desenfoque").toContain("backdrop-blur");
  });

  it("está ELEVADO con la sombra grande, no con la de una tarjeta cualquiera", () => {
    expect(src).toContain("shadow-[var(--df-shadow-md)]");
  });

  it("lleva el halo, y le pasa SU color (no el de la otra sección)", () => {
    // LA CLASE, no la subcadena: `df-halo` vive DENTRO de `--df-halo-color`, así que un
    // `toContain("df-halo")` pasaba aunque se hubiera borrado la capa que pinta la luz. Se exige
    // el `className` entero.
    expect(src, "sin capa de halo").toMatch(/className="df-halo[ "]/);
    expect(src, "el halo no recibe color").toContain("--df-halo-color");
  });

  it("y ese halo puede recortarse: la tarjeta no deja que la luz se salga", () => {
    // Sin `overflow-hidden` el gradiente desborda las esquinas redondeadas y se ve un rectángulo
    // de luz por fuera del filete. Se ve mal y solo en algunos navegadores.
    expect(src).toContain("overflow-hidden");
  });
});

describe("las listas de las dos van sobrias, y todas igual", () => {
  const LISTAS = [
    { que: "tabla de puntos", src: leer(...SHELL, "puntos", "tabla-puntos.tsx") },
    { que: "historial de puntos", src: leer(...SHELL, "puntos", "historial-mis-puntos.tsx") },
    { que: "escalera de niveles", src: leer(...SHELL, "puntos", "escalera-niveles.tsx") },
    { que: "a quién has invitado", src: leer(...SHELL, "referidos", "page.tsx") },
  ];

  it.each(LISTAS)("$que usa el mismo idioma de tarjeta", ({ src }) => {
    expect(src).toContain("bg-surface/60");
    expect(src).toContain("shadow-[var(--df-shadow-sm)]");
  });

  it.each(LISTAS)("$que NO se pone el cuerpo del hero (la vida va arriba)", ({ src }) => {
    // La sombra grande y el halo son del hero. Si una lista se los pone, la pantalla deja de
    // tener un centro y pasa a ser una feria.
    expect(src, "sombra de hero en una lista").not.toContain("--df-shadow-md");
    expect(src, "halo en una lista").not.toMatch(/className="df-halo[ "]/);
  });
});

describe("el detector no se contenta con un comentario", () => {
  it("las cadenas que busca aparecen en el CÓDIGO, no solo en los docblocks", () => {
    // Control: los heroes EXPLICAN su idioma en el docblock. Si `leer` dejara de quitar
    // comentarios, todo lo de arriba pasaría aunque el JSX estuviera vacío.
    const crudo = readFileSync(join(RAIZ, ...SHELL, "puntos", "hero-nivel.tsx"), "utf8");
    expect(crudo).toContain("df-halo");
    expect(leer(...SHELL, "puntos", "hero-nivel.tsx").length).toBeLessThan(crudo.length);
  });
});
