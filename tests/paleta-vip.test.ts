/**
 * LA PALETA VIP, MEDIDA — tema por tema, como el resto de la paleta.
 *
 * Son dos familias con trabajos distintos y exigencias distintas:
 *
 *  - `--vip-gold` / `--vip-gold-deep` / `--vip-a|b|c` son FORMAS (el sello, la gema, el aro). Lo
 *    que se les pide es que se VEAN sobre el fondo, no que se lean como texto: el listón es 3:1,
 *    el de un elemento gráfico.
 *  - `--vip-nombre-*` son TEXTO. Un nombre es la cosa que más se lee de una persona en toda la
 *    app, así que el listón es 4,5:1 (AA) y contra los TRES fondos donde puede caer: la tarjeta,
 *    la página y el elevado (una fila de comentario resaltada, un menú).
 *
 * Y SE MIDEN LOS DOS TEMAS. Esa es la mitad del valor de este fichero: el error natural aquí es
 * elegir cinco colores bonitos sobre negro y descubrir seis semanas después, en la captura de un
 * usuario, que en claro tres de ellos eran ilegibles. Un hex en `constants.ts` habría hecho ese
 * error IMPOSIBLE DE EVITAR, porque no habría dónde poner el segundo valor.
 *
 * Para romperlo a propósito: subirle la luminosidad a un `--vip-nombre-*` del tema claro hasta
 * pasarse (rojo por contraste), o ponerle a dos opciones valores parecidos (rojo por ΔE).
 */
import { describe, expect, it } from "vitest";

import { COLORES_NOMBRE_VIP } from "../src/config/constants";

import { contraste, deltaE } from "./helpers/color";
import { CLARO, hex, OSCURO, VIP_CLARO, VIP_OSCURO } from "./helpers/paleta";

/** Los tres fondos sobre los que puede caer un nombre. Salen de la paleta, no se escriben aquí. */
const fondos = (tema: Map<string, string>): Record<string, string> => ({
  surface: hex(tema, "--df-surface"),
  void: hex(tema, "--df-void"),
  raised: hex(tema, "--df-raised"),
});

/** El hex de un token VIP en un tema. "" si falta o no es sólido: revienta al medirlo, con nombre. */
const vip = (tema: Map<string, string>, nombre: string): string => {
  const v = tema.get(nombre) ?? "";
  return /^#[0-9a-f]{6}$/i.test(v) ? v : "";
};

const TEMAS = [
  { nombre: "oscuro", df: OSCURO, vip: VIP_OSCURO },
  { nombre: "claro", df: CLARO, vip: VIP_CLARO },
] as const;

describe("los tokens VIP existen en los DOS temas", () => {
  it("se leyeron de verdad (si no, lo de abajo no mide nada)", () => {
    // Sin esto, un cambio de formato en el CSS dejaría los mapas vacíos y TODO lo de abajo pasaría
    // en verde sin comparar un solo color. Es el fallo clásico de un guard que lee ficheros.
    //
    // NUEVE: los dos del oro del sello, los tres del degradado y los CUATRO colores de nombre.
    expect(VIP_OSCURO.size).toBeGreaterThanOrEqual(9);
    expect(VIP_CLARO.size).toBeGreaterThanOrEqual(9);
  });

  it("ningún token vive en un tema y falta en el otro", () => {
    // Un token que falta en un tema HEREDA el valor del otro sin que nada falle: el oro del tema
    // oscuro pintándose sobre blanco, por ejemplo. No hay excepción posible aquí.
    expect([...VIP_OSCURO.keys()].sort()).toEqual([...VIP_CLARO.keys()].sort());
  });

  it("el catálogo y el CSS nombran exactamente los mismos colores de nombre", () => {
    // Si el catálogo apunta a un token que no existe, `var(--vip-nombre-x)` no resuelve a nada y el
    // nombre se queda con el color de respaldo: el VIP pierde SU color y no falla nada.
    const delCatalogo = Object.values(COLORES_NOMBRE_VIP).sort();
    const delCss = [...VIP_OSCURO.keys()].filter((k) => k.startsWith("--vip-nombre-")).sort();
    expect(delCss).toEqual(delCatalogo);
  });
});

describe("un nombre VIP se LEE: AA (4,5:1) en los dos temas y sobre los tres fondos", () => {
  for (const tema of TEMAS) {
    for (const token of Object.values(COLORES_NOMBRE_VIP)) {
      it(`${token} en ${tema.nombre}`, () => {
        const color = vip(tema.vip, token);
        expect(color, `${token} no está en el tema ${tema.nombre}`).not.toBe("");
        for (const [donde, fondo] of Object.entries(fondos(tema.df))) {
          expect(
            contraste(color, fondo),
            `${token} sobre ${donde} (${tema.nombre}): un nombre es TEXTO, el listón es 4,5`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      });
    }
  }
});

describe("las cinco opciones se distinguen entre sí", () => {
  // Un catálogo donde dos opciones se parecen no es un catálogo de cinco: es uno de cuatro con una
  // repetida, y quien elija la segunda creerá que no se guardó.
  for (const tema of TEMAS) {
    it(`en ${tema.nombre}, ΔE >= 10 entre cualquier par`, () => {
      const tokens = Object.values(COLORES_NOMBRE_VIP);
      const flojos: string[] = [];
      for (let i = 0; i < tokens.length; i++) {
        for (let j = i + 1; j < tokens.length; j++) {
          const d = deltaE(vip(tema.vip, tokens[i]!), vip(tema.vip, tokens[j]!));
          if (d < 10) flojos.push(`${tokens[i]} / ${tokens[j]}: ${d.toFixed(1)}`);
        }
      }
      expect(flojos, "dos opciones que no se distinguen").toEqual([]);
    });
  }
});

describe("el sello y la gema se VEN: 3:1, que es el listón de una forma", () => {
  for (const tema of TEMAS) {
    for (const token of ["--vip-gold", "--vip-a", "--vip-b", "--vip-c"]) {
      it(`${token} en ${tema.nombre}`, () => {
        const color = vip(tema.vip, token);
        expect(color, `${token} no está en el tema ${tema.nombre}`).not.toBe("");
        // Contra la tarjeta, que es el fondo del disco interior del sello.
        expect(contraste(color, hex(tema.df, "--df-surface"))).toBeGreaterThanOrEqual(3);
      });
    }
  }
});

describe("el oro del VIP NO es el oro del podio", () => {
  // `--df-rank` marca el puesto 1/2/3 y se puede comprobar; el sello VIP se compra. Si fueran el
  // mismo tono, el sello diría "va primero en el ranking", que es otra cosa — y la forma sola
  // (estrella contra medalla redonda) no basta a 18 px.
  for (const tema of TEMAS) {
    it(`en ${tema.nombre} se separan a ojo`, () => {
      const rank = hex(tema.df, "--df-rank");
      expect(rank, "no está --df-rank").not.toBe("");
      expect(deltaE(vip(tema.vip, "--vip-gold"), rank)).toBeGreaterThanOrEqual(5);
    });
  }

  it("y `--df-rank` no se ha tocado: el podio es de quien era", () => {
    // El oro del podio es intocable (va firmado). Esto clava sus dos valores con cifras escritas:
    // leerlos del token estaría siempre verde.
    expect(hex(OSCURO, "--df-rank").toLowerCase()).toBe("#e8c468");
    expect(hex(CLARO, "--df-rank").toLowerCase()).toBe("#b8860b");
  });
});
