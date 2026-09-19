/**
 * LA PALETA CLARA, MEDIDA. El tema claro no se revisa "a ojo": se mide.
 *
 *  - CADA TOKEN DEL TEMA OSCURO TIENE SU CONTRAPARTIDA CLARA. Un token sin definir en claro no falla:
 *    hereda el valor oscuro y sale un texto oscuro sobre fondo oscuro, o un acento que no pega. Este
 *    test compara las dos listas.
 *  - SE LEE: contraste WCAG de cada color sobre el fondo donde se usa.
 *  - SE DISTINGUE: CIEDE2000 entre colores que significan COSAS DISTINTAS. La regla de oro del brief
 *    —ACCIÓN ≠ DINERO— deja de estar garantizada por el tono (magenta vs lima) en cuanto los dos se
 *    vuelven cálidos/verdes, así que aquí se afirma con un número.
 *
 * Para romperlo a propósito: poner `--df-action` y `--df-ok` con el mismo verde (rojo), aclarar
 * `--df-text-dim` hasta que no se lea (rojo), o borrar una línea del bloque claro (rojo).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { contraste, deltaE, tono } from "./helpers/color";

const CSS = readFileSync(path.resolve(__dirname, "..", "src", "app", "globals.css"), "utf8");

/** Los `--df-*: valor;` de un bloque, por el selector con el que empieza. */
function tokensDe(selector: string): Map<string, string> {
  const i = CSS.indexOf(selector);
  expect(i, `no está el bloque ${selector}`).toBeGreaterThan(-1);
  const abre = CSS.indexOf("{", i);
  const cierra = CSS.indexOf("\n}", abre);
  const cuerpo = CSS.slice(abre, cierra);
  const tokens = new Map<string, string>();
  for (const m of cuerpo.matchAll(/(--df-[a-z-]+):\s*([^;]+);/g)) {
    tokens.set(m[1]!, m[2]!.trim());
  }
  return tokens;
}

const OSCURO = tokensDe(':root,\n[data-theme="dark"]');
const CLARO = tokensDe('[data-theme="light"]');
/**
 * Solo los que son un color sólido: los degradados y las sombras no se miden con contraste. Si falta
 * o no es un hex devuelve "", que revienta al medirlo — así el rojo sale en el test que lo usa (con su
 * nombre) y no al cargar el fichero, que dejaría la suite entera sin ejecutarse.
 */
const hex = (tokens: Map<string, string>, nombre: string): string => {
  const v = tokens.get(nombre) ?? "";
  return /^#[0-9a-f]{6}$/i.test(v) ? v : "";
};

const C = {
  money: hex(CLARO, "--df-money"),
  action: hex(CLARO, "--df-action"),
  time: hex(CLARO, "--df-time"),
  alarm: hex(CLARO, "--df-alarm"),
  rank: hex(CLARO, "--df-rank"),
  silver: hex(CLARO, "--df-silver"),
  bronze: hex(CLARO, "--df-bronze"),
  ok: hex(CLARO, "--df-ok"),
  void: hex(CLARO, "--df-void"),
  surface: hex(CLARO, "--df-surface"),
  raised: hex(CLARO, "--df-raised"),
  text: hex(CLARO, "--df-text"),
  textDim: hex(CLARO, "--df-text-dim"),
};

describe("ningún token se queda sin contrapartida", () => {
  it("los trece colores del tema claro están definidos y son un hex", () => {
    const faltan = Object.entries(C)
      .filter(([, v]) => v === "")
      .map(([k]) => k);
    expect(faltan).toEqual([]);
  });

  it("el tema claro define EXACTAMENTE los mismos tokens que el oscuro", () => {
    expect([...CLARO.keys()].sort()).toEqual([...OSCURO.keys()].sort());
  });

  it("y ninguno repite el valor del oscuro (sería un olvido, no una decisión)", () => {
    const iguales = [...CLARO.entries()]
      .filter(([k, v]) => OSCURO.get(k) === v)
      .map(([k]) => k)
      // El velo y las sombras se DERIVAN de la paleta, así que su texto puede parecerse; se comparan
      // por valor literal y estos sí cambian. Si alguno dejara de cambiar, saldría aquí.
      .filter((k) => k !== "--df-dur-fast");
    expect(iguales).toEqual([]);
  });
});

describe("la guía de estilo no miente", () => {
  it("los hex que publica /style-guide son los de globals.css, en los DOS temas", () => {
    // La guía es la referencia de diseño: si alguien retoca un valor en el CSS y no aquí, la página
    // enseñaría un color que ya no existe. Se comprueba, no se confía.
    const guia = readFileSync(
      path.resolve(__dirname, "..", "src", "app", "style-guide", "page.tsx"),
      "utf8",
    );
    const entradas = [
      ...guia.matchAll(
        /u:\s*"([a-z]+)",\s*hex:\s*"(#[0-9a-f]{6})",\s*hexClaro:\s*"(#[0-9a-f]{6})"/g,
      ),
    ];
    expect(entradas.length).toBeGreaterThanOrEqual(6);
    for (const [, token, oscuro, claro] of entradas) {
      expect(OSCURO.get(`--df-${token}`), `${token} (oscuro)`).toBe(oscuro);
      expect(CLARO.get(`--df-${token}`), `${token} (claro)`).toBe(claro);
    }
  });
});

