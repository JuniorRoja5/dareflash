/**
 * LA PALETA OSCURA, MEDIDA. El oscuro es el tema POR DEFECTO —el que ve casi todo el mundo— y era el
 * único sin medir: las cifras vivían solo en `paleta-clara`, porque el tema claro se midió al nacer y
 * el oscuro venía de antes. O sea que el que llevaba más tiempo en producción era el que nadie
 * vigilaba, y un repintado podía cargarse un SIGNIFICADO sin que nada chillara. Mismo examen que el
 * claro —contraste WCAG y CIEDE2000 entre colores que quieren decir cosas distintas— sobre el
 * bloque oscuro de `globals.css`.
 *
 * DOS COSAS SE MIDEN DISTINTO QUE EN CLARO, y las dos son decisiones, no descuidos:
 *
 *  - EL TEXTO DEL CTA SÓLIDO NO ES BLANCO, y aquí no se supone cuál es: se LEE de `botonTokens`, que
 *    es quien lo decide ("sobre relleno semántico, SIEMPRE void"). Sobre el relleno de acción el
 *    blanco da 3,5:1 en oscuro y no cumpliría; el void da 5,7:1. Midiendo el par REAL, el día que
 *    alguien pase el botón a texto claro esto cae, y cae por la razón verdadera. En claro los dos
 *    pasan, así que allí el par real no se nota: aquí sí.
 *  - EL PUESTO 1/2/3 VA EN ORO SUELTO, no sobre un chip. `.df-puesto-podio` es `color: var(--df-rank)`
 *    y solo el tema claro lo convierte en chip, porque allí el oro no se lee como texto pequeño
 *    (3,25:1). En oscuro da 11:1, así que lo que se exige aquí es justo lo contrario que en claro:
 *    que el oro se lea COMO TEXTO (4,5), no como gráfico (3).
 *
 * LO QUE NO SE AFIRMA TODAVÍA, a propósito: que la acción sea VERDE. En claro sí se afirma (tono
 * 120–180°) porque en claro ya lo es. En oscuro la acción sigue siendo magenta (tono 1,8°) y los
 * valores exactos del repintado de marca v3 están pendientes de firma. Esa línea entra CON el
 * repintado, no antes: un test que afirme hoy lo que aún no es cierto no es un diente, es un rojo
 * permanente, y un rojo permanente acaba borrado por alguien con prisa.
 *
 * Para romperlo a propósito: poner `--df-action` a un verde cercano a `--df-ok` (rojo: los dos verdes
 * dejan de distinguirse), `--df-money` a un dorado cercano a `--df-rank` (rojo: los dos dorados), o
 * pasar el texto del botón principal de "void" a "text" (rojo: el CTA deja de leerse sobre su relleno).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { botonTokens, type BotonVariante } from "../src/components/ui/logic";

import { contraste, deltaE, tono } from "./helpers/color";
import { CSS, hex, OSCURO } from "./helpers/paleta";

/** Un token del bloque oscuro, por su nombre corto. "" si falta o no es un hex: revienta al medirlo. */
const T = (nombre: string): string => hex(OSCURO, `--df-${nombre}`);

const O = {
  money: T("money"),
  action: T("action"),
  time: T("time"),
  alarm: T("alarm"),
  rank: T("rank"),
  silver: T("silver"),
  bronze: T("bronze"),
  ok: T("ok"),
  void: T("void"),
  surface: T("surface"),
  raised: T("raised"),
  text: T("text"),
  textDim: T("text-dim"),
};

describe("ningún color del tema oscuro se queda sin valor", () => {
  it("los trece están definidos y son un hex", () => {
    const faltan = Object.entries(O)
      .filter(([, v]) => v === "")
      .map(([k]) => k);
    expect(faltan).toEqual([]);
  });
});

describe("se lee (contraste WCAG)", () => {
  const minimos: [string, string, string, number][] = [
    ["texto sobre el fondo de página", O.text, O.void, 7],
    ["texto sobre tarjeta", O.text, O.surface, 7],
    ["texto secundario sobre tarjeta", O.textDim, O.surface, 4.5],
    ["texto secundario sobre el fondo", O.textDim, O.void, 4.5],
    ["acción como texto", O.action, O.surface, 4.5],
    ["dinero como texto (los importes)", O.money, O.surface, 4.5],
    ["dinero sobre el fondo de página", O.money, O.void, 4.5],
    ["confirmación como texto", O.ok, O.surface, 4.5],
    ["tiempo como texto", O.time, O.surface, 4.5],
    ["alarma como texto", O.alarm, O.surface, 4.5],
    // El oro en oscuro SÍ es texto pequeño: es el puesto 1/2/3 de `FilaPuesto`, suelto sobre la
    // tarjeta (en claro eso mismo va sobre un chip, y por eso allí el mínimo es 3). Ver el docblock.
    ["el puesto 1/2/3 en oro suelto", O.rank, O.surface, 4.5],
    // La plata y el bronce NO son texto en ninguna parte: son las medallas del podio 2 y 3 (gráfico).
    ["plata del podio", O.silver, O.surface, 3],
    ["bronce del podio", O.bronze, O.surface, 3],
  ];
  for (const [nombre, a, b, minimo] of minimos) {
    it(`${nombre} >= ${minimo}:1`, () => {
      expect(Number(contraste(a, b).toFixed(2))).toBeGreaterThanOrEqual(minimo);
    });
  }

  it("las superficies se distinguen entre sí, que es como se da profundidad sin sombras", () => {
    expect(contraste(O.surface, O.void)).toBeGreaterThan(1.02);
    expect(contraste(O.raised, O.surface)).toBeGreaterThan(1.05);
  });

  it("y el puesto del podio es el ORO en oscuro: por eso el mínimo de arriba es de TEXTO", () => {
    // La medida de 4,5 solo significa algo si el número va de verdad en oro suelto. Si alguien le
    // pusiera un chip también en oscuro, el par medido sería otro y este caso avisa de que hay que
    // cambiarlo. Sin comentarios: un comentario que mencione la regla no la pinta.
    const css = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(css).toMatch(/\.df-puesto-podio\s*\{\s*color:\s*var\(--df-rank\);?\s*\}/);
  });
});

