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
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

import { SECCIONES_PANEL } from "../src/app/panel/secciones";

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
  it("toda tarjeta con número toma su valor de un dato del SERVIDOR, no de la vista", () => {
    const valores = soloCodigo(PAGINA).match(/valor=\{[^}]*\}/g) ?? [];
    expect(valores.length).toBeGreaterThan(0);
    // Un `valor={12}` o `valor={algo * 2}` cae aquí: los números de esta pantalla los calculan los
    // servicios (`metricasReto`, `contarDenunciasAbiertas`), nunca se escriben ni se operan en el JSX.
    // (Antes se exigía literalmente `metricas.algo`; con la Fase 5 entró una cifra de otro servicio,
    // así que lo que se afirma es la REGLA —una variable del servidor, sin aritmética—, no un prefijo.)
    for (const v of valores) expect(v).toMatch(/^valor=\{[A-Za-z_$][\w$]*(\.\w+)?\}$/);
  });

  it("la tarjeta de `próximamente` NO puede recibir un valor (imposible colar una cifra)", () => {
    // La honestidad vive en el TIPO, no en la disciplina de quien pinta.
    const props = /export function TarjetaProximamente\(\{([^}]*)\}/.exec(TARJETAS)?.[1] ?? "";
    expect(props).not.toContain("valor");
    // Y lo que pinta es una raya, no un 0 (un 0 se leería como "se midió y salió cero").
    const cuerpo = TARJETAS.slice(TARJETAS.indexOf("export function TarjetaProximamente"));
    expect(cuerpo).toContain("—");
  });

  it("cada hueco sin backend DEL PANEL dice de qué FASE es (no un `próximamente` vago)", () => {
    // Se mira TODO el panel, no solo esta pantalla: la Fase 5 rellenó los dos huecos que le quedaban
    // aquí, y exigir que siguiera habiendo alguno obligaría a conservar una maqueta para siempre.
    // Lo que se protege es la regla: un hueco sin fase es un "próximamente" que nadie sabe cuándo.
    const panel = join(RAIZ, "src", "app", "panel");
    const paginas: string[] = [];
    const recorrer = (dir: string): void => {
      for (const e of readdirSync(dir)) {
        const p = join(dir, e);
        if (statSync(p).isDirectory()) recorrer(p);
        else if (e.endsWith(".tsx")) paginas.push(p);
      }
    };
    recorrer(panel);

    let huecosTotales = 0;
    for (const p of paginas) {
      const huecos =
        soloCodigo(leer(p)).match(/<(TarjetaProximamente|RanuraProximamente)[\s\S]*?\/>/g) ?? [];
      huecosTotales += huecos.length;
      for (const h of huecos) expect(h, p).toMatch(/fase=\{\d+\}/);
    }
    // Y el panel sigue teniendo secciones declaradas como futuras (monedero, boost): la honestidad
    // sobre lo que aún no existe no ha desaparecido, solo se ha movido a donde toca.
    expect(SECCIONES_PANEL.filter((s) => s.fase !== null).length).toBeGreaterThan(0);
    expect(huecosTotales).toBeGreaterThanOrEqual(0);
  });

  it("'Interacción por participación' ya NO es un próximamente: pinta el dato del servicio", () => {
    const codigo = soloCodigo(PAGINA);
    const huecos = codigo.match(/<(TarjetaProximamente|RanuraProximamente)[\s\S]*?\/>/g) ?? [];
    expect(huecos.some((h) => h.includes("Interacción por participación"))).toBe(false);
    // Las filas salen del servicio que las calcula, sin nada escrito a mano en la vista.
    expect(codigo).toMatch(/interaccionPorParticipacion\(prisma, reto\.id\)/);
    expect(codigo).toMatch(
      /<TarjetaInteraccion filas=\{interaccion\} visibles=\{metricas\.visibles\}/,
    );
  });

  it("'Rendimiento en el tiempo' ya NO es una ranura: pinta la serie del servicio", () => {
    const codigo = soloCodigo(PAGINA);
    const huecos = codigo.match(/<(TarjetaProximamente|RanuraProximamente)[\s\S]*?\/>/g) ?? [];
    expect(huecos.some((h) => h.includes("Rendimiento en el tiempo"))).toBe(false);
    expect(codigo).toMatch(/serieDiariaReto\(prisma, reto\.id\)/);
    expect(codigo).toMatch(/<RendimientoTiempo serie=\{serie\} \/>/);
  });

  it("las métricas del reto usan la regla COMPARTIDA de visible, no una copia", () => {
    // Si el panel tuviera su propia definición de "visible", podría sumar votos de algo que el top
    // del reto y el cierre ya no cuentan.
    const servicio = soloCodigo(leer(RAIZ, "src", "server", "services", "panel-metricas.ts"));
    expect(servicio).toContain("PARTICIPACION_QUE_CUENTA");
    expect(servicio).not.toMatch(/status:\s*"PUBLISHED"/);
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

  it("NINGUNA ruta de retirar implementa la retirada: todas delegan en el mismo núcleo", () => {
    // El invariante original decía "solo puede haber UN endpoint de retirar". Con la cola de
    // moderación (Fase 5) hay dos puertas —la del reto y la de la cola—, y está bien que existan:
    // lo que NO puede haber es dos IMPLEMENTACIONES. Así que lo que se afirma ahora es más fuerte:
    // ninguna ruta escribe la retirada a mano, y la de moderación reutiliza el núcleo de la otra.
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
    expect(deRetirar.map((p) => relative(RAIZ, p).split(sep).join("/")).sort()).toEqual([
      "src/app/api/panel/moderacion/retirar/route.ts",
      "src/app/api/panel/participaciones/[id]/retirar/route.ts",
    ]);
    for (const p of deRetirar) {
      const codigo = soloCodigo(leer(p));
      // Ni el estado ni el motivo se escriben en la ruta: eso vive en el servicio.
      expect(codigo, p).not.toMatch(/"REMOVED"|retiradaMotivo/);
      expect(codigo, p).toMatch(/retirarParticipacion|retirarPorModeracion/);
    }
    // Y la retirada por moderación de un vídeo con participación NO se reescribe: usa el núcleo.
    const moderar = soloCodigo(leer(RAIZ, "src", "server", "services", "moderar.ts"));
    expect(moderar).toContain("retirarParticipacionEnTx");
    expect(moderar).toContain("retirarComentarioEnTx");
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
