/**
 * Tests ESTRUCTURALES de la pantalla de gestión de un reto (`/panel/retos/[id]`). Fijan las tres cosas
 * que la revisión pidió y que un refactor podría deshacer sin que nada más se queje:
 *
 *  1. GUARD HEREDADO, no por convención: la pantalla vive bajo `/panel` (cuyo layout llama a
 *     `protegerPanel()`) y NO comprueba el rol a mano con un `role === "ADMIN"`.
 *  2. CERO cifras inventadas: toda tarjeta con número saca el número de las métricas de la BD, y el
 *     componente de "próximamente" es incapaz de recibir un valor.
 *  3. Retirar REUTILIZA el endpoint que ya existía; no se ha creado otro.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();
const DIR_PANTALLA = join(RAIZ, "src", "app", "panel", "retos", "[id]");

const leer = (...tramos: string[]): string => readFileSync(join(...tramos), "utf8");

/** Quita comentarios: lo que se afirma es sobre el CÓDIGO, no sobre lo que un comentario explique. */
const soloCodigo = (fuente: string): string =>
  fuente.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "").replace(/^\s*\/\/.*$/gm, "");

const PAGINA = leer(DIR_PANTALLA, "page.tsx");
const LISTA = leer(DIR_PANTALLA, "participaciones-panel.tsx");
const TARJETAS = leer(RAIZ, "src", "app", "panel", "tarjetas.tsx");

describe("guard heredado del panel", () => {
  it("la pantalla cuelga de /panel (hereda protegerPanel + noindex del layout)", () => {
    // Si alguien la moviera fuera de `src/app/panel/**`, dejaría de estar protegida sin previo aviso.
    expect(statSync(join(DIR_PANTALLA, "page.tsx")).isFile()).toBe(true);
    expect(DIR_PANTALLA.startsWith(join(RAIZ, "src", "app", "panel"))).toBe(true);
  });

  it("NO comprueba el rol a mano (el guard es estructural, no una comparación suelta)", () => {
    for (const codigo of [soloCodigo(PAGINA), soloCodigo(LISTA)]) {
      expect(codigo).not.toMatch(/role\s*===\s*["']ADMIN["']/);
      // `\b` a propósito: `listarParticipacionesAdmin` contiene "esAdmin" y no es una comprobación.
      expect(codigo).not.toMatch(/\besAdmin\b/);
    }
  });
});

describe("cero cifras inventadas", () => {
  it("toda tarjeta con número toma el valor de las métricas de la BD", () => {
    const valores = soloCodigo(PAGINA).match(/valor=\{[^}]*\}/g) ?? [];
    expect(valores.length).toBeGreaterThan(0);
    // Un `valor={12}` o `valor={algo * 2}` cae aquí: los números de esta pantalla se calculan en
    // `metricasReto`, nunca se escriben en la vista.
    for (const v of valores) expect(v).toMatch(/^valor=\{metricas\.\w+\}$/);
  });

  it("la tarjeta de `próximamente` NO puede recibir un valor (imposible colar una cifra)", () => {
    // La honestidad vive en el TIPO, no en la disciplina de quien pinta.
    const props = /export function TarjetaProximamente\(\{([^}]*)\}/.exec(TARJETAS)?.[1] ?? "";
    expect(props).not.toContain("valor");
    // Y lo que pinta es una raya, no un 0 (un 0 se leería como "se midió y salió cero").
    const cuerpo = TARJETAS.slice(TARJETAS.indexOf("export function TarjetaProximamente"));
    expect(cuerpo).toContain("—");
  });

  it("cada hueco sin backend dice de qué FASE es (no un `próximamente` vago)", () => {
    const codigo = soloCodigo(PAGINA);
    const huecos = codigo.match(/<(TarjetaProximamente|RanuraProximamente)[\s\S]*?\/>/g) ?? [];
    expect(huecos.length).toBeGreaterThan(0);
    for (const h of huecos) expect(h).toMatch(/fase=\{\d+\}/);
  });

  it("las tarjetas de métrica del panel son las COMPARTIDAS (Resumen y reto se leen igual)", () => {
    expect(PAGINA).toContain("tarjetas");
    expect(leer(RAIZ, "src", "app", "panel", "page.tsx")).toContain('from "./tarjetas"');
  });
});

describe("moderación: reutiliza lo que ya existía", () => {
  it("Retirar llama al endpoint del panel que ya estaba (2e), no a uno nuevo", () => {
    expect(LISTA).toContain("/api/panel/participaciones/");
    expect(LISTA).toContain("/retirar");
    expect(LISTA).toContain("postJsonCsrf"); // el write va con CSRF, como el resto del panel
  });

  it("NO se ha creado un segundo endpoint de retirar en toda la API", () => {
    const rutas: string[] = [];
    const recorrer = (dir: string): void => {
      for (const entrada of readdirSync(dir)) {
        const p = join(dir, entrada);
        if (statSync(p).isDirectory()) recorrer(p);
        else if (entrada === "route.ts") rutas.push(p);
      }
    };
    recorrer(join(RAIZ, "src", "app", "api"));

    const deRetirar = rutas.filter((p) => p.includes("retirar"));
    expect(deRetirar.length).toBe(1);
    expect(deRetirar[0]).toContain(join("panel", "participaciones"));
  });

  it("la lista del panel muestra el estado en copy HUMANO, sin códigos técnicos a la vista", () => {
    // Los estados internos pueden aparecer como valores de la unión, pero nunca como texto pintado.
    expect(LISTA).toContain('texto: "Retirada"');
    expect(LISTA).toContain('texto: "Visible"');
    expect(LISTA).not.toMatch(/>\s*(REMOVED|PENDING|FAILED|PUBLISHED)\s*</);
  });
});

describe("enlace desde la lista de retos", () => {
  it("cada reto de /panel/retos enlaza a su pantalla de gestión", () => {
    expect(leer(RAIZ, "src", "app", "panel", "lista-retos.tsx")).toContain(
      "href={`/panel/retos/${r.id}`}",
    );
  });
});
