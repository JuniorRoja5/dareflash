/**
 * EL HALO DEL VIP: CON QUÉ SE PINTA, CUÁNTO CUESTA Y QUIÉN PUEDE MONTARLO.
 *
 * Estructural: no comprueba que se vea bien —eso son las capturas— sino las tres decisiones que un
 * refactor puede deshacer sin que nada se queje.
 *
 *  1. EL COLOR. `--vip-gold` y ningún otro. `--df-action` es de BOOST (quien paga por alcance) y
 *     `--df-rank` es del PODIO (puesto 1/2/3): pintar al VIP con cualquiera de los dos sería decir
 *     que compró alcance o que va primero, y las dos cosas son comprobables y falsas.
 *  2. EL COSTE. En el feed el halo tiene que ser CSS estático. Nada de un nodo por tarjeta, ni un
 *     efecto, ni una animación: el feed es lo más caro de la app y esto es una marca cosmética.
 *     (Y siendo estático, `prefers-reduced-motion` no tiene nada que apagar, que es la forma más
 *     barata de respetarlo.)
 *  3. EL CANDADO. La clase solo sale de `claseHaloVip`. Escrita a mano en una cuarta superficie,
 *     alguien la pondrá con una condición que no es la del chokepoint.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();
const CSS = readFileSync(join(RAIZ, "src", "app", "globals.css"), "utf8");

/** El cuerpo de una regla CSS por su selector. */
function regla(selector: string): string {
  const i = CSS.indexOf(`\n${selector} {`);
  expect(i, `no existe la regla \`${selector}\``).toBeGreaterThan(-1);
  const fin = CSS.indexOf("\n}", i);
  return CSS.slice(i, fin);
}

const REGLAS = [".df-vip-halo", ".df-vip-halo-fila", ".df-vip-halo-fila::before"];

describe("el halo se pinta con el oro del VIP y con ningún otro", () => {
  it.each(REGLAS)("%s usa `--vip-gold`", (selector) => {
    expect(regla(selector)).toContain("var(--vip-gold)");
  });

  it.each(REGLAS)("%s NO usa el verde de Boost ni el oro del podio", (selector) => {
    const cuerpo = regla(selector);
    expect(cuerpo, "eso es el color de BOOST: diría que compró alcance").not.toContain(
      "--df-action",
    );
    expect(cuerpo, "eso es el oro del PODIO: diría que va primero").not.toContain("--df-rank");
    expect(
      cuerpo,
      "un color a mano se queda con el valor viejo en el próximo repintado",
    ).not.toMatch(/#[0-9a-f]{3,8}\b|\brgb\(/i);
  });
});

describe("la intensidad vive en UN token", () => {
  it("`--vip-halo-fuerza` está definido en los DOS temas, con valores distintos", () => {
    // Uno solo compartido no valdría: sobre blanco el oro no es luz, es sombra. Es el mismo
    // razonamiento (y el mismo oficio) que `--df-halo-fuerza` y `--vip-bloom`.
    //
    // Se miran los bloques `:root`, no todo el fichero: el tercer sitio donde aparece el token es
    // el interruptor de móvil del feed (`--vip-halo-fuerza: 0`), que es otra cosa y tiene su caso.
    const bloque = (selector: string): string => {
      const i = CSS.indexOf(selector);
      expect(i, `no existe el bloque \`${selector}\``).toBeGreaterThan(-1);
      return CSS.slice(i, CSS.indexOf("\n}", i));
    };
    const valor = (selector: string): string | undefined =>
      /--vip-halo-fuerza:\s*([^;]+);/.exec(bloque(selector))?.[1]?.trim();

    const oscuro = valor('[data-theme="dark"] {');
    const claro = valor('[data-theme="light"] {');

    expect(oscuro, "falta en el tema oscuro").toBeTruthy();
    expect(claro, "falta en el tema claro").toBeTruthy();
    expect(
      oscuro,
      "los dos temas usan la misma fuerza: sobre blanco el oro no pesa igual",
    ).not.toBe(claro);
  });

  it("y TODOS los porcentajes del halo pasan por él (subirlo es una línea, no una cacería)", () => {
    for (const selector of REGLAS) {
      const cuerpo = regla(selector);
      // Cada porcentaje que aparezca tiene que ir multiplicado por la fuerza. Si alguien añade un
      // `35%` suelto, el mando deja de mandar sobre esa parte y nadie lo nota hasta que lo mueve.
      for (const m of cuerpo.matchAll(/(\d+(?:\.\d+)?)%/g)) {
        const alrededor = cuerpo.slice(Math.max(0, m.index - 60), m.index + 60);
        // El `transparent 42%` de un degradado es una PARADA, no una cantidad de color: no se
        // escala (escalarla movería dónde acaba el lavado, no cuánto tiñe).
        if (/transparent\s+\d/.test(cuerpo.slice(Math.max(0, m.index - 14), m.index + 6))) continue;
        expect(alrededor, `${selector}: el ${m[0]} no pasa por --vip-halo-fuerza`).toContain(
          "--vip-halo-fuerza",
        );
      }
    }
  });

  it("la opacidad de la barra de la fila también (si no, se queda encendida al bajar el mando)", () => {
    expect(regla(".df-vip-halo-fila::before")).toContain("opacity: var(--vip-halo-fuerza)");
  });

  it("y el marco del feed se apaga en móvil con ese MISMO mando, no con otra regla", () => {
    // Anular las tres declaraciones por separado es como se desincronizan: se añade una cuarta al
    // halo y nadie se acuerda de anularla también.
    const movil = /@media \(max-width: 63\.999rem\) \{\s*\.df-vip-halo-solo-marco \{([^}]*)\}/.exec(
      CSS,
    );
    expect(movil, "ya no está la regla que apaga el halo del feed en móvil").toBeTruthy();
    expect(movil![1]).toContain("--vip-halo-fuerza: 0");
  });
});

describe("es estático: nada que recalcular por tarjeta", () => {
  it.each(REGLAS)("%s no anima ni transiciona nada", (selector) => {
    const cuerpo = regla(selector);
    expect(
      cuerpo,
      "una animación por tarjeta en el feed es justo lo que no puede haber",
    ).not.toMatch(/\banimation\b|\btransition\b/);
  });

  it("y el feed no monta un nodo ni un efecto para el halo", () => {
    const feed = readFileSync(join(RAIZ, "src", "components", "feed", "feed-vertical.tsx"), "utf8");
    // Sobre el CÓDIGO: el docblock del marco EXPLICA el halo, y una explicación no cuesta nada.
    const codigo = feed.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "").replace(/^\s*\/\/.*$/gm, "");

    // El halo entra por el `className` del marco y por nada más: ni un `<span>` aparte, ni un
    // `useEffect`, ni un observador. Tres menciones: el import, la llamada y el interruptor de
    // móvil. Una cuarta es un nodo o un efecto que alguien añadió.
    const menciones = [...codigo.matchAll(/df-vip-halo|claseHaloVip/g)].length;
    expect(menciones, "el halo aparece más veces de las esperadas en el feed").toBe(3);
    expect(codigo).toContain("claseHaloVip(post.autorVip)");
    // Y ni un hook nuevo a cuenta del halo: lo que haya de `useEffect`/`useRef` en el feed es del
    // reproductor y del scroll, no de una marca cosmética.
    expect(codigo).not.toMatch(/use(Effect|State|Memo|Ref)\([^)]*vip/i);
  });
});

