/**
 * Tests ESTRUCTURALES de `/panel/usuarios`. Fijan decisiones que un refactor podría deshacer sin que
 * nada más se queje:
 *
 *  1. La sección ya no es un placeholder (y su fase pasó a `null`).
 *  2. La página usa el buscador del PANEL, no el público: el público esconde a los suspendidos, que
 *     son justo a quienes hay que encontrar aquí.
 *  3. La visibilidad de los controles sale de `controlesCuenta`, nunca de condiciones a ojo en el JSX.
 *  4. No hay rutas de mutación nuevas: se llama a las tres de la pieza A.
 *  5. El rol de quien mira sale de la SESIÓN (`protegerPanel`), no de un valor fijo — es lo que hace
 *     que la página siga siendo correcta cuando el panel se abra a los moderadores.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { seccionPorHref } from "../src/app/panel/secciones";

const DIR = join(process.cwd(), "src", "app", "panel", "usuarios");
const leer = (f: string) => readFileSync(join(DIR, f), "utf8");
const soloCodigo = (fuente: string): string =>
  fuente.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "").replace(/^\s*\/\/.*$/gm, "");

const PAGINA = soloCodigo(leer("page.tsx"));
const ACCIONES = soloCodigo(leer("acciones-cuenta.tsx"));

describe("/panel/usuarios", () => {
  it("ya no es un placeholder", () => {
    expect(PAGINA).not.toContain("Placeholder");
    expect(seccionPorHref("/panel/usuarios")?.fase).toBeNull();
    // Y conserva su copy: la sección es la misma, ahora construida.
    expect(seccionPorHref("/panel/usuarios")?.descripcion).toContain("Buscar cuentas");
  });

  it("usa el buscador del PANEL (ve a los suspendidos), no el público", () => {
    expect(PAGINA).toContain("buscarCuentasAdmin");
    expect(PAGINA).not.toContain("buscarUsuarios");
  });

  it("la visibilidad de los controles sale de `controlesCuenta`, no de ifs a mano", () => {
    expect(ACCIONES).toContain("controlesCuenta(");
    // Nada de decidir por rol a ojo en el componente.
    expect(ACCIONES).not.toMatch(/rol\w*\s*===\s*["'](ADMIN|MODERATOR)["']/);
    expect(PAGINA).not.toMatch(/===\s*["'](ADMIN|MODERATOR)["']/);
  });

  it("no inventa rutas: llama a las tres de la pieza A", () => {
    const rutas = [...ACCIONES.matchAll(/\/api\/panel\/cuentas\/\$\{userId\}\/(\w+)/g)].map(
      (m) => m[1],
    );
    expect(rutas.sort()).toEqual(["levantar", "rol", "suspender"]);
  });

  it("el rol de quien mira sale de la sesión, y el guard es el de SU sección", () => {
    // Desde que el panel se abrió a los moderadores, el guard de cada página se deriva de su sección
    // (`requireSeccion`, que lee el rol de `secciones.ts`). Antes bastaba con el del shell.
    expect(PAGINA).toContain('requireSeccion("/panel/usuarios")');
    expect(PAGINA).toMatch(/rolMira=\{quienMira\.role\}/);
    // Y el rol no se escribe a mano en la página: eso sería una segunda verdad.
    expect(PAGINA).not.toContain("requireRole");
  });

  it("en pantalla no se escriben los códigos internos del rol ni del baneo", () => {
    const visible = PAGINA + ACCIONES;
    expect(visible).not.toContain("bannedAt");
    // `MODERATOR` solo aparece como VALOR que se envía a la API (el rol pedido), nunca como texto.
    expect(visible).not.toMatch(/>\s*(MODERATOR|ADMIN|USER)\s*</);
  });
});
