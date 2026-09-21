/**
 * Tests ESTRUCTURALES de `/panel/moderacion` y de las dos ranuras del detalle de reto. Fijan
 * decisiones que un refactor podría deshacer sin que nada más se queje:
 *
 *  1. La sección ya no es un placeholder (y su fase pasó a `null`).
 *  2. La ficha del reto usa EL MISMO servicio que la cola, filtrado: dos consultas para lo mismo
 *     acabarían dando cifras distintas en dos pantallas que el admin mira a la vez.
 *  3. Las ranuras "próximamente" de Fase 5 desaparecieron de verdad del detalle de reto.
 *  4. Nadie pinta el vocabulario de la BD (REMOVED / RESOLVED / DISMISSED).
 *  5. La cola no inventa rutas: las dos acciones son las dos de esta pieza.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { seccionPorHref } from "../src/app/panel/secciones";

const PANEL = join(process.cwd(), "src", "app", "panel");
const leer = (...p: string[]) => readFileSync(join(PANEL, ...p), "utf8");
const soloCodigo = (fuente: string): string =>
  fuente.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "").replace(/^\s*\/\/.*$/gm, "");

const PAGINA = soloCodigo(leer("moderacion", "page.tsx"));
const COLA = soloCodigo(leer("moderacion", "cola.tsx"));
const RETO = soloCodigo(leer("retos", "[id]", "page.tsx"));

describe("/panel/moderacion", () => {
  it("ya no es un placeholder", () => {
    expect(PAGINA).not.toContain("Placeholder");
    expect(seccionPorHref("/panel/moderacion")?.fase).toBeNull();
  });

  it("es del MODERADOR: su guard sale de la sección, no de un rol escrito a mano", () => {
    expect(PAGINA).toContain('requireSeccion("/panel/moderacion")');
    expect(PAGINA).not.toContain("requireRole");
    expect(seccionPorHref("/panel/moderacion")?.rol).toBe("MODERATOR");
  });

  it("la cola llama a las DOS acciones de la pieza, y a ninguna inventada", () => {
    const rutas = [...COLA.matchAll(/\/api\/panel\/moderacion\/\$\{accion\}/g)];
    expect(rutas.length).toBeGreaterThan(0);
    // Y las acciones posibles son exactamente esas dos.
    expect(COLA).toMatch(/"retirar" \| "descartar"/);
  });
});

describe("las ranuras del detalle de reto, cableadas", () => {
  it("la tarjeta de denuncias es una cifra REAL, no un 'próximamente'", () => {
    expect(RETO).toContain("contarDenunciasAbiertas");
    expect(RETO).toMatch(/<TarjetaMetrica[\s\S]{0,200}?valor=\{denuncias\}/);
    expect(RETO).not.toContain('etiqueta="Reportes de spam"');
  });

  it("la lista es la MISMA cola, filtrada por el reto (un solo servicio)", () => {
    expect(RETO).toContain("listarColaModeracion");
    expect(RETO).toMatch(/<ColaModeracion[\s\S]{0,200}?reto=\{reto\.id\}/);
    expect(RETO).not.toContain('titulo="Reportes y moderación"');
  });

  it("ya no queda ninguna ranura de Fase 5 en el detalle", () => {
    expect(RETO).not.toMatch(/fase=\{5\}/);
  });
});

describe("copy humano en pantalla", () => {
  it("ni la cola ni las páginas escriben el vocabulario de la base de datos", () => {
    for (const [nombre, fuente] of [
      ["cola", COLA],
      ["moderacion/page", PAGINA],
      ["retos/[id]/page", RETO],
    ] as const) {
      expect(fuente, nombre).not.toMatch(/"(REMOVED|RESOLVED|DISMISSED)"/);
      expect(fuente, nombre).not.toMatch(/>\s*(REMOVED|RESOLVED|DISMISSED|OPEN)\s*</);
    }
  });
});
