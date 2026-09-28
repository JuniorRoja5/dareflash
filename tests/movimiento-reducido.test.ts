/**
 * CON `prefers-reduced-motion`, LA INSIGNIA NO ANIMA.
 *
 * CÓMO SE CUMPLE, que es lo que este test fija: el medallón del hero flota con `df-float`, una CLASE
 * del sistema, y `globals.css` tiene una regla global que apaga toda animación con `!important`
 * cuando el usuario pide menos movimiento. Es decir, se cumple por construcción y no porque la
 * pantalla se acuerde.
 *
 * LO QUE SE VIGILA SON LAS DOS MITADES DE ESA CONSTRUCCIÓN, porque cualquiera de las dos se puede
 * deshacer en silencio y la otra no avisa:
 *   1. que la regla global siga ahí, y con `!important` (sin él, un `animation` en un `style` inline
 *      la gana y el medallón seguiría flotando);
 *   2. que el hero anime con una clase CSS y NO con JavaScript ni con un `style={{ animation }}`.
 *      Una animación en JS (`requestAnimationFrame`, Web Animations) no la alcanza ninguna media
 *      query: habría que consultarla a mano, y ese "habría que" es justo lo que falla.
 *
 * No se comprueba con un render: jsdom no aplica CSS ni evalúa media queries, así que un render
 * diría "no anima" siempre, en los dos casos. Un verde que no puede ponerse rojo no vigila nada.
 *
 * Para romperlo: quitar `!important` de la regla global (rojo), borrar el bloque entero (rojo), o
 * cambiar `df-float` por una animación inline o en JS en el hero (rojo).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();
const CSS = readFileSync(join(RAIZ, "src", "app", "globals.css"), "utf8");
const HERO = readFileSync(
  join(RAIZ, "src", "app", "(app)", "(shell)", "puntos", "hero-nivel.tsx"),
  "utf8",
);

/**
 * El hero SIN COMENTARIOS, y esto no es cosmética: su docblock EXPLICA que anima con `df-float`,
 * `df-sheen` y `df-barra`. Buscando sobre el fichero entero, "¿usa la clase?" salía verde con solo
 * mencionarla — se podía quitar la clase del JSX y el test seguía pasando, que es la forma más
 * tonta de no vigilar nada. Se juzga lo que se RENDERIZA.
 */
const CODIGO = HERO.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "").replace(/^\s*\/\/.*$/gm, "");

/** El bloque `@media (prefers-reduced-motion: reduce) { … }` entero. */
function bloqueReducido(): string {
  const i = CSS.indexOf("@media (prefers-reduced-motion: reduce)");
  expect(i, "no existe el bloque de movimiento reducido en globals.css").toBeGreaterThan(-1);
  const abre = CSS.indexOf("{", i);
  let nivel = 0;
  for (let j = abre; j < CSS.length; j += 1) {
    if (CSS[j] === "{") nivel += 1;
    if (CSS[j] === "}") {
      nivel -= 1;
      if (nivel === 0) return CSS.slice(i, j + 1);
    }
  }
  throw new Error("el bloque de movimiento reducido no cierra");
}

describe("la red global sigue puesta", () => {
  const bloque = bloqueReducido();

  it("apaga la animación de TODO, no de una lista de clases", () => {
    // El selector es `*` (más ::before/::after): una lista nominal se queda corta en cuanto alguien
    // añade una animación nueva, que es exactamente el caso que hay que cubrir.
    expect(bloque).toMatch(/\*\s*,/);
    expect(bloque).toContain("animation-duration");
    expect(bloque).toContain("animation-iteration-count");
  });

  it("y lo hace con `!important`, que es lo que gana a un estilo inline", () => {
    for (const propiedad of ["animation-duration", "animation-iteration-count"]) {
      const linea = bloque.split("\n").find((l) => l.includes(propiedad));
      expect(linea, `${propiedad} no está`).toBeDefined();
      expect(linea, `${propiedad} sin !important`).toContain("!important");
    }
  });
});

describe("el hero se deja alcanzar por esa red", () => {
  it.each(["df-float", "df-sheen", "df-barra"])(
    "anima con `%s`, una clase del sistema y no un invento local",
    (clase) => {
      expect(CODIGO, `el hero no usa ${clase}`).toContain(clase);
      // Y esa clase existe de verdad en el CSS: un nombre mal escrito no anima y tampoco falla,
      // así que el hero se quedaría quieto SIEMPRE sin que nada se pusiera rojo.
      expect(CSS, `${clase} no está definida en globals.css`).toMatch(
        new RegExp(`\\.${clase}(::after)?\\s*\\{`),
      );
    },
  );

  it("y cada una de esas clases anima de verdad (no es una clase vacía)", () => {
    for (const clase of ["df-float", "df-barra"]) {
      const i = CSS.indexOf(`.${clase} {`);
      expect(i, `${clase} sin bloque`).toBeGreaterThan(-1);
      const bloque = CSS.slice(i, CSS.indexOf("}", i));
      expect(bloque, `${clase} no declara animation`).toContain("animation");
    }
  });

  it("y ese detector no se contenta con un comentario", () => {
    // El propio docblock del hero nombra las tres clases. Si el test mirara el fichero entero,
    // quitarlas del JSX seguiría en verde: esta es la prueba de que se mira el código.
    expect(HERO, "el docblock ya no las explica; revisa el test").toContain("df-barra");
    expect(CODIGO.length).toBeLessThan(HERO.length);
  });

  it("la barra de progreso NO depende de su animación para enseñar el valor", () => {
    // Con movimiento reducido la animación dura 0,01 ms: si el ancho lo pusiera la animación en vez
    // del `style`, la barra se quedaría a cero o saltaría, y estaría mintiendo sobre el progreso.
    // Por eso se anima `transform` (escala) y el ancho final va en el estilo del elemento.
    expect(HERO).toMatch(/width: `\$\{porcentaje\}%`/);
    const barra = CSS.slice(CSS.indexOf("@keyframes df-barra"));
    expect(barra.slice(0, 200)).toContain("transform");
    expect(barra.slice(0, 200)).not.toContain("width");
  });

  it("NO anima por JavaScript ni por un `style` inline, que se saltarían la media query", () => {
    for (const prohibido of [
      /requestAnimationFrame/,
      /\banimate\s*\(/,
      /animation\s*:/,
      /animationName/,
      /keyframes/i,
    ]) {
      expect(CODIGO, String(prohibido)).not.toMatch(prohibido);
    }
  });

  it("y es un componente de SERVIDOR: sin `use client` no hay forma de animar en JS", () => {
    expect(CODIGO).not.toContain('"use client"');
  });
});