describe("el candado: la clase solo sale de `claseHaloVip`", () => {
  function fuentesDe(dir: string): string[] {
    const out: string[] = [];
    for (const entrada of readdirSync(dir)) {
      const full = join(dir, entrada);
      if (statSync(full).isDirectory()) out.push(...fuentesDe(full));
      else if (entrada.endsWith(".ts") || entrada.endsWith(".tsx")) out.push(full);
    }
    return out;
  }

  it("nadie escribe `df-vip-halo` a mano fuera de la puerta", () => {
    const puerta = join("src", "components", "ui", "halo-vip.ts");
    const culpables = fuentesDe(join(RAIZ, "src"))
      .filter((f) => !f.includes(join("src", "generated")))
      .filter((f) => relative(RAIZ, f) !== puerta)
      .filter((f) => {
        const codigo = readFileSync(f, "utf8")
          .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "")
          .replace(/^\s*\/\/.*$/gm, "");
        // `df-vip-halo-solo-marco` SÍ puede escribirse: no es el halo, es el interruptor de dónde
        // se aplica, y es decisión de la superficie (solo el feed tiene una maqueta de móvil
        // distinta). Lo que no puede escribirse es el halo mismo.
        return /["'`][^"'`]*\bdf-vip-halo(?!-solo-marco)\b/.test(codigo);
      })
      .map((f) => relative(RAIZ, f));

    expect(
      culpables,
      "usa `claseHaloVip`: ahí vive la condición de quién es VIP, y una copia la escribirá mal",
    ).toEqual([]);
  });

  it("y la puerta exige el `esVip` resuelto: no lo consulta por su cuenta", () => {
    const puerta = readFileSync(join(RAIZ, "src", "components", "ui", "halo-vip.ts"), "utf8");
    // Si el halo mirara la suscripción, una lista de veinte filas serían veinte consultas y además
    // habría dos sitios decidiendo quién es VIP — lo que el chokepoint existe para evitar.
    expect(puerta).not.toMatch(/import .*(prisma|vip|subscription)/i);
    expect(puerta, "la puerta dejó de ser pura").not.toMatch(/async|await|use[A-Z]/);
  });
});

describe("el PODIO se queda fuera, y es deliberado", () => {
  it("no monta el halo: dos oros pegados no se leen", () => {
    // El podio marca el puesto 1/2/3 con `--df-rank` (oro) y sus medallas. Poner ahí el oro del
    // VIP sería exactamente la colisión que el producto ya evita en el aro del avatar
    // (`anilloSePisaConPuesto`). Un VIP del podio se sigue reconociendo por su nombre en oro y su
    // píldora, que es la marca de identidad de siempre.
    const podio = readFileSync(
      join(RAIZ, "src", "app", "(app)", "(shell)", "ranking", "podio-ranking.tsx"),
      "utf8",
    );
    expect(podio).not.toContain("df-vip-halo");
    expect(podio).not.toContain("claseHaloVip");
  });
});
