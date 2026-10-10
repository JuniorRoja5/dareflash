/**
 * EL TINTE VERDE, MEDIDO POR TEMA — y la medida que faltaba.
 *
 * Los glow ambientales (los degradados radiales que dan color al fondo de una sección) tenían UN
 * solo porcentaje para los dos temas, y eso no puede estar bien: sobre negro, un color saturado al
 * 18% ES luz; sobre blanco, lo único que puede hacer es restar luminosidad. Medido por lo que SE VE
 * —ΔE entre el pico del degradado y el fondo—, ese mismo 18% daba 20,1 en oscuro y 11,9 en claro.
 * El mismo número, casi la mitad de presencia. Por eso la fuerza va por tema.
 *
 * LO QUE NADIE MEDÍA, Y ES EL CORAZÓN DE ESTE TEST: el contraste del texto sobre el fondo YA
 * TINTADO. Las reglas de paleta miden token contra token —texto sobre `--df-void`—, pero donde el
 * glow pega, el fondo deja de ser `--df-void`. Al medirlo salió que el tema claro YA INCUMPLÍA con
 * su 18% de siempre: el texto secundario quedaba en 4,36:1 sobre el pico, por debajo de AA. O sea
 * que esto no empezó siendo "subir el tinte": empezó siendo una fuga que llevaba ahí desde que el
 * tema claro nació, y que solo se ve si compones los dos colores antes de medir.
 *
 * Por eso aquí se mide el PICO del degradado, que es el caso peor: es el único límite seguro,
 * porque nada garantiza que no haya una etiqueta justo debajo del centro del radial.
 *
 * Y HAY DOS TINTES DE ACENTO, NO UNO, por un segundo fallo que también llegó a producción: mientras
 * compartían token, subir la fuerza para que el verde se leyera en la vitrina de /destacados se la
 * subió igual a /ranking, a /inicio y a las seis pantallas de acceso — nueve superficies con una
 * fuerza decidida para una. La regla que queda: POR TEMA DONDE TIENE QUE LEERSE, SUAVE DONDE NO.
 * La atmósfera lleva TECHO y la vitrina SUELO, que es lo que impide que vuelvan a confundirse.
 *
 * Para romperlo a propósito: subir un `--df-glow-*-fuerza` hasta que el texto secundario no se lea
 * (rojo), subir la ATMÓSFERA hasta que se vea (rojo: para eso está la vitrina), enchufar otra
 * pantalla al glow de la vitrina (rojo), o aclarar `--df-text-dim` del claro (rojo: vuelve la fuga).
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { contraste, deltaE } from "./helpers/color";
import { CLARO, CSS, hex, OSCURO } from "./helpers/paleta";

const RAIZ = path.resolve(__dirname, "..");

/** `color-mix(in srgb, X p%, transparent)` sobre un fondo opaco: mezcla lineal en sRGB. */
function componer(color: string, pct: number, fondo: string): string {
  const c = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  const f = [1, 3, 5].map((i) => parseInt(fondo.slice(i, i + 2), 16));
  const a = pct / 100;
  return (
    "#" +
    c
      .map((v, i) => Math.round(v * a + f[i]! * (1 - a)))
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("")
  );
}

const pct = (tokens: Map<string, string>, nombre: string): number => {
  const v = tokens.get(nombre);
  expect(v, `falta ${nombre}`).toMatch(/^\d+%$/);
  return parseInt(v!, 10);
};

const TEMAS = [
  { nombre: "oscuro", t: OSCURO },
  { nombre: "claro", t: CLARO },
] as const;

