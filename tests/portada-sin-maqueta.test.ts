/**
 * LA PORTADA NO VUELVE A MENTIR (Fase 9 · P14) — censo de los ficheros de `/inicio`.
 *
 * Hasta P14 la mitad de la portada era maqueta en producción: el reto del hero («247 participantes»),
 * las cifras («$8.4k», «2.310») y la rejilla salían de `RETOS_SEED` vía `portada-datos`. Y llevaba un
 * vídeo de fondo de 17,4 MB. Este censo falla si vuelve cualquiera de las tres cosas:
 *  1. importar datos de maqueta (`retos-datos` con su semilla, `portada-datos`, o sus símbolos);
 *  2. una CIFRA escrita a mano en el código de la portada (un importe, un millar, «N participantes»…);
 *  3. un `<video>` o un `.mp4`.
 *
 * Lee solo el CÓDIGO (sin comentarios): los comentarios cuentan, a propósito, qué había antes.
 *
 * Para romperlo a propósito: escribir «$8.400» o «247 participantes» en un fichero de /inicio, importar
 * `RETOS_SEED`, o volver a montar un `<video>` (rojo cada uno).
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = path.resolve(__dirname, "..");
const INICIO = path.join(RAIZ, "src", "app", "(app)", "(shell)", "inicio");
/** La portada y lo que solo ella pinta. */
const FICHEROS = [
  ...readdirSync(INICIO)
    .filter((f) => /\.(ts|tsx)$/.test(f))
    .map((f) => path.join(INICIO, f)),
  path.join(RAIZ, "src", "app", "(app)", "(shell)", "retos", "tarjeta-vertical.tsx"),
  path.join(RAIZ, "src", "components", "ui", "telon-portada.tsx"),
];

const soloCodigo = (s: string) =>
  s.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "").replace(/^\s*\/\/.*$/gm, "");
const codigo = (f: string) => soloCodigo(readFileSync(f, "utf8"));
const rel = (f: string) => path.relative(RAIZ, f).split(path.sep).join("/");

/**
 * UNA CIFRA ESCRITA A MANO: un importe («$8.400», «$8.4k», «8.400 $»), un millar con separador
 * («2.310», «2,310») o un número pegado a lo que cuenta («247 participantes», «12 votos»). Lo que sí
 * puede haber —retrasos de animación, «900» de un count-up— no tiene esa forma.
 */
const CIFRA_A_MANO =
  /\$\s?\d|\d\s?\$|\b\d{1,3}[.,]\d{3}\b|\b\d+\s+(participantes|votos|retos|categor[ií]as|premios)\b/i;

describe("la portada sin maqueta", () => {
  it("hay ficheros que revisar (si no, el censo es decorativo)", () => {
    expect(FICHEROS.length).toBeGreaterThanOrEqual(7);
  });

  it("ningún fichero importa la maqueta ni sus símbolos", () => {
    const culpables = FICHEROS.filter((f) =>
      /portada-datos|RETOS_SEED|RetoSemilla|STATS_INICIO|RETO_HERO|RETOS_REJILLA/.test(codigo(f)),
    ).map(rel);
    expect(culpables).toEqual([]);
  });

  it("ninguna cifra escrita a mano", () => {
    const culpables = FICHEROS.flatMap((f) => {
      const m = CIFRA_A_MANO.exec(codigo(f));
      return m ? [`${rel(f)}: «${m[0]}»`] : [];
    });
    expect(culpables).toEqual([]);
  });

  it("sin vídeo de fondo: ni <video> ni .mp4", () => {
    const culpables = FICHEROS.filter((f) => /<video\b|\.mp4\b|VIDEO_FONDO/.test(codigo(f))).map(
      rel,
    );
    expect(culpables).toEqual([]);
  });

  it("y el patrón de cifras SÍ las reconoce (si no, lo de arriba no buscaría nada)", () => {
    for (const s of ["$8.4k", "8.400 $", "2.310", "247 participantes", "12 votos"]) {
      expect(CIFRA_A_MANO.test(s), s).toBe(true);
    }
    for (const s of ['animationDelay: "60ms"', "/ 900", "max-w-[560px]"]) {
      expect(CIFRA_A_MANO.test(s), s).toBe(false);
    }
  });
});
