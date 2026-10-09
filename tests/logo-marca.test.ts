/**
 * EL LOGOTIPO — una sola marca, y las tres decisiones que la sostienen.
 *
 * El cromo llevaba la palabra "DAREFLASH" en texto pelado. Ahora lleva `Logo`, y lo que este test
 * impide es que la marca vuelva a estar en dos sitios a la vez o se pinte de una forma que la deje
 * invisible:
 *
 *  - EL LITERAL VIVE EN UN SOLO FICHERO. Escribirlo otra vez en el cromo crea una segunda marca que
 *    puede discrepar de la primera (y discrepa: la de verdad lleva el rayo y la copia no).
 *  - EL RAYO ES EL MISMO QUE EL DEL FAVICON. No es una coincidencia bonita: son la misma silueta, y
 *    si alguien rediseña una y no la otra, el icono de la pestaña deja de ser el logotipo. El
 *    trazado se compara CARÁCTER A CARÁCTER con `src/app/icon.svg`.
 *  - EL COLOR ENTRA POR `currentColor`. Los atributos de presentación de un SVG no admiten `var()`
 *    de forma fiable, así que un `fill="var(--df-action)"` se queda sin pintar en algunos
 *    navegadores: el rayo desaparece y nada falla. El color baja desde la clase del `<svg>`, que sí
 *    es CSS. (La fuente sí puede ir en `var(--font-display)`: eso es una propiedad CSS normal, no un
 *    atributo del SVG — por eso la regla habla de los tokens de COLOR y no de `var()` en general.)
 *
 * Para romperlo a propósito: volver a escribir "DAREFLASH" en `navegacion.tsx` (rojo), cambiar el
 * trazado del rayo solo en el logotipo (rojo), o pintar el rayo con `fill="var(--df-action)"` (rojo).
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = path.resolve(__dirname, "..");
const leer = (rel: string): string => readFileSync(path.resolve(RAIZ, rel), "utf8");

const LOGO = leer("src/components/ui/logo.tsx");
const ICONO = leer("src/app/icon.svg");
const NAV = leer("src/components/ui/navegacion.tsx");

/** La palabra de la marca, tal cual se pinta. */
const PALABRA = "DAREFLASH";

describe("la marca se escribe en UN sitio", () => {
  it("el logotipo lleva la palabra", () => {
    expect(LOGO).toContain(PALABRA);
  });

  it("y el cromo ya no la escribe: la pide al logotipo", () => {
    // Sin comentarios: un comentario que mencione `Logo` no lo monta.
    const sinComentarios = NAV.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(sinComentarios).not.toContain(PALABRA);
    expect(sinComentarios).toMatch(/<Logo[\s/>]/);
    expect(sinComentarios).toMatch(/from "\.\/logo"/);
  });

  /**
   * Los ÚNICOS ficheros que pueden escribir la palabra, y por qué. La guía de estilo la usa como
   * TÍTULO de la página del sistema de diseño (un `<h1>` que enseña la tipografía display a tamaño
   * héroe): no es el cromo del producto, es la portada de la referencia.
   */
  const PERMITIDOS: Record<string, string> = {
    "src/components/ui/logo.tsx": "es el logotipo",
    "src/app/style-guide/page.tsx": "es el título de la página de referencia, no el cromo",
  };

  it("nadie más la escribe en una vista", () => {
    const conPalabra: string[] = [];
    for (const f of readdirSync(path.resolve(RAIZ, "src"), { recursive: true }) as string[]) {
      const rel = `src/${f.split(path.sep).join("/")}`;
      if (rel.startsWith("src/generated/")) continue;
      if (!/\.tsx?$/.test(rel)) continue;
      const texto = leer(rel)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      if (texto.includes(PALABRA)) conPalabra.push(rel);
    }
    const intrusos = conPalabra.filter((f) => !(f in PERMITIDOS)).sort();
    expect(intrusos, "usa <Logo />; la palabra se escribe en logo.tsx").toEqual([]);
  });

  it("y los permitidos siguen escribiéndola: no se aparcan permisos muertos", () => {
    for (const f of Object.keys(PERMITIDOS)) {
      expect(leer(f), `${f} ya no la escribe: quita su permiso`).toContain(PALABRA);
    }
  });
});

describe("el rayo del logotipo y el del favicon son el MISMO", () => {
  const delIcono = /<path\s+d="([^"]+)"/.exec(ICONO)?.[1];
  const delLogo = /const RAYO = "([^"]+)"/.exec(LOGO)?.[1];

  it("se encontraron los dos trazados (si no, lo de abajo no compara nada)", () => {
    expect(delIcono, "no está el <path> del favicon").toBeTruthy();
    expect(delLogo, "no está la constante RAYO del logotipo").toBeTruthy();
  });

  it("son idénticos", () => {
    expect(delLogo).toBe(delIcono);
  });
});

describe("el color del logotipo sale del token, no de un atributo", () => {
  it("el SVG pinta con currentColor", () => {
    expect(LOGO).toContain('stroke="currentColor"');
    expect(LOGO).toContain('fill="currentColor"');
  });

  it("y el token baja por una clase de color, no por var() en un atributo", () => {
    expect(LOGO).toMatch(/className="[^"]*text-action/);
    // SE MIDE EL CÓDIGO, NO LA PROSA, y lo descubrió este mismo caso al nacer: el docblock del
    // logotipo cita `var(--df-*)` para explicar justo esta regla, y el test lo leía como una
    // infracción — un comentario fabricando un ROJO falso, que es el mismo fallo que un comentario
    // fabricando un verde falso. Los comentarios se quitan antes de mirar.
    const codigo = LOGO.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const atributos = [...codigo.matchAll(/(?:fill|stroke)="([^"]*)"/g)].map((m) => m[1]!);
    expect(atributos.length).toBeGreaterThanOrEqual(3);
    for (const v of atributos) expect(v).not.toMatch(/var\(/);
    // `var(--font-display)` queda fuera de la regla a propósito: es una propiedad CSS del `<span>`
    // de la palabra, no un atributo del SVG, y ahí `var()` sí es fiable.
    expect(codigo).not.toMatch(/var\(--(?:df|color)-/);
  });
});

describe("se anuncia una vez", () => {
  it("el contenedor es role=img con el nombre de la marca, y el svg va aria-hidden", () => {
    expect(LOGO).toContain('role="img"');
    expect(LOGO).toContain('aria-label="DareFlash"');
    expect(LOGO).toContain('aria-hidden="true"');
  });
});
