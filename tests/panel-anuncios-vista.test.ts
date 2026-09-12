/**
 * Tests ESTRUCTURALES de `/panel/notificaciones` y de los anuncios. Fijan decisiones que un refactor
 * podría deshacer sin que nada más se queje:
 *
 *  1. ENVIAR NO REPARTE: ni la ruta ni `enviarAnuncio` escriben avisos; el reparto es el job.
 *  2. El inspector no expone la clave del hecho (en un voto llevaría al votante).
 *  3. Cada tipo de la unión tiene su nombre humano en el panel.
 *  4. La sección ya no es un placeholder.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { TipoNotificacionSchema } from "../src/config/constants";
import { ETIQUETA_TIPO } from "../src/app/panel/notificaciones/etiquetas";
import { seccionPorHref } from "../src/app/panel/secciones";

const RAIZ = process.cwd();
const leer = (...tramos: string[]) => readFileSync(join(RAIZ, ...tramos), "utf8");
const soloCodigo = (fuente: string): string =>
  fuente.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "").replace(/^\s*\/\/.*$/gm, "");

const SERVICIO = soloCodigo(leer("src", "server", "services", "anuncios.ts"));

describe("enviar no reparte", () => {
  it("la ruta de envío no escribe avisos ni llama al reparto", () => {
    const ruta = soloCodigo(leer("src", "app", "api", "panel", "anuncios", "route.ts"));
    expect(ruta).toMatch(/enviarAnuncio\(/);
    expect(ruta).not.toMatch(/notification|repartirAnuncio|createMany/i);
  });

  it("`enviarAnuncio` crea el anuncio y el job, y ni un aviso", () => {
    const inicio = SERVICIO.indexOf("export async function enviarAnuncio");
    const fin = SERVICIO.indexOf("export interface TramoReparto");
    expect(inicio).toBeGreaterThan(-1);
    expect(fin).toBeGreaterThan(inicio);
    const cuerpo = SERVICIO.slice(inicio, fin);
    expect(cuerpo).toMatch(/announcement\.create\(/);
    expect(cuerpo).toMatch(/job\.create\(/);
    expect(cuerpo).not.toMatch(/notification|repartirAnuncio\(/);
  });

  it("el reparto escribe con INSERT IGNORE (skipDuplicates), la guarda de idempotencia", () => {
    expect(SERVICIO).toMatch(/notification\.createMany\(\{[\s\S]*?skipDuplicates:\s*true/);
  });
});

describe("el inspector no filtra la clave del hecho", () => {
  it("su vista no lleva refId, refType ni datos", () => {
    const inicio = SERVICIO.indexOf("export interface NotificacionInspector");
    const bloque = SERVICIO.slice(inicio, SERVICIO.indexOf("}", inicio));
    expect(bloque).toContain("texto");
    expect(bloque).not.toMatch(/refId|refType|datos/);
  });
});

describe("/panel/notificaciones", () => {
  it("cada tipo de la unión tiene su nombre humano (ni uno más ni uno menos)", () => {
    expect(Object.keys(ETIQUETA_TIPO).sort()).toEqual([...TipoNotificacionSchema.options].sort());
  });

  it("ya no es un placeholder", () => {
    expect(soloCodigo(leer("src", "app", "panel", "notificaciones", "page.tsx"))).not.toContain(
      "Placeholder",
    );
    expect(seccionPorHref("/panel/notificaciones")?.fase).toBeNull();
  });
});
