/**
 * LA PALETA v3, CLAVADA CON SUS VALORES. Este test es distinto de `paleta-oscura` a propósito, y los
 * dos hacen falta:
 *
 *  - `paleta-oscura` MIDE. Protege cualquier paleta futura: dice que la acción y el dinero se tienen
 *    que distinguir, sin decir de qué color son. Sobrevive al próximo repintado.
 *  - ESTE CLAVA. Dice que la acción es EXACTAMENTE `#2be84b`, el verde que firmaron Sergio y Junior,
 *    y que ningún magenta ni morado sobrevive. Un test que leyera la constante para compararla
 *    consigo misma estaría siempre verde: el día que alguien tocase el token, el test cambiaría con
 *    él y nadie se enteraría. Por eso aquí los valores van ESCRITOS.
 *
 * Y el CONTRASTE DEL CTA también va con cifras escritas. El relleno de acción pasó de un magenta
 * oscuro a un verde brillante, y con un verde brillante el texto BLANCO deja de leerse: blanco sobre
 * `#2be84b` da 1,65:1 donde hacen falta 4,5. El texto va oscuro. Se comprueba con los dos hex
 * literales, no preguntándole al CSS cuál usa — si se lo preguntara, cambiar el CSS cambiaría la
 * pregunta y la respuesta a la vez.
 *
 * EL HEX SE ESCRIBE EN MINÚSCULA en todo el repositorio, y no es cosmético: el guard que ata
 * `/style-guide` a la paleta busca `#[0-9a-f]{6}` sin marca de ignorar mayúsculas, así que un
 * `#2BE84B` en la guía no se compararía con nada. `#2BE84B` y `#2be84b` son el mismo color; lo que
 * cambia es si el guard lo ve.
 *
 * Para romperlo a propósito: mover `--df-action` un dígito (rojo), devolver el CTA a texto claro
 * (rojo), o dejar vivo un `#ff2e88` en cualquier parte (rojo).
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { botonTokens } from "../src/components/ui/logic";

import { contraste } from "./helpers/color";
import { CLARO, hex, OSCURO } from "./helpers/paleta";

const RAIZ = path.resolve(__dirname, "..");

/** LOS VALORES FIRMADOS, escritos. No se derivan de nada. */
const FIRMADOS_OSCURO: Record<string, string> = {
  "--df-action": "#2be84b",
  "--df-ok": "#2dd4bf",
  "--df-money": "#e8f620",
  "--df-void": "#070b08",
  "--df-surface": "#0f1511",
  "--df-raised": "#19211b",
};

/** Lo que el repintado NO podía tocar. Si alguno se movió, es que el swap se fue de madre. */
const INTACTOS_OSCURO: Record<string, string> = {
  "--df-time": "#ffa114",
  "--df-alarm": "#ff4d2e",
  "--df-rank": "#e8c468",
  "--df-silver": "#b3bbc6",
  "--df-bronze": "#bb7f4f",
  "--df-nivel-challenger": "#22c55e",
  "--df-nivel-pro": "#ff8c42",
  "--df-nivel-elite": "#22d3ee",
  "--df-text": "#f2f4f7",
  "--df-text-dim": "#8d95a3",
};

describe("los seis valores firmados están puestos, al dígito", () => {
  for (const [token, valor] of Object.entries(FIRMADOS_OSCURO)) {
    it(`${token} === ${valor}`, () => {
      expect(hex(OSCURO, token).toLowerCase()).toBe(valor);
    });
  }

  it("y se escriben en minúscula, que es lo que el guard de la guía sabe leer", () => {
    for (const token of Object.keys(FIRMADOS_OSCURO)) {
      expect(hex(OSCURO, token), `${token} en mayúscula`).toBe(hex(OSCURO, token).toLowerCase());
    }
  });
});

describe("el repintado no se llevó por delante nada más", () => {
  for (const [token, valor] of Object.entries(INTACTOS_OSCURO)) {
    it(`${token} sigue en ${valor}`, () => {
      expect(hex(OSCURO, token).toLowerCase()).toBe(valor);
    });
  }

  it("el tema claro no se tocó: verde, dorado y base siguen donde estaban", () => {
    // Están en el techo de AA — medido: un verde más brillante deja el texto del CTA en 3,31:1.
    expect(hex(CLARO, "--df-action").toLowerCase()).toBe("#15803d");
    expect(hex(CLARO, "--df-money").toLowerCase()).toBe("#8a6100");
    expect(hex(CLARO, "--df-void").toLowerCase()).toBe("#f4f6f8");
    expect(hex(CLARO, "--df-surface").toLowerCase()).toBe("#ffffff");
  });

  it("y su halo sube a 18%: lo único que cambia en claro", () => {
    expect(CLARO.get("--df-halo-fuerza")).toBe("18%");
    expect(OSCURO.get("--df-halo-fuerza"), "el halo del oscuro no cambia").toBe("22%");
  });
});