/**
 * EL TEXTO DEL BOTÓN SE LEE DE `botonTokens`, NO SE SUPONE. Las variantes no se pueden enumerar en
 * runtime (son un union de tipos), así que la lista se saca del FUENTE: añadir una variante con
 * relleno y no medirla aquí cae en rojo, en vez de entrar sin medir.
 */
describe("el texto de cada botón con relleno se lee encima", () => {
  const LOGIC = readFileSync(
    path.resolve(__dirname, "..", "src", "components", "ui", "logic.ts"),
    "utf8",
  );

  const VARIANTES: BotonVariante[] = ["principal", "secundario", "fantasma", "peligro"];
  const CON_RELLENO = VARIANTES.filter((v) => botonTokens(v).fondo !== null);

  it("la lista de variantes del test es la del tipo, entera", () => {
    const union = /export type BotonVariante =([^;]+);/.exec(LOGIC)?.[1] ?? "";
    const delTipo = [...union.matchAll(/"([a-z]+)"/g)].map((m) => m[1]!);
    expect(delTipo.length).toBeGreaterThanOrEqual(4);
    expect([...delTipo].sort()).toEqual([...VARIANTES].sort());
  });

  it("hay al menos dos botones con relleno (principal y peligro)", () => {
    // Si `botonTokens` dejara de dar relleno a todos, el bucle de abajo se quedaría sin casos y este
    // bloque entero pasaría a verde sin medir nada. Eso es lo que impide este caso.
    expect(CON_RELLENO.length).toBeGreaterThanOrEqual(2);
  });

  for (const variante of CON_RELLENO) {
    const { fondo, texto } = botonTokens(variante);
    it(`${variante}: texto "${texto}" sobre relleno "${fondo}" >= 4.5:1`, () => {
      const ratio = contraste(T(texto), T(fondo!));
      expect(
        Number(ratio.toFixed(2)),
        `el botón ${variante} pinta ${texto} sobre ${fondo}: ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(4.5);
    });
  }
});

describe("se distingue (CIEDE2000): cada color sigue teniendo UN trabajo", () => {
  const pares: [string, string, string, number][] = [
    ["ACCIÓN vs DINERO (la regla de oro del brief)", O.action, O.money, 20],
    // Hoy sobra (magenta vs menta), pero es LA pareja que el repintado a verde pone en riesgo: la
    // acción y la confirmación quedarían a un paso la una de la otra si se eligen los dos verdes sin
    // medir. En claro esta misma regla ya existe, y es la que hace que `--df-ok` sea un teal.
    ["acción vs confirmación (los dos verdes)", O.action, O.ok, 15],
    // Los dos dorados: el del dinero (texto) y el del podio (relleno/medalla). La otra pareja que un
    // repintado puede juntar sin querer, porque los dos tiran al mismo tono.
    ["dinero vs oro del podio (los dos dorados)", O.money, O.rank, 15],
    ["dinero vs tiempo (los dos cálidos)", O.money, O.time, 15],
    ["tiempo vs alarma", O.time, O.alarm, 15],
    ["oro del podio vs plata", O.rank, O.silver, 15],
    ["oro del podio vs bronce", O.rank, O.bronze, 15],
    ["plata vs bronce", O.silver, O.bronze, 15],
  ];
  for (const [nombre, a, b, minimo] of pares) {
    it(`${nombre}: ΔE >= ${minimo}`, () => {
      expect(Number(deltaE(a, b).toFixed(2))).toBeGreaterThanOrEqual(minimo);
    });
  }

  it("la confirmación SIGUE siendo verde: no se vuelve dorada ni roja", () => {
    // Misma regla que en claro: el verde-menta/teal vive entre 120° y 200°. Si el repintado de marca
    // mueve `--df-ok` para separarlo de la acción, tiene que separarlo DENTRO de su familia.
    expect(tono(O.ok)).toBeGreaterThan(120);
    expect(tono(O.ok)).toBeLessThan(200);
  });

  it("el dinero sigue siendo DORADO/LIMA, no un verde más", () => {
    // 55–100° en claro (dorado); en oscuro el lima se va a 110°. El rango es más ancho porque el
    // valor exacto está pendiente del repintado, pero el límite de arriba es el que importa: en
    // cuanto el dinero pasa de 120° entra en la familia de la ACCIÓN y del verde de nivel.
    expect(tono(O.money)).toBeGreaterThan(55);
    expect(tono(O.money)).toBeLessThan(120);
  });
});
