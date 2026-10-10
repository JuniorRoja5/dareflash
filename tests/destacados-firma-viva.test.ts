/**
 * LA FIRMA VIVA DE LOS DESTACADOS — dentro del brief, igual en las dos superficies, y barata.
 *
 * Toca MARCA, así que lo que se fija no es "que se vea bien": son las cuatro cosas que, sueltas, la
 * convierten en otra cosa.
 *
 *  1. DENTRO DEL BRIEF: cristal, tokens `--df-*`, cero hex y cero `rgb()`. Un hex se ve bien en UN
 *     tema; el otro no lo mira nadie hasta que un usuario lo activa. Y cero neón: el color del
 *     rescoldo no se escribe, se DERIVA de los glows de marca.
 *  2. TODOS IGUALES: una sola clase de tarjeta, rejilla uniforme, ningún perfil central ni mayor.
 *     Es regla de producto: el orden ya premia al último en activar, el tamaño no premia a nadie.
 *  3. LA FIRMA VIVE EN LA PRIMITIVA, así que entra en la vitrina y en la fila de la portada a la
 *     vez. Dos copias significarían "destacado" dos cosas distintas según dónde mirases.
 *  4. SOLO `opacity` Y `transform`: animar `box-shadow` o `filter` repinta en cada fotograma, y aquí
 *     hay hasta cien tarjetas. Eso es el scroll de la vitrina a tirones.
 *
 * Y el fondo ambiental es de /destacados y NO de /inicio.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();
const crudo = (...p: string[]) => readFileSync(join(RAIZ, ...p), "utf8");
/** Sin comentarios: los docblocks de esta pieza explican las reglas, y explicarlas no es aplicarlas. */
const leer = (...p: string[]) =>
  crudo(...p)
    .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const SHELL = ["src", "app", "(app)", "(shell)"];
const TARJETA = ["src", "components", "ui", "tarjeta-destacado.tsx"];
const VITRINA = [...SHELL, "destacados", "page.tsx"];
const FONDO = [...SHELL, "destacados", "fondo-rescoldo.tsx"];
const FILA = [...SHELL, "inicio", "boost-destacados.tsx"];
const CSS = ["src", "app", "globals.css"];