describe("la fuerza del tinte se decide POR TEMA", () => {
  it("los tres tintes tienen su fuerza en los dos temas", () => {
    for (const { nombre, t } of TEMAS) {
      for (const token of [
        "--df-glow-accion-fuerza",
        "--df-glow-vitrina-fuerza",
        "--df-glow-money-fuerza",
      ]) {
        expect(pct(t, token), `${token} en ${nombre}`).toBeGreaterThan(0);
      }
    }
  });

  it("y los de la VITRINA no valen lo mismo en los dos temas: es lo que la hace visible", () => {
    for (const token of ["--df-glow-vitrina-fuerza", "--df-glow-money-fuerza"]) {
      expect(CLARO.get(token), `${token} repite el valor del oscuro`).not.toBe(OSCURO.get(token));
      expect(pct(CLARO, token), `${token} tiene que pesar MÁS en claro`).toBeGreaterThan(
        pct(OSCURO, token),
      );
    }
  });

  it("cada degradado LEE su fuerza en vez de llevar el número escrito", () => {
    // Si alguien devuelve un literal al `color-mix`, los tokens de arriba se quedan de adorno y el
    // tema claro vuelve a tintar como el oscuro sin que nada falle.
    expect(CSS).toMatch(
      /--df-glow-accion:[\s\S]*?color-mix\(in srgb, var\(--df-action\) var\(--df-glow-accion-fuerza\)/,
    );
    expect(CSS).toMatch(
      /--df-glow-vitrina:[\s\S]*?color-mix\(in srgb, var\(--df-action\) var\(--df-glow-vitrina-fuerza\)/,
    );
    expect(CSS).toMatch(
      /--df-glow-money:[\s\S]*?color-mix\(in srgb, var\(--df-money\) var\(--df-glow-money-fuerza\)/,
    );
  });
});

/**
 * LA FUERZA DE LA VITRINA ES DE LA VITRINA, Y ESTO NACIÓ DE UN FALLO EN PRODUCCIÓN. Mientras hubo
 * un solo token, subirlo al 30% para que el verde se leyera sobre blanco en /destacados se lo subió
 * también a /ranking, a /inicio y a las seis pantallas de acceso: NUEVE superficies heredaron una
 * fuerza decidida para una. En /ranking, donde la atmósfera tenía que ser "muy tenue", salió un
 * verde de esquina feo y visible.
 *
 * La regla que queda: POR TEMA DONDE TIENE QUE LEERSE, SUAVE DONDE NO. Y dos candados, porque con
 * uno solo esto se repite — uno impide que la atmósfera vuelva a subir, y el otro impide que otra
 * pantalla se enchufe al glow de la vitrina.
 */
describe("el glow fuerte es de la vitrina y de nadie más", () => {
  /**
   * EL TECHO DE LA ATMÓSFERA, EN PORCENTAJE Y NO EN ΔE — y la primera versión de este caso lo tenía
   * mal. Puse un techo de ΔE pensando "la atmósfera casi no se ve", y se puso rojo en OSCURO: ahí
   * el 18% de siempre da ΔE 20,1, porque sobre negro el verde ES luz. Y ese 18% lleva años puesto
   * sin que nadie se queje. O sea que el invariante no era "se ve poco": es "LA ATMÓSFERA NO SUBE".
   * Si una pantalla necesita más verde, pide su propia fuerza como hizo la vitrina; no empuja la
   * que comparten nueve superficies.
   */
  const TECHO_ATMOSFERA = 18;

  for (const { nombre, t } of TEMAS) {
    it(`${nombre}: la atmósfera no sube del ${TECHO_ATMOSFERA}%`, () => {
      expect(
        pct(t, "--df-glow-accion-fuerza"),
        "no subas la atmósfera: la comparten /ranking, /inicio y las seis pantallas de acceso",
      ).toBeLessThanOrEqual(TECHO_ATMOSFERA);
    });
  }

  it("y la vitrina pesa más que la atmósfera: si no, no haría falta tener dos", () => {
    for (const { nombre, t } of TEMAS) {
      expect(
        pct(t, "--df-glow-vitrina-fuerza"),
        `en ${nombre} la vitrina no pesa más que la atmósfera`,
      ).toBeGreaterThanOrEqual(pct(t, "--df-glow-accion-fuerza"));
    }
    // Y en CLARO, que es donde el verde se lava, tiene que pesar estrictamente más.
    expect(pct(CLARO, "--df-glow-vitrina-fuerza")).toBeGreaterThan(
      pct(CLARO, "--df-glow-accion-fuerza"),
    );
  });

  it("SOLO el rescoldo de /destacados monta el glow de la vitrina", () => {
    // El candado que faltaba. Sin esto, la próxima pantalla que quiera "más verde" se engancha al
    // token fuerte en vez de pedir el suyo, y volvemos al mismo sitio por otro camino.
    const culpables: string[] = [];
    const andar = (dir: string): void => {
      for (const e of readdirSync(path.resolve(RAIZ, dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`;
        if (rel.includes("/generated")) continue;
        if (e.isDirectory()) andar(rel);
        else if (
          /\.(tsx?|css)$/.test(rel) &&
          readFileSync(path.resolve(RAIZ, rel), "utf8").includes("--df-glow-vitrina")
        ) {
          culpables.push(rel);
        }
      }
    };
    andar("src");
    expect(culpables.sort(), "pide tu propia fuerza; no te enchufes a la de la vitrina").toEqual([
      "src/app/(app)/(shell)/destacados/fondo-rescoldo.tsx",
      "src/app/globals.css",
    ]);
  });

  it("y el rescoldo usa la de la vitrina, no la atmósfera", () => {
    const regla = /\.df-rescoldo\s*\{[\s\S]*?\n\}/.exec(CSS)?.[0] ?? "";
    expect(regla, "no está `.df-rescoldo`").toBeTruthy();
    expect(regla).toContain("var(--df-glow-vitrina)");
    expect(regla, "el rescoldo volvió a la atmósfera").not.toContain("var(--df-glow-accion)");
  });
});

describe("el tinte de la VITRINA se ve en los dos temas (ΔE contra su fondo)", () => {
  for (const { nombre, t } of TEMAS) {
    it(`${nombre}: el acento tiñe de verdad`, () => {
      const pico = componer(
        hex(t, "--df-action"),
        pct(t, "--df-glow-vitrina-fuerza"),
        hex(t, "--df-void"),
      );
      // 15 es el suelo de "esto se nota": por debajo es un tinte que nadie ve y sobra. Esto se le
      // exige a la VITRINA; a la ATMÓSFERA se le exige justo lo contrario —un techo—, más abajo.
      expect(Number(deltaE(pico, hex(t, "--df-void")).toFixed(1))).toBeGreaterThanOrEqual(15);
    });

    it(`${nombre}: el dinero tiñe de verdad`, () => {
      const pico = componer(
        hex(t, "--df-money"),
        pct(t, "--df-glow-money-fuerza"),
        hex(t, "--df-void"),
      );
      // Mucho más suave a propósito: es un lavado de esquina, no un foco.
      expect(Number(deltaE(pico, hex(t, "--df-void")).toFixed(1))).toBeGreaterThanOrEqual(6);
    });
  }
});

describe("y el texto SIGUE LEYÉNDOSE encima del tinte (la medida que faltaba)", () => {
  for (const { nombre, t } of TEMAS) {
    // LOS TRES, y el de la vitrina es el que manda: es el más fuerte, así que es el que decide
    // cuánto se puede subir antes de que el texto deje de leerse encima.
    for (const [glow, color] of [
      ["--df-glow-accion-fuerza", "--df-action"],
      ["--df-glow-vitrina-fuerza", "--df-action"],
      ["--df-glow-money-fuerza", "--df-money"],
    ] as const) {
      it(`${nombre}: sobre el pico de ${glow} se leen el texto y el secundario`, () => {
        const pico = componer(hex(t, color), pct(t, glow), hex(t, "--df-void"));
        const principal = contraste(hex(t, "--df-text"), pico);
        const secundario = contraste(hex(t, "--df-text-dim"), pico);
        expect(
          Number(principal.toFixed(2)),
          `texto principal sobre ${pico}`,
        ).toBeGreaterThanOrEqual(7);
        expect(
          Number(secundario.toFixed(2)),
          `texto secundario sobre ${pico}`,
        ).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});

describe("el movimiento se apaga solo", () => {
  it("prefers-reduced-motion mata animaciones y transiciones, con !important", () => {
    const regla = /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\}\s*\}/.exec(CSS)?.[0] ?? "";
    expect(regla, "no está la regla global de movimiento reducido").toBeTruthy();

    // CADA DECLARACIÓN POR SU NOMBRE, y no es rigor de más: la primera versión de este caso pedía
    // `/animation[^;]*!important/`, quitamos el `!important` de `animation-duration` y salió VERDE
    // — porque el regex casaba con el `!important` de `animation-iteration-count`, que es OTRA
    // declaración. Mirar la palabra en vez del sitio que decide.
    for (const prop of ["animation-duration", "animation-iteration-count", "transition-duration"]) {
      expect(regla, `${prop} sin !important: una regla más específica lo pisaría`).toMatch(
        new RegExp(`${prop}:[^;]*!important`),
      );
    }
    // Y que alcance a TODO, incluidos los pseudoelementos (el barrido del glass vive en un ::after).
    for (const selector of ["*", "*::before", "*::after"]) {
      expect(regla, `el selector ${selector} no está`).toContain(selector);
    }
  });

  /**
   * La ÚNICA animación que se sale de la regla, con su porqué y su coste — que es como se registra
   * una decisión, no como se esconde. `df-sweep` es el barrido del glass: mueve la posición de un
   * degradado, y eso repinta en cada fotograma en vez de ir por el compositor. Venía de antes y
   * rehacerlo (una capa más ancha desplazada con `transform`) es reescribir un efecto visual, que
   * no es el encargo de esta pieza. Queda apuntado aquí, que es donde se vuelve a leer.
   */
  const BUCLES_EXENTOS: Record<string, string> = {
    "df-sweep": "el barrido del glass mueve un degradado; rehacerlo con transform es otra pieza",
  };

  it("y ningún bucle anima otra cosa que opacity o transform", () => {
    // Un bucle que anime `background` o `filter` repinta la pagina en cada fotograma. El tinte es
    // un fondo: si algun dia se quisiera latir, se hace con opacity sobre una capa, no animandolo.
    for (const m of CSS.matchAll(/@keyframes\s+([\w-]+)\s*\{([\s\S]*?)\n\}/g)) {
      if (m[1]! in BUCLES_EXENTOS) continue;
      const propiedades = [...m[2]!.matchAll(/^\s{4}([a-z-]+):/gm)].map((p) => p[1]!);
      const malas = [...new Set(propiedades)].filter((p) => p !== "opacity" && p !== "transform");
      expect(malas, `@keyframes ${m[1]} anima algo que no es opacity ni transform`).toEqual([]);
    }
  });

  it("y la exención sigue existiendo: no se aparcan permisos muertos", () => {
    for (const nombre of Object.keys(BUCLES_EXENTOS)) {
      expect(CSS, `@keyframes ${nombre} ya no existe: quita su exención`).toContain(
        `@keyframes ${nombre}`,
      );
    }
  });
});