describe("el texto del CTA sólido se lee sobre el verde", () => {
  // Con cifras escritas: ni el verde ni el oscuro salen del CSS. Si mañana el CSS miente, esto no.
  const VERDE = "#2be84b";
  const OSCURO_CTA = "#070b08";

  it("oscuro sobre el verde cumple AA de sobra", () => {
    expect(Number(contraste(OSCURO_CTA, VERDE).toFixed(2))).toBeGreaterThanOrEqual(4.5);
  });

  it("y BLANCO sobre el verde NO cumple: por eso el texto va oscuro", () => {
    // El caso que justifica la decisión. Si alguien "arregla" el CTA poniéndole texto claro, el
    // caso de abajo cae; este explica por qué cae.
    expect(contraste("#ffffff", VERDE)).toBeLessThan(4.5);
  });

  it("y el botón principal pinta el texto OSCURO, no el claro", () => {
    expect(botonTokens("principal")).toMatchObject({ fondo: "action", texto: "void" });
    expect(botonTokens("peligro").texto).toBe("void");
  });

  it("el CTA del correo también va con texto oscuro sobre el relleno", () => {
    // El correo no tiene tokens: su botón se maqueta a mano, así que su contraste se puede romper
    // por separado y sin que la interfaz se entere.
    const correo = readFileSync(path.resolve(RAIZ, "src/server/email/plantilla.ts"), "utf8");
    expect(correo).toMatch(/bgcolor="\$\{COLOR\.action\}"/);
    expect(correo).toMatch(/background-color:\$\{COLOR\.action\}[^]*?color:\$\{COLOR\.void\}/);
  });
});

describe("no sobrevive ni un magenta ni un morado", () => {
  const EXTENSIONES = /\.(ts|tsx|css|svg|md|json)$/;
  const IGNORAR = ["node_modules", ".next", "src/generated", ".git", "dist", "coverage"];

  /**
   * ESTE FICHERO NO SE CENSA A SÍ MISMO, y no es una puerta trasera: es el que ESCRIBE los colores
   * prohibidos para poder prohibirlos. Un guard que se contara a sí mismo como infractor nace rojo
   * y acaba borrado. Es la única exención, y el caso de abajo comprueba que sigue haciendo falta.
   */
  const YO = "tests/marca-v3-firmada.test.ts";

  /**
   * SE MIRA EL CÓDIGO, NO LA PROSA. Un docblock que cite un color para explicar que está prohibido
   * no lo está usando — y sin esto el censo acusaba al docblock de `marca-hex-duplicados`, que cita
   * un `#ff00ff` justo para decir que el censo lo cazaría. Un comentario fabricando un rojo falso.
   */
  const sinComentarios = (rel: string, texto: string): string =>
    /\.svg$|\.md$/.test(rel)
      ? texto.replace(/<!--[\s\S]*?-->/g, "")
      : texto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  /** Todos los hex de 6 dígitos del repositorio, con el fichero donde salen. */
  const censo = (() => {
    const fuera: { fichero: string; hex: string }[] = [];
    const andar = (dir: string): void => {
      for (const e of readdirSync(path.resolve(RAIZ, dir), { withFileTypes: true })) {
        const rel = dir === "." ? e.name : `${dir}/${e.name}`;
        if (IGNORAR.some((i) => rel === i || rel.startsWith(`${i}/`))) continue;
        if (e.isDirectory()) andar(rel);
        else if (EXTENSIONES.test(rel) && rel !== YO) {
          const texto = sinComentarios(rel, readFileSync(path.resolve(RAIZ, rel), "utf8"));
          for (const m of texto.matchAll(/#[0-9a-fA-F]{6}\b/g))
            fuera.push({ fichero: rel, hex: m[0].toLowerCase() });
        }
      }
    };
    andar(".");
    return fuera;
  })();

  it("la exención de este fichero sigue haciendo falta (si no, sobra)", () => {
    const yo = readFileSync(path.resolve(RAIZ, YO), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(yo, "ya no escribe el magenta: quita la exención").toContain("#ff2e88");
  });

  it("se recorrió el repositorio de verdad (si no, lo de abajo no busca nada)", () => {
    expect(censo.length).toBeGreaterThan(30);
    expect(new Set(censo.map((c) => c.fichero)).size).toBeGreaterThan(3);
  });

  it("el magenta de la marca anterior no está en ninguna parte", () => {
    const vivos = [...new Set(censo.filter((c) => c.hex === "#ff2e88").map((c) => c.fichero))];
    expect(vivos, "quedó vivo el magenta de v2").toEqual([]);
  });

  it("y ningún color del repositorio cae en la zona magenta/morada", () => {
    // DEFINIDO CON NÚMEROS, no con la palabra "morado": tono Lab en [280,360) o [0,25) con croma
    // por encima de 25. Medido antes de escribirlo — el magenta de v2 cae en tono 1,8 con croma
    // 79,5, los morados entre 309 y 325, y el color legítimo más cercano es la alarma, en 36,9: once
    // grados de margen. Los grises azulados (tono 256-275) quedan fuera porque su croma no pasa de 9.
    const sospechosos = [...new Set(censo.map((c) => c.hex))]
      .map((h) => ({ h, ...lab(h) }))
      .filter((c) => c.croma > 25 && (c.tono >= 280 || c.tono < 25));
    const donde = sospechosos.map(
      (s) =>
        `${s.h} (tono ${s.tono.toFixed(0)}, croma ${s.croma.toFixed(0)}) en ${[
          ...new Set(censo.filter((c) => c.hex === s.h).map((c) => c.fichero)),
        ].join(", ")}`,
    );
    expect(donde, "esto es magenta o morado: la marca v3 es verde").toEqual([]);
  });
});

/** Tono y croma Lab de un hex. Las fórmulas largas viven en `helpers/color`; esto es lo mínimo. */
function lab(hexColor: string): { tono: number; croma: number } {
  const s = hexColor.slice(1);
  const [r, g, b] = [0, 2, 4]
    .map((i) => parseInt(s.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [
    number,
    number,
    number,
  ];
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const A = 500 * (f(X) - f(Y));
  const B = 200 * (f(Y) - f(Z));
  const grados = (Math.atan2(B, A) * 180) / Math.PI;
  return { tono: grados >= 0 ? grados : grados + 360, croma: Math.hypot(A, B) };
}
