/**
 * LA PUBLICIDAD EN EL PORTAL, estructural (Fase 9 · P6). No comprueba un resultado: fija DECISIONES
 * que se pueden deshacer sin que falle nada a la vista.
 *
 *  1. EL CENSO DE AISLAMIENTO. Toda función exportada del servicio que toca UNA campaña (recibe un
 *     `publicidadId`) recibe también `empresaId`, OBLIGATORIO. Un filtro opcional se olvida y compila;
 *     un parámetro obligatorio no. Y ninguna página ni ruta de la publicidad saca el `empresaId` de
 *     la petición: todos vienen del ámbito del chokepoint. Se ENUMERAN los ficheros (no los que
 *     alguien recuerde), que es lo que falló con el auto-oculto.
 *  2. LOS AVISOS QUE CADUCAN. En P6 el portal decía que la publicidad aún no salía
 *     (`MSG_PUBLICIDAD_AUN_NO_SALE`); desde P7 el feed la sirve y esa frase se fue. Ahora dice que los
 *     días no se cobran (`MSG_PUBLICIDAD_PERIODO_GRATIS`), y esa se va en cuanto exista el cobro diario
 *     (motivo CONSUMO, P9). Un «todavía no» que sobrevive a su fase es una mentira con fecha.
 *
 * Para romperlo a propósito: hacer `empresaId?` en `pausarPublicidad` (rojo el censo); escribir
 * `body.empresaId` en la ruta (rojo); volver a exportar MSG_PUBLICIDAD_AUN_NO_SALE (rojo); añadir
 * "CONSUMO" a los motivos de crédito sin quitar el aviso del periodo gratis (rojo).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const raiz = (...p: string[]) => path.resolve(__dirname, "..", ...p);
const leer = (...p: string[]) => readFileSync(raiz(...p), "utf8");
/** Sin comentarios: la prosa que explica la regla no puede contar como infracción (ni como cumplirla). */
const soloCodigo = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function ficheros(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) return ficheros(p);
    return /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}

/** La firma de una función exportada: de su nombre al paréntesis que cierra sus parámetros. */
function firmaDe(fuente: string, nombre: string): string {
  const i = fuente.indexOf(`function ${nombre}(`);
  if (i < 0) return "";
  let profundidad = 0;
  for (let j = fuente.indexOf("(", i); j < fuente.length; j += 1) {
    if (fuente[j] === "(") profundidad += 1;
    else if (fuente[j] === ")") {
      profundidad -= 1;
      if (profundidad === 0) return fuente.slice(i, j + 1);
    }
  }
  return "";
}

const SERVICIO = soloCodigo(leer("src", "server", "services", "publicidad.ts"));
const exportadas = [...SERVICIO.matchAll(/export (?:async )?function (\w+)/g)].map((m) => m[1]!);

