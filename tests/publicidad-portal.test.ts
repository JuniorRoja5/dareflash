/**
 * LA PUBLICIDAD EN EL PORTAL, estructural (Fase 9 · P6). No comprueba un resultado: fija DECISIONES
 * que se pueden deshacer sin que falle nada a la vista.
 *
 *  1. EL CENSO DE AISLAMIENTO. Toda función exportada del servicio que toca UNA campaña (recibe un
 *     `publicidadId`) recibe también `empresaId`, OBLIGATORIO. Un filtro opcional se olvida y compila;
 *     un parámetro obligatorio no. Y ninguna página ni ruta de la publicidad saca el `empresaId` de
 *     la petición: todos vienen del ámbito del chokepoint. Se ENUMERAN los ficheros (no los que
 *     alguien recuerde), que es lo que falló con el auto-oculto.
 *  2. EL AVISO QUE CADUCA. En P6 las campañas no salen en el feed, y el portal lo dice
 *     (`MSG_PUBLICIDAD_AUN_NO_SALE`). El día que el feed empiece a servir publicidad (P7), la frase
 *     tiene que irse en esa misma pieza: si el feed ya usa la cascada del reparto y la frase sigue,
 *     esto se pone rojo. Un «todavía no» que sobrevive a su fase es una mentira con fecha.
 *
 * Para romperlo a propósito: hacer `empresaId?` en `pausarPublicidad` (rojo el censo); escribir
 * `body.empresaId` en la ruta (rojo); importar `elegiblesEnHueco` en el feed sin quitar la frase (rojo).
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

describe("el aviso de que la publicidad aún no sale", () => {
  it("si el feed ya sirve publicidad (usa la cascada del reparto), la frase tiene que haberse ido", () => {
    const feed = [
      ...ficheros(raiz("src", "app", "(app)", "feed")),
      ...ficheros(raiz("src", "components", "feed")),
      ...ficheros(raiz("src", "app", "api", "feed")),
    ];
    const sirve = feed.some((f) => /elegiblesEnHueco/.test(soloCodigo(readFileSync(f, "utf8"))));
    const constantes = soloCodigo(leer("src", "config", "constants.ts"));
    const avisoVivo = /export const MSG_PUBLICIDAD_AUN_NO_SALE\b/.test(constantes);
    // Hoy (P6): el feed no sirve y el aviso está. Cuando P7 sirva, el aviso se va con él.
    expect(
      sirve && avisoVivo,
      "el feed ya sirve publicidad: quita MSG_PUBLICIDAD_AUN_NO_SALE",
    ).toBe(false);
    expect(
      sirve || avisoVivo,
      "ni se sirve ni se avisa: alguien quitó el aviso antes de tiempo",
    ).toBe(true);
  });
});
