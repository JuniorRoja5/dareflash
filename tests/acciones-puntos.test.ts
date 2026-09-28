/**
 * LA TABLA DE "CÓMO GANAR PUNTOS" NO PUEDE MENTIR.
 *
 * `ACCIONES_PUNTOS` dice qué acciones dan puntos y cuáles están por llegar. Es config —la pantalla
 * no puede averiguarlo sola— y por eso necesita un vigilante: este test CONTRASTA esa config con el
 * CÓDIGO que de verdad otorga puntos (`server/services`).
 *
 *  - Una acción marcada ACTIVA cuya razón no la otorga nadie -> rojo. Es una promesa falsa.
 *  - Una acción marcada PRÓXIMAMENTE que YA se está pagando -> rojo. Es la pantalla quedándose
 *    desfasada, que es exactamente lo que pasa cuando se cablea algo y nadie se acuerda de la tabla.
 *
 * Así el día que se implemente la racha, el test avisa antes que un usuario.
 *
 * Para romperlo: girar cualquier `activa` en `constants.ts` (rojo), o poner un importe a mano en el
 * componente en vez de leerlo de `POINTS` (rojo en el caso de los valores).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import * as CONSTANTES from "../src/config/constants";
import { ACCIONES_PUNTOS, POINTS } from "../src/config/constants";

const RAIZ = process.cwd();
const SERVICIOS = join(RAIZ, "src", "server", "services");

/** Todo el código de los servicios, junto: es donde vive cualquier `applyPoints`. */
const CODIGO = readdirSync(SERVICIOS)
  .filter((f) => f.endsWith(".ts"))
  .map((f) => readFileSync(join(SERVICIOS, f), "utf8"))
  .join("\n")
  // Los comentarios no otorgan puntos: mencionar una razón al explicarla no la implementa.
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

/**
 * ¿Otorga el código esta razón? Se busca su VALOR literal (`reason: "WIN_CHALLENGE"`) o el NOMBRE de
 * la constante que la contiene (`reason: RAZON_INVITO_AMIGO`), que es como la escriben los servicios
 * que la importan. Las dos formas son la misma cosa, y mirar solo una dejaría media tabla sin vigilar.
 */
function seOtorga(razon: string): boolean {
  if (CODIGO.includes(`"${razon}"`)) return true;
  const alias = Object.entries(CONSTANTES)
    .filter(([, v]) => v === razon)
    .map(([k]) => k);
  return alias.some((k) => new RegExp(`\\b${k}\\b`).test(CODIGO));
}

describe("el estado de cada acción sale del código, no de una lista a mano", () => {
  it("hay tabla que comprobar", () => {
    expect(ACCIONES_PUNTOS.length).toBeGreaterThanOrEqual(5);
    expect(ACCIONES_PUNTOS.some((a) => a.activa)).toBe(true);
    expect(ACCIONES_PUNTOS.some((a) => !a.activa)).toBe(true);
  });

  it("toda acción ACTIVA se otorga de verdad en algún servicio", () => {
    const mentiras = ACCIONES_PUNTOS.filter((a) => a.activa && !seOtorga(a.razon));
    expect(mentiras.map((a) => a.razon)).toEqual([]);
  });

  it("ninguna acción PRÓXIMAMENTE se está pagando ya (la tabla no se queda atrás)", () => {
    const desfasadas = ACCIONES_PUNTOS.filter((a) => !a.activa && seOtorga(a.razon));
    expect(desfasadas.map((a) => a.razon)).toEqual([]);
  });

  it("y el detector funciona: reconoce una razón que SÍ se otorga y rechaza una inventada", () => {
    // Sin esto, un `seOtorga` que devolviera siempre `true` (o siempre `false`) dejaría los dos
    // casos de arriba en verde para siempre.
    expect(seOtorga("WIN_CHALLENGE")).toBe(true);
    expect(seOtorga("RACHA_DE_SIETE_DIAS_INVENTADA")).toBe(false);
  });
});

describe("los importes salen del catálogo, no del JSX", () => {
  it("cada fila lleva un valor que existe en `POINTS`", () => {
    const valores = new Set<number>(Object.values(POINTS));
    for (const a of ACCIONES_PUNTOS) {
      expect(valores.has(a.puntos), `${a.razon}: ${a.puntos} no está en POINTS`).toBe(true);
    }
  });

  it("el componente NO escribe ningún número: los lee de la config", () => {
    const tabla = readFileSync(
      join(RAIZ, "src", "app", "(app)", "(shell)", "referidos", "tabla-puntos.tsx"),
      "utf8",
    );
    expect(tabla).toContain("ACCIONES_PUNTOS");
    // Un `+30` o un `+10` escritos a mano serían un segundo catálogo esperando a discrepar del que
    // se paga. Lo único que se pinta es `{a.puntos}`.
    expect(tabla).not.toMatch(/\+\s*\d+/);
  });
});