/** El CSS sin comentarios de bloque: un `/* … *​/` que mencione `box-shadow` no lo anima. */
const css = () => crudo(...CSS).replace(/\/\*[\s\S]*?\*\//g, "");

describe("la firma vive en la primitiva: entra en las dos superficies a la vez", () => {
  it("la tarjeta monta el halo que respira", () => {
    const t = leer(...TARJETA);
    expect(t).toMatch(/className="df-halo df-respira"/);
    // Y le pasa SU color por token: sin esto el halo cae en un gris neutro.
    expect(t).toContain("--df-halo-color");
    // ┌─ ESTE CASO CLAVABA UN BUG ────────────────────────────────────────────────────────────────┐
    // │ Exigía `var(--df-action)`: el verde de marca, el mismo para las cuarenta caras. Era la    │
    // │ implementación de entonces escrita como si fuera la regla, así que el día que el halo     │
    // │ pasó a decir el NIVEL de cada persona, el guard defendió el fallo en vez del acuerdo.     │
    // │ Lo que de verdad importa es que el color salga de un TOKEN y no de un hex; cuál token es  │
    // │ por persona, y eso se mide con el componente montado en `render/destacado-halo-nivel`.    │
    // └───────────────────────────────────────────────────────────────────────────────────────────┘
    expect(t, "el halo volvió a un color a mano").not.toMatch(/--df-halo-color[^;}]*#[0-9a-f]/i);
    expect(t, "el halo dejó de salir del nivel").toContain("conEmblema.tokenColor");
  });

  it("y recorta: al respirar escala, y sin recorte la luz se sale de las esquinas", () => {
    expect(leer(...TARJETA)).toContain("overflow-hidden");
  });

  it("el contenido va por encima del halo", () => {
    // Un elemento POSICIONADO se pinta sobre el contenido en flujo de sus hermanos: sin el
    // envoltorio `relative`, la cara y el nombre quedarían DEBAJO de la luz.
    const t = leer(...TARJETA);
    const halo = t.indexOf("df-halo");
    const envoltorio = t.indexOf('className="relative flex w-full flex-col');
    expect(envoltorio, "no encuentro el envoltorio del contenido").toBeGreaterThan(-1);
    expect(envoltorio).toBeGreaterThan(halo);
  });

  it("ninguna de las dos superficies se la pinta por su cuenta", () => {
    // Si la vitrina o la portada montaran su propio halo, la firma dejaría de ser una.
    for (const [donde, ruta] of [
      ["la vitrina", VITRINA],
      ["la portada", FILA],
    ] as const) {
      expect(leer(...ruta), `${donde} pinta su propio halo`).not.toMatch(/df-halo|df-respira/);
      expect(leer(...ruta)).toContain("<TarjetaDestacado");
    }
  });
});

describe("todos iguales: ningún perfil central ni mayor", () => {
  it("la tarjeta solo distingue DOS tamaños, y por la superficie, no por la persona", () => {
    const t = leer(...TARJETA);
    // `vitrina` depende del sitio donde se pinta, nunca de quién es ni de su posición.
    expect(t).toMatch(/const vitrina = tamano === "vitrina";/);
    expect(t, "el tamaño depende de la posición en la fila").not.toMatch(
      /posicion\s*===\s*1|posicion\s*<|destacar(Primero|Central)/,
    );
  });

  it("la rejilla de la vitrina es uniforme: sin huecos especiales", () => {
    const v = leer(...VITRINA);
    expect(v).toMatch(/grid-cols-2 .*sm:grid-cols-3 .*lg:grid-cols-4 .*xl:grid-cols-5/);
    // Un `col-span` o un `row-span` serían una celda más grande para alguien.
    expect(v, "hay una celda de tamaño distinto").not.toMatch(/col-span|row-span/);
  });

  it("y la fila de la portada tampoco agranda a nadie", () => {
    expect(leer(...FILA), "hay una celda de tamaño distinto").not.toMatch(/col-span|row-span/);
  });

  it("el orden premia al último en activar; el tamaño no premia a nadie", () => {
    // La vitrina ni numera: el orden es cronológico, no de mérito (ver su docblock).
    expect(leer(...VITRINA), "la vitrina numera").not.toMatch(/posicion=/);
  });
});

describe("el fondo ambiental es de la vitrina, no de la portada", () => {
  it("la vitrina lo monta", () => {
    expect(leer(...VITRINA)).toContain("<FondoRescoldo");
  });

  it("y la portada NO", () => {
    // En /inicio ya hay un hero y un vídeo de fondo: un segundo fondo animado haría una feria.
    expect(leer(...FILA), "el rescoldo se cuela en la portada").not.toMatch(
      /FondoRescoldo|df-rescoldo/,
    );
    const inicio = leer(...SHELL, "inicio", "page.tsx");
    expect(inicio, "el rescoldo se cuela en la portada").not.toMatch(/FondoRescoldo|df-rescoldo/);
  });

  it("va como HERMANO del contenedor, no dentro", () => {
    // La capa es `fixed` y el contenedor anima `transform` (`df-rise`): dentro, le crearía bloque
    // contenedor y se quedaría recortada. Es la trampa que ya enseñó el fondo de vídeo.
    const v = leer(...VITRINA);
    const fondo = v.indexOf("<FondoRescoldo");
    const contenedor = v.indexOf('<div className="df-rise');
    expect(fondo).toBeGreaterThan(-1);
    expect(contenedor).toBeGreaterThan(-1);
    expect(fondo, "el fondo está dentro del contenedor").toBeLessThan(contenedor);
  });

  it("y no lleva ni un color propio: todo sale de los glows de marca", () => {
    const f = leer(...FONDO);
    expect(f, "el fondo escribe colores").not.toMatch(/#[0-9a-f]{3,8}\b|\brgba?\(|var\(--df-/i);
    const hoja = css();
    const regla = /\.df-rescoldo\s*\{[\s\S]*?\}/.exec(hoja)?.[0] ?? "";
    expect(regla.length, "no encuentro la regla del rescoldo").toBeGreaterThan(50);
    expect(regla).toContain("var(--df-glow-accion)");
    expect(regla).toContain("var(--df-glow-money)");
    expect(regla, "el rescoldo escribe un color a mano").not.toMatch(/#[0-9a-f]{3,8}\b|\brgba?\(/i);
  });
});

describe("cero color a mano, cero neón", () => {
  it.each([
    ["la tarjeta", TARJETA],
    ["la vitrina", VITRINA],
    ["la fila", FILA],
    ["el fondo", FONDO],
  ])("%s no lleva hex ni rgb()", (_, ruta) => {
    const src = leer(...ruta);
    expect(src, "hex a mano").not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(src, "rgb()/rgba() a mano").not.toMatch(/\brgba?\(/);
    expect(src, "hsl() a mano").not.toMatch(/\bhsla?\(/);
  });

  it("y los tokens que usan existen en globals.css", () => {
    const todo = [TARJETA, VITRINA, FILA, FONDO].map((r) => leer(...r)).join("\n");
    const vars = [...todo.matchAll(/var\((--df-[a-z0-9-]+)\)/g)].map((m) => m[1]);
    expect(vars.length).toBeGreaterThan(1);
    const hoja = crudo(...CSS);
    for (const v of new Set(vars)) expect(hoja, `${v} no existe`).toContain(`${v}:`);
  });

  it("las luces nuevas se DERIVAN de la paleta con `color-mix`, no son colores nuevos", () => {
    // Es lo que hace imposible que acaben en neón y lo que las hace cambiar con el tema.
    const hoja = css();
    for (const glow of ["--df-glow-accion", "--df-glow-money"]) {
      const regla = new RegExp(`${glow}:[\\s\\S]*?;`).exec(hoja)?.[0] ?? "";
      expect(regla.length, `no encuentro ${glow}`).toBeGreaterThan(20);
      expect(regla, `${glow} escribe un color a mano`).toContain("color-mix(");
    }
  });
});

describe("el movimiento es barato: solo `opacity` y `transform`", () => {
  const hoja = css();

  it.each(["df-respira", "df-rescoldo"])("@keyframes %s no anima nada que repinte", (nombre) => {
    const bloque = new RegExp(`@keyframes ${nombre}\\s*\\{[\\s\\S]*?\\n\\}`).exec(hoja)?.[0] ?? "";
    expect(bloque.length, `no encuentro @keyframes ${nombre}`).toBeGreaterThan(50);
    // Lo que se permite dentro de los fotogramas: opacidad y transform. Nada más.
    const propiedades = [...bloque.matchAll(/^\s{4}([a-z-]+):/gm)].map((m) => m[1]);
    expect(propiedades.length).toBeGreaterThan(1);
    expect([...new Set(propiedades)].sort()).toEqual(["opacity", "transform"]);
  });

  it("y no hay `will-change` por tarjeta: cien capas permanentes cuestan más de lo que ahorran", () => {
    const respira = /\.df-respira\s*\{[\s\S]*?\}/.exec(hoja)?.[0] ?? "";
    expect(respira.length).toBeGreaterThan(20);
    expect(respira, "fija una capa permanente por tarjeta").not.toContain("will-change");
    // En el fondo SÍ: es UNA capa en toda la pantalla.
    expect(/\.df-rescoldo\s*\{[\s\S]*?\}/.exec(hoja)?.[0] ?? "").toContain("will-change");
  });

  it("las duraciones son LENTAS y salen de tokens", () => {
    // Por debajo de unos 5 s deja de leerse como "está vivo" y pasa a parpadeo, con varias tarjetas
    // a la vez. Los números viven en `:root`, no dentro de la animación.
    expect(hoja).toMatch(/--df-dur-respira:\s*\d{4,}ms/);
    expect(hoja).toMatch(/--df-dur-rescoldo:\s*\d{4,}ms/);
    expect(/\.df-respira\s*\{[\s\S]*?\}/.exec(hoja)?.[0] ?? "").toContain("var(--df-dur-respira)");
    expect(/\.df-rescoldo\s*\{[\s\S]*?\}/.exec(hoja)?.[0] ?? "").toContain(
      "var(--df-dur-rescoldo)",
    );
  });

  it("el movimiento es CSS, nunca JS: `prefers-reduced-motion` no puede apagar un bucle de JS", () => {
    for (const ruta of [TARJETA, VITRINA, FILA, FONDO]) {
      expect(leer(...ruta), ruta.join("/")).not.toMatch(
        /requestAnimationFrame|\.animate\(|setInterval/,
      );
    }
  });
});

describe("prefers-reduced-motion lo apaga TODO", () => {
  it("la regla global cubre animaciones y transiciones de cualquier elemento", () => {
    // Es lo que hace que respirar, el flote y el rescoldo se apaguen sin que cada pieza se acuerde.
    const hoja = css();
    const bloque =
      /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\n\}/.exec(hoja)?.[0] ?? "";
    expect(bloque.length, "no encuentro la regla global").toBeGreaterThan(50);
    expect(bloque).toMatch(/animation-duration:\s*0\.01ms\s*!important/);
    expect(bloque).toMatch(/animation-iteration-count:\s*1\s*!important/);
    expect(bloque).toMatch(/transition-duration:\s*0\.01ms\s*!important/);
    // Sobre `*`: si se limitara a unas clases, cada animación nueva tendría que acordarse.
    expect(bloque).toMatch(/\*,/);
  });

  it("y ninguna de las dos clases nuevas se salta la regla con su propia media query", () => {
    const hoja = css();
    for (const clase of [".df-respira", ".df-rescoldo"]) {
      const regla = new RegExp(`\\${clase}\\s*\\{[\\s\\S]*?\\}`).exec(hoja)?.[0] ?? "";
      expect(regla, `${clase} se declara con !important`).not.toContain("!important");
    }
  });
});

describe("el detector mira el CÓDIGO, no el comentario", () => {
  it("quitar comentarios cambia los ficheros", () => {
    for (const ruta of [TARJETA, VITRINA, FILA, FONDO]) {
      expect(leer(...ruta).length, ruta.join("/")).toBeLessThan(crudo(...ruta).length);
    }
    expect(css().length).toBeLessThan(crudo(...CSS).length);
    // Controles reales: el fondo NOMBRA en prosa los tokens que no escribe, y el CSS menciona
    // `box-shadow` y `filter` justo para decir que no los anima.
    expect(crudo(...FONDO)).toContain("--df-glow-accion");
    expect(leer(...FONDO)).not.toContain("--df-glow-accion");
    expect(crudo(...CSS)).toMatch(/box-shadow` o `filter/);
  });
});
