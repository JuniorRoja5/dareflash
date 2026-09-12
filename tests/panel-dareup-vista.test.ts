/**
 * Tests ESTRUCTURALES de `/panel/ranking` (DareUp y ranking). Fijan decisiones que un refactor podría
 * deshacer sin que nada más se queje:
 *
 *  1. La regla "puntos no son victorias" está A LA VISTA en la pantalla (y en el ajuste).
 *  2. El ranking del mes REUSA `rankingMensual` (el mismo que la página pública), no otra consulta.
 *  3. Guard heredado del panel: la página no comprueba el rol a mano.
 *  4. La sección ya no es un placeholder.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { seccionPorHref } from "../src/app/panel/secciones";

const DIR = join(process.cwd(), "src", "app", "panel", "ranking");
const leer = (f: string) => readFileSync(join(DIR, f), "utf8");
const soloCodigo = (fuente: string): string =>
  fuente.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "").replace(/^\s*\/\/.*$/gm, "");

const PAGINA = soloCodigo(leer("page.tsx"));

describe("/panel/ranking", () => {
  it("dice, a la vista, que ajustar puntos no cambia victorias ni puesto", () => {
    const texto = PAGINA.replace(/\s+/g, " ");
    expect(texto).toContain("Puntos no son victorias.");
    expect(texto).toContain("no sus victorias ni su puesto en el ranking");
    expect(soloCodigo(leer("ajustar-puntos.tsx")).replace(/\s+/g, " ")).toContain(
      "No cambia sus victorias ni su puesto en el ranking del mes.",
    );
  });

  it("el ranking del mes reusa `rankingMensual` (keyset), sin consulta propia", () => {
    expect(PAGINA).toMatch(/rankingMensual\(prisma/);
    expect(PAGINA).not.toMatch(/\bskip\s*:/);
    expect(soloCodigo(leer("ranking-mes-panel.tsx"))).toContain("/api/ranking?cursor=");
  });

  it("NO comprueba el rol a mano (el guard es el del layout del panel)", () => {
    expect(PAGINA).not.toMatch(/role\s*===\s*["']ADMIN["']/);
    expect(PAGINA).not.toMatch(/requireRole|protegerPanel/);
  });

  it("ya no es un placeholder", () => {
    expect(PAGINA).not.toContain("Placeholder");
    expect(seccionPorHref("/panel/ranking")?.fase).toBeNull();
  });
});
