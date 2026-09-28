/**
 * LAS DOS SECCIONES NUEVAS SE PINTAN SOLO CON TOKENS, y por eso funcionan en claro Y en oscuro.
 *
 * EL FALLO QUE EVITA: un `#22c55e` escrito en el JSX se ve bien en oscuro y se pierde sobre blanco —
 * y no falla nada, así que se descubre cuando alguien cambia de tema y ve una barra invisible. Los
 * tokens (`--df-*`) están definidos DOS veces en `globals.css`, uno por tema, y esa es toda la
 * diferencia. Aquí se exige que no haya ni un hexadecimal suelto.
 *
 * Y CERO `--df-money`: los puntos NO son dinero ni se canjean por dinero (Términos, punto 8). El
 * dorado/lima es del premio, del bote y del saldo. Pintar los puntos con él sería decir con el color
 * lo que el texto se cuida de no decir, y el color se lee antes que el texto.
 *
 * Para romperlo: poner un `#hex` o un `rgb(...)` en cualquiera de las dos pantallas (rojo), o usar
 * `text-money` / `--df-money` en ellas (rojo).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();

/** Los ficheros de las dos secciones, más las primitivas que estrenan. */
const AMBITOS = [
  join(RAIZ, "src", "app", "(app)", "(shell)", "puntos"),
  join(RAIZ, "src", "app", "(app)", "(shell)", "referidos"),
];
const SUELTOS = [
  join(RAIZ, "src", "components", "ui", "tarjeta-metrica.tsx"),
  join(RAIZ, "src", "components", "ui", "campo-copiable.tsx"),
  join(RAIZ, "src", "components", "ui", "pasos-keyset.tsx"),
];

function ficheros(dir: string): string[] {
  return readdirSync(dir).flatMap((e) => {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) return ficheros(p);
    return p.endsWith(".tsx") || p.endsWith(".ts") ? [p] : [];
  });
}

const TODOS = [...AMBITOS.flatMap(ficheros), ...SUELTOS];
const relativo = (p: string) => p.slice(RAIZ.length + 1).replace(/\\/g, "/");

/** Sin comentarios: explicar «antes esto era #22c55e» no pinta nada de ese color. */
const codigo = (p: string) =>
  readFileSync(p, "utf8")
    .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "")
    .replace(/^\s*\/\/.*$/gm, "");

describe("hay ficheros que vigilar", () => {
  it("las dos secciones existen y tienen contenido (si no, todo lo de abajo pasa por vacío)", () => {
    // Sin esto, borrar una carpeta dejaría la suite en verde diciendo "no hay hexadecimales".
    for (const dir of AMBITOS) expect(ficheros(dir).length, dir).toBeGreaterThanOrEqual(1);
    expect(TODOS.length).toBeGreaterThanOrEqual(8);
  });
});

describe("cero color escrito a mano", () => {
  it.each(TODOS.map(relativo))("%s no lleva ningún hexadecimal ni rgb()", (rel) => {
    const src = codigo(join(RAIZ, rel));
    // `#fff`, `#22c55e`, `#22c55eff`… Se exige la almohadilla seguida SOLO de dígitos hex, para no
    // cazar un `#historial` de un ancla ni un `#{`.
    expect(src, "hexadecimal a mano").not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(src, "rgb()/hsl() a mano").not.toMatch(/\b(rgba?|hsla?)\s*\(/);
  });

  it.each(TODOS.map(relativo))(
    "%s solo nombra variables del sistema (--df-* / --font-*)",
    (rel) => {
      const src = codigo(join(RAIZ, rel));
      // Cada `var(...)` que se use tiene que ser una variable NUESTRA, declarada en `globals.css`:
      // los `--df-*` (colores, duraciones, sombras) y los `--font-*` (las dos familias). Una variable
      // de otro sitio no tiene versión clara y oscura, que es de lo que va todo esto.
      for (const uso of src.match(/var\(\s*--[\w-]+/g) ?? []) {
        expect(uso, `${rel}: ${uso}`).toMatch(/var\(\s*(--df-|--font-)/);
      }
    },
  );
});

describe("los puntos no son dinero", () => {
  it.each(TODOS.map(relativo))("%s no usa el color del dinero", (rel) => {
    const src = codigo(join(RAIZ, rel));
    expect(src, "--df-money").not.toContain("--df-money");
    // Y tampoco por la clase de Tailwind que resuelve al mismo token.
    expect(src, "clase money").not.toMatch(/\b(text|bg|border|from|to)-money\b/);
    expect(src, "glow del dinero").not.toContain("df-glow-lima");
  });

  it("y el detector NO está roto: en una pieza que SÍ es de dinero lo encuentra", () => {
    // Sin este control, un `toContain` mal escrito dejaría los casos de arriba en verde para siempre.
    // `ImportePremio` es el premio de un reto: ahí el lima es obligatorio, no opcional.
    const premio = codigo(join(RAIZ, "src", "components", "ui", "importe-premio.tsx"));
    expect(premio).toMatch(/--df-money|\b(text|bg|border)-money\b/);
  });
});