describe("el censo de aislamiento de la publicidad", () => {
  it("hay funciones que censar (si esto falla, el detector está roto)", () => {
    const conCampana = exportadas.filter((n) => /\bpublicidadId\b/.test(firmaDe(SERVICIO, n)));
    expect(conCampana.length).toBeGreaterThanOrEqual(8);
  });

  /**
   * Las que reciben un `publicidadId` y NO tocan la base de datos, con su motivo. Cada una, a mano: el
   * censo es esto.
   *  - `nombreImagenPublicidad`: deriva el nombre del fichero a partir del id (puro). Quien lo usa ya
   *    ha resuelto la campaña con su ámbito.
   */
  const PURAS = new Set(["nombreImagenPublicidad"]);

  it("toda función que toca UNA campaña recibe `empresaId`, obligatorio", () => {
    for (const n of exportadas) {
      const firma = firmaDe(SERVICIO, n);
      if (!/\bpublicidadId\b/.test(firma) || PURAS.has(n)) continue;
      expect(firma, `${n} no recibe empresaId`).toMatch(/\bempresaId: string\b/);
      expect(firma, `${n} lo recibe opcional`).not.toMatch(/empresaId\?/);
    }
  });

  it("ninguna página ni ruta de la publicidad saca el `empresaId` de la petición", () => {
    const superficies = [
      ...ficheros(raiz("src", "app", "(app)", "(shell)", "empresa", "publicidad")),
      ...ficheros(raiz("src", "app", "api", "empresa", "publicidad")),
    ];
    expect(superficies.length).toBeGreaterThanOrEqual(6);
    for (const f of superficies) {
      const usos = [...soloCodigo(readFileSync(f, "utf8")).matchAll(/([\w.]*\.)?empresaId/g)].map(
        (m) => m[0],
      );
      for (const uso of usos) {
        expect(uso, `${path.relative(raiz(), f)}: ${uso} no sale del ámbito`).toMatch(
          /^(r\.)?ambito\.empresaId$/,
        );
      }
    }
  });

  it("la lista compone el ámbito con AND (conKeysetTiempo), no por spread", () => {
    expect(SERVICIO).toContain("conKeysetTiempo({ empresaId }");
    expect(SERVICIO).not.toMatch(/\.\.\.dondeDesde\(/);
  });
});

describe("qué es un crédito, sin la frase que mentía (P9-P10)", () => {
  it("nadie vuelve a escribir que un crédito es un día: lo dice `fraseQueEsUnCredito`, de la tabla", () => {
    // Era cierto solo en una ciudad (un día global cuesta 15) y, con el cobro diario, al lado de un
    // «−15» se leía como un error. Se colaba en sitios sueltos: P9 arregló tres y P10 encontró dos más.
    const culpables = ficheros(raiz("src"))
      .filter((f) => !f.includes(`${path.sep}generated${path.sep}`))
      .filter((f) =>
        /cr[eé]dito[^.\n]{0,30}es (?:1|un) d[ií]a/i.test(soloCodigo(readFileSync(f, "utf8"))),
      )
      .map((f) => path.relative(raiz(), f));
    expect(culpables).toEqual([]);
  });
});

describe("los avisos que caducan", () => {
  const constantes = () => soloCodigo(leer("src", "config", "constants.ts"));

  it("si el feed ya sirve publicidad, el aviso de «todavía no se muestra» tiene que haberse ido", () => {
    const feed = [
      ...ficheros(raiz("src", "app", "(app)", "feed")),
      ...ficheros(raiz("src", "components", "feed")),
      ...ficheros(raiz("src", "app", "api", "feed")),
    ];
    // Servir = alguna superficie del feed pide piezas al servicio de entrega (P7).
    const sirve = feed.some((f) =>
      /services\/publicidad-entrega/.test(soloCodigo(readFileSync(f, "utf8"))),
    );
    const avisoVivo = /export const MSG_PUBLICIDAD_AUN_NO_SALE\b/.test(constantes());
    expect(
      sirve && avisoVivo,
      "el feed ya sirve publicidad: quita MSG_PUBLICIDAD_AUN_NO_SALE",
    ).toBe(false);
    expect(
      sirve || avisoVivo,
      "ni se sirve ni se avisa: alguien quitó el aviso antes de tiempo",
    ).toBe(true);
  });

  it("el aviso del periodo gratis vive mientras no se cobre, y se va en cuanto exista el cobro (P9)", () => {
    // El cobro diario es el motivo de crédito CONSUMO (P9). Mientras no exista, los días no se cobran
    // y el portal tiene que decirlo; en cuanto exista, esa frase sería mentira y tiene que irse —y P9
    // no puede cobrar los días de este periodo, ni con efecto retroactivo (lo dice la propia frase).
    const c = constantes();
    const razones = /RazonCreditoSchema = z\.enum\(\[([^\]]*)\]\)/.exec(c)?.[1] ?? "";
    expect(razones, "no encuentro la unión de motivos de crédito").not.toBe("");
    const cobra = /"CONSUMO"/.test(razones);
    const avisoVivo = /export const MSG_PUBLICIDAD_PERIODO_GRATIS\b/.test(c);
    expect(cobra && avisoVivo, "ya se cobra cada día: quita MSG_PUBLICIDAD_PERIODO_GRATIS").toBe(
      false,
    );
    expect(cobra || avisoVivo, "ni se cobra ni se avisa del periodo gratis").toBe(true);
  });
});
