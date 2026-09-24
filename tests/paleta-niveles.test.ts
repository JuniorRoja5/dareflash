/**
 * LA PALETA DE NIVELES, MEDIDA. Los emblemas del avatar no se eligen a ojo: se miden, igual que el
 * tema claro (`paleta-clara`), y con el mismo helper.
 *
 * Lo que se fija, con números y no con opiniones:
 *  - SE VE: cada color llega al mínimo de contraste de un GRÁFICO (3:1, WCAG 1.4.11) sobre los dos
 *    fondos reales de su tema — la tarjeta y el fondo de página—. Un emblema que no se ve no informa.
 *  - SE DISTINGUEN ENTRE SÍ: CIEDE2000 entre niveles. Si Pro y Elite se parecen, el emblema deja de
 *    decir de qué nivel es y solo dice "tiene nivel".
 *  - NO SE CONFUNDEN CON LO QUE YA SIGNIFICA ALGO: separación contra los tokens semánticos del tema
 *    (dinero, acción, tiempo, alarma...). Con la ÚNICA excepción del oro de Legend, que es el MISMO
 *    token del podio a propósito y por eso se afirma la igualdad en vez de la distancia.
 *  - MISMA IDENTIDAD EN LOS DOS TEMAS: el tono apenas se mueve. Un Challenger tiene que ser el mismo
 *    verde para la persona en claro y en oscuro; lo que cambia es la luminosidad, no la familia.
 *
 * Para romperlo: meter un nivel sin su token en un tema (rojo), poner un verde de Challenger que se
 * parezca a `--df-action` en claro (rojo), o darle a Legend un oro propio (rojo: ya no sería el del
 * podio, que es justo lo que se decidió).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { NIVELES } from "../src/lib/niveles";

import { contraste, deltaE, tono } from "./helpers/color";

const CSS = readFileSync(path.resolve(__dirname, "..", "src", "app", "globals.css"), "utf8");

function tokensDe(selector: string): Map<string, string> {
  const i = CSS.indexOf(selector);
  expect(i, `no está el bloque ${selector}`).toBeGreaterThan(-1);
  const abre = CSS.indexOf("{", i);
  const cierra = CSS.indexOf("\n}", abre);
  const tokens = new Map<string, string>();
  for (const m of CSS.slice(abre, cierra).matchAll(/(--df-[a-z-]+):\s*([^;]+);/g)) {
    tokens.set(m[1]!, m[2]!.trim());
  }
  return tokens;
}

const TEMAS = {
  oscuro: {
    tokens: tokensDe(':root,\n[data-theme="dark"]'),
    fondos: ["--df-surface", "--df-void"],
  },
  claro: { tokens: tokensDe('[data-theme="light"]'), fondos: ["--df-surface", "--df-void"] },
} as const;

/** Un token que no exista, o que no sea un hex sólido, devuelve "" y revienta al medirlo. */
const hex = (tokens: Map<string, string>, nombre: string): string => {
  const v = tokens.get(nombre) ?? "";
  return /^#[0-9a-f]{6}$/i.test(v) ? v : "";
};

/** Los niveles QUE LLEVAN EMBLEMA (Rookie no: es el estándar y no tiene color que medir). */
const CON_EMBLEMA = NIVELES.filter((n) => n.emblema !== null);

/** Mínimo de contraste de un GRÁFICO (no es texto): WCAG 1.4.11. */
const MIN_GRAFICO = 3;

/** Los tokens que YA significan algo y con los que un emblema no se puede confundir. */
const SEMANTICOS = ["--df-money", "--df-action", "--df-time", "--df-alarm", "--df-ok"];

