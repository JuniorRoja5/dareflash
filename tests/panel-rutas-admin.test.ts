/**
 * TODA ruta de /api/panel SE REPROTEGE A SÍ MISMA con `requireRole`.
 *
 * POR QUÉ ESTE TEST EXISTE, y por qué es de barrido y no uno por ruta. El layout de `/panel` llama a
 * `protegerPanel()`, pero un layout NO cubre endpoints: una petición directa a
 * `/api/panel/...` no pasa por él. Así que cada ruta del panel lleva su propio `requireRole("ADMIN")`.
 *
 * Eso, hasta ahora, era CONVENCIÓN: había un test por ruta, escrito a mano, y una ruta nueva entraba
 * sin que nadie lo notara. Se descubrió al añadir `resolver-empate` —una acción que escribe
 * resultados y otorga puntos—: tenía su guarda, pero ningún test la vigilaba, así que borrarla no
 * habría puesto nada rojo. Un guardarraíl que depende de que alguien se acuerde no es un guardarraíl.
 *
 * Mismo patrón que `route-csrf`: se recorre el árbol y se falla por lo que FALTA, no por lo que hay.
 *
 * LO QUE ESTE TEST NO PUEDE PROBAR, dicho para que nadie se fíe de más: lee el fichero, así que
 * comprueba que la llamada ESTÁ, no que se ejecute antes de tocar nada ni que el rol sea el correcto.
 * Eso lo cubren los tests por ruta que sí ejecutan el handler (`panel-retirar-route`, etc.). Este es
 * la red que impide que una ruta nueva se quede SIN ninguno de los dos.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

const PANEL_DIR = join(process.cwd(), "src", "app", "api", "panel");

const METODOS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

/** Todos los `route.ts` bajo /api/panel, con su ruta relativa para que el fallo diga cuál es. */
function rutasDelPanel(dir: string): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const completa = join(dir, entrada);
    if (statSync(completa).isDirectory()) salida.push(...rutasDelPanel(completa));
    else if (entrada === "route.ts") salida.push(completa);
  }
  return salida;
}

/** Solo CÓDIGO: una llamada nombrada en un comentario no protege nada. */
function soloCodigo(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function metodosExportados(src: string): string[] {
  return METODOS.filter((m) =>
    new RegExp(`export\\s+(?:const\\s+${m}\\b|(?:async\\s+)?function\\s+${m}\\b)`).test(src),
  );
}

const FICHEROS = rutasDelPanel(PANEL_DIR);

describe("las rutas de /api/panel no dependen del layout para protegerse", () => {
  it("hay rutas que revisar (si esto falla, el escáner no encuentra nada y el test es decorativo)", () => {
    expect(FICHEROS.length).toBeGreaterThan(0);
  });

  it.each(FICHEROS.map((f) => [relative(PANEL_DIR, f).split(sep).join("/"), f]))(
    "%s comprueba el rol por su cuenta",
    (_nombre, fichero) => {
      const src = soloCodigo(readFileSync(fichero as string, "utf8"));
      const metodos = metodosExportados(src);
      // Un route.ts sin handlers exportados no es una ruta: si el escáner deja de reconocer la forma
      // de exportar, esto lo dice en vez de dar el fichero por bueno en silencio.
      expect(metodos.length).toBeGreaterThan(0);

      const llamadas = src.match(/requireRole\(/g) ?? [];
      expect(llamadas.length).toBeGreaterThan(0);
      // Al menos una comprobación POR HANDLER. Un fichero con el POST protegido y un DELETE nuevo
      // suelto tiene que caer: es exactamente la forma en que se cuela una ruta sin guarda.
      expect(llamadas.length).toBeGreaterThanOrEqual(metodos.length);
    },
  );

  it("y ninguna se conforma con mirar el rol a mano", () => {
    // `user.role === "ADMIN"` es una comprobación POR CONVENCIÓN: no lanza, no corta el flujo si
    // alguien olvida el `if`, y se copia mal entre ficheros. La barrera es `requireRole`, que lanza.
    for (const fichero of FICHEROS) {
      const src = soloCodigo(readFileSync(fichero, "utf8"));
      expect(src).not.toMatch(/role\s*===\s*["']ADMIN["']/);
    }
  });
});