describe("se lee (contraste WCAG)", () => {
  const minimos: [string, string, string, number][] = [
    ["texto sobre el fondo de página", C.text, C.void, 7],
    ["texto sobre tarjeta", C.text, C.surface, 7],
    ["texto secundario sobre tarjeta", C.textDim, C.surface, 4.5],
    ["texto secundario sobre el fondo", C.textDim, C.void, 4.5],
    ["el blanco del CTA sobre el relleno de acción", "#ffffff", C.action, 4.5],
    ["acción como texto", C.action, C.surface, 4.5],
    ["dinero como texto (los importes)", C.money, C.surface, 4.5],
    ["dinero sobre el fondo de página", C.money, C.void, 4.5],
    ["confirmación como texto", C.ok, C.surface, 4.5],
    ["tiempo como texto", C.time, C.surface, 4.5],
    ["alarma como texto", C.alarm, C.surface, 4.5],
    // El oro y sus hermanos NO son texto pequeño en ninguna parte: son la corona y el aro del podio
    // (gráfico) y la cifra del pedestal (texto grande). El mínimo de los dos casos es 3:1.
    ["el oro del podio, gráfico y cifra grande", C.rank, C.surface, 3],
    ["plata del podio", C.silver, C.surface, 3],
    ["bronce del podio", C.bronze, C.surface, 3],
    // Y donde sí hay texto pequeño —el puesto 1/2/3 de una fila— el número va SOBRE el oro.
    ["el puesto 1/2/3 sobre el chip de oro", C.text, C.rank, 4.5],
  ];
  for (const [nombre, a, b, minimo] of minimos) {
    it(`${nombre} >= ${minimo}:1`, () => {
      expect(Number(contraste(a, b).toFixed(2))).toBeGreaterThanOrEqual(minimo);
    });
  }

  it("las superficies se distinguen entre sí, que es como se da profundidad sin sombras", () => {
    expect(contraste(C.surface, C.void)).toBeGreaterThan(1.02);
    expect(contraste(C.raised, C.surface)).toBeGreaterThan(1.05);
  });
});

describe("se distingue (CIEDE2000): cada color sigue teniendo UN trabajo", () => {
  const pares: [string, string, string, number][] = [
    ["ACCIÓN vs DINERO (la regla de oro del brief)", C.action, C.money, 20],
    ["acción vs confirmación (los dos verdes)", C.action, C.ok, 15],
    // Los dos dorados: el del dinero (texto) y el del podio (relleno). Que se distingan es
    // exactamente lo que obligó a que el puesto vaya SOBRE el oro y no EN oro.
    ["dinero vs oro del podio (los dos dorados)", C.money, C.rank, 15],
    ["dinero vs tiempo (los dos cálidos)", C.money, C.time, 15],
    ["tiempo vs alarma", C.time, C.alarm, 15],
    ["oro del podio vs plata", C.rank, C.silver, 15],
    ["oro del podio vs bronce", C.rank, C.bronze, 15],
    ["plata vs bronce", C.silver, C.bronze, 15],
  ];
  for (const [nombre, a, b, minimo] of pares) {
    it(`${nombre}: ΔE >= ${minimo}`, () => {
      expect(Number(deltaE(a, b).toFixed(2))).toBeGreaterThanOrEqual(minimo);
    });
  }

  it("la confirmación SIGUE siendo verde: no se vuelve dorada ni roja", () => {
    // Tono Lab en grados: el verde-menta/teal del brief vive entre 120° y 200°.
    expect(tono(C.ok)).toBeGreaterThan(120);
    expect(tono(C.ok)).toBeLessThan(200);
  });

  it("el puesto del podio va SOBRE el oro en claro, no EN oro (estructural)", () => {
    // Si alguien devuelve el número a `color: var(--df-rank)`, en claro queda en 3,25:1: legible a
    // duras penas y contra la regla que se acordó al elegir los dos dorados.
    // SIN COMENTARIOS: un comentario que mencione la clase no la pinta. (Lo aprendimos con el guard
    // del panel, que se daba por satisfecho con su propio comentario.)
    const fila = readFileSync(
      path.resolve(__dirname, "..", "src", "components", "ui", "fila-puesto.tsx"),
      "utf8",
    )
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(fila).toContain("df-puesto-podio");
    expect(fila).not.toContain("var(--color-rank)");
    expect(CSS).toMatch(/\[data-theme="light"\]\s*\.df-puesto-podio\s*\{[^}]*background-color/);
  });

  it("la acción es VERDE y el dinero DORADO (el encargo de Sergio, no una casualidad)", () => {
    expect(tono(C.action)).toBeGreaterThan(120);
    expect(tono(C.action)).toBeLessThan(180);
    expect(tono(C.money)).toBeGreaterThan(55);
    expect(tono(C.money)).toBeLessThan(100);
  });
});