describe("cada nivel con emblema tiene su color en LOS DOS temas", () => {
  it("ninguno se queda sin definir (heredarlo del otro tema sería un color que no pega)", () => {
    expect(CON_EMBLEMA.length).toBeGreaterThanOrEqual(4);
    for (const n of CON_EMBLEMA) {
      expect(n.tokenColor, n.clave).toBeTruthy();
      for (const [tema, { tokens }] of Object.entries(TEMAS)) {
        expect(hex(tokens, n.tokenColor!), `${n.clave} en ${tema}`).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });

  it("Rookie NO tiene emblema ni color: es el estándar, no una insignia más", () => {
    const rookie = NIVELES.find((n) => n.clave === "rookie")!;
    expect(rookie.emblema).toBeNull();
    expect(rookie.tokenColor).toBeNull();
  });
});

describe("se ven sobre el fondo real de su tema", () => {
  for (const [tema, { tokens, fondos }] of Object.entries(TEMAS)) {
    it(`${tema}: todos llegan a ${MIN_GRAFICO}:1 sobre la tarjeta y sobre el fondo de página`, () => {
      for (const n of CON_EMBLEMA) {
        const c = hex(tokens, n.tokenColor!);
        for (const f of fondos) {
          const ratio = contraste(c, hex(tokens, f));
          expect(
            ratio,
            `${n.clave} (${c}) sobre ${f} en ${tema}: ${ratio.toFixed(2)}`,
          ).toBeGreaterThanOrEqual(MIN_GRAFICO);
        }
      }
    });
  }
});

describe("se distinguen entre sí", () => {
  for (const [tema, { tokens }] of Object.entries(TEMAS)) {
    it(`${tema}: dos niveles cualesquiera están claramente separados`, () => {
      for (let i = 0; i < CON_EMBLEMA.length; i++) {
        for (let j = i + 1; j < CON_EMBLEMA.length; j++) {
          const a = CON_EMBLEMA[i]!;
          const b = CON_EMBLEMA[j]!;
          const d = deltaE(hex(tokens, a.tokenColor!), hex(tokens, b.tokenColor!));
          // >20 es "no los confunde nadie" (ver el docblock del helper). El par más justo medido es
          // Pro vs Legend: 23,1 en oscuro y 30,7 en claro.
          expect(d, `${a.clave} vs ${b.clave} en ${tema}: ΔE ${d.toFixed(1)}`).toBeGreaterThan(20);
        }
      }
    });
  }
});

describe("no se confunden con lo que ya significa algo", () => {
  for (const [tema, { tokens }] of Object.entries(TEMAS)) {
    it(`${tema}: separados de dinero, acción, tiempo, alarma y confirmación`, () => {
      for (const n of CON_EMBLEMA) {
        const c = hex(tokens, n.tokenColor!);
        for (const s of SEMANTICOS) {
          const d = deltaE(c, hex(tokens, s));
          // 8 es el suelo: por debajo, a tamaño de glifo, son el mismo color.
          expect(d, `${n.clave} vs ${s} en ${tema}: ΔE ${d.toFixed(1)}`).toBeGreaterThan(8);
        }
      }
    });
  }

  it("el oro de Legend ES el del podio, no un tercer oro (decisión, no descuido)", () => {
    const legend = NIVELES.find((n) => n.clave === "legend")!;
    // En claro el dorado ya está ocupado dos veces (`--df-money` y `--df-rank`): un tercero no se
    // separaría de ninguno. Se comparte el token y, donde el oro ya hace de puesto, el emblema se
    // retira (ver `FilaPuesto`). Si alguien le diera un token propio, este caso cae.
    expect(legend.tokenColor).toBe("--df-rank");
    for (const { tokens } of Object.values(TEMAS)) {
      expect(deltaE(hex(tokens, legend.tokenColor!), hex(tokens, "--df-rank"))).toBe(0);
    }
  });
});

describe("la misma identidad en los dos temas", () => {
  it("cada nivel conserva su FAMILIA de color: cambia la luminosidad, no el tono", () => {
    for (const n of CON_EMBLEMA) {
      const o = hex(TEMAS.oscuro.tokens, n.tokenColor!);
      const c = hex(TEMAS.claro.tokens, n.tokenColor!);
      // Distancia angular de tono (0..180): el verde sigue siendo verde y el oro sigue siendo oro.
      const bruto = Math.abs(tono(o) - tono(c));
      const giro = Math.min(bruto, 360 - bruto);
      expect(giro, `${n.clave}: ${giro.toFixed(0)}° entre temas`).toBeLessThanOrEqual(20);
      // Y NO son el mismo hex: si lo fueran, uno de los dos fondos lo estaría lavando o cegando.
      // "El mismo color" no es "el mismo valor": es la misma familia, ajustada a cada fondo.
      expect(o, `${n.clave} usa el mismo hex en los dos temas`).not.toBe(c);
    }
  });
});
