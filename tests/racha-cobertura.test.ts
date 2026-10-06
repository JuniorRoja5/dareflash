/**
 * TODA ACCIÓN QUE CUENTA MARCA EL DÍA, Y NINGUNA LO HACE DENTRO DE SU TRANSACCIÓN.
 *
 * Son los dos invariantes de la racha que no se pueden comprobar mirando un resultado, y los dos
 * se rompen en silencio:
 *
 *  1. OLVIDARSE DE MARCAR. Se añade una quinta acción que debería contar, nadie la cablea, y la
 *     racha simplemente no cuenta ese día. No falla nada: solo hay gente que pierde su racha
 *     haciendo cosas. La lista vive en `ACCIONES_RACHA` (config) y aquí se exige que cada servicio
 *     de la lista llame de verdad a `marcarDiaActivo`. Misma disciplina que `route-csrf`.
 *
 *  2. MARCARLO DENTRO DE LA TRANSACCIÓN DEL CONTENIDO. `marcarDiaActivo` escribe en `User` y puede
 *     acabar en `applyPoints`, que toma `FOR UPDATE` sobre `User`. Las acciones que lo disparan
 *     escriben contenido con filas bloqueadas. Anidarlos cierra el ciclo del veto de deadlock — y
 *     un deadlock no aparece en los tests, aparece el día que hay tráfico.
 *
 * Para romperlo: quitar la llamada de cualquiera de los cuatro servicios (rojo), moverla dentro de
 * un `$transaction` (rojo), o añadir una acción a `ACCIONES_RACHA` sin cablearla (rojo).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ACCIONES_RACHA } from "../src/config/constants";

const RAIZ = process.cwd();
const SERVICIOS = join(RAIZ, "src", "server", "services");

/** Sin comentarios: un docblock que EXPLIQUE la regla no la cumple. */
function codigo(fichero: string): string {
  return readFileSync(join(SERVICIOS, fichero), "utf8")
    .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("hay lista que comprobar", () => {
  it("las cuatro acciones del producto están declaradas", () => {
    expect(ACCIONES_RACHA.length).toBeGreaterThanOrEqual(4);
    expect(ACCIONES_RACHA.map((a) => a.servicio).sort()).toEqual([
      "comentarios.ts",
      "likes.ts",
      "video-confirmacion.ts",
      "votes.ts",
    ]);
  });
});

describe.each(ACCIONES_RACHA)("$servicio ($que)", ({ servicio }) => {
  const src = codigo(servicio);

  it("llama a `marcarDiaActivo`", () => {
    expect(src, `${servicio} no marca el día activo`).toMatch(/marcarDiaActivo\s*\(/);
  });

  it("y lo hace FUERA de cualquier transacción", () => {
    // Se recorta cada `$transaction(` hasta su cierre y se comprueba que la llamada no cae dentro.
    // Contar llaves es tosco, pero es exactamente lo que hay que saber: si está dentro o fuera.
    for (const dentro of cuerposDeTransaccion(src)) {
      expect(dentro, `${servicio} marca el día DENTRO de una transacción`).not.toMatch(
        /marcarDiaActivo\s*\(/,
      );
    }
  });
});

/** Los cuerpos de cada `$transaction(...)` del fichero, balanceando paréntesis. */
function cuerposDeTransaccion(src: string): string[] {
  const out: string[] = [];
  let desde = src.indexOf("$transaction(");
  while (desde !== -1) {
    const abre = src.indexOf("(", desde);
    let nivel = 0;
    for (let i = abre; i < src.length; i += 1) {
      if (src[i] === "(") nivel += 1;
      if (src[i] === ")") {
        nivel -= 1;
        if (nivel === 0) {
          out.push(src.slice(abre, i + 1));
          break;
        }
      }
    }
    desde = src.indexOf("$transaction(", desde + 1);
  }
  return out;
}

describe("el detector no está roto", () => {
  it("encuentra las transacciones que sabemos que existen", () => {
    // Sin este control, un `cuerposDeTransaccion` que devolviera [] dejaría el caso de arriba en
    // verde para siempre: no habría nada dentro de lo que buscar.
    for (const { servicio } of ACCIONES_RACHA) {
      if (servicio === "video-confirmacion.ts") continue; // su transacción está en otra función
      expect(cuerposDeTransaccion(codigo(servicio)).length, servicio).toBeGreaterThan(0);
    }
  });

  it("y sabría ver una llamada metida dentro", () => {
    const falso = `await db.$transaction(async (tx) => { await marcarDiaActivo(db, u); });`;
    expect(cuerposDeTransaccion(falso)[0]).toMatch(/marcarDiaActivo\s*\(/);
  });
});

describe("la racha se calcula, no se barre", () => {
  it("ningún job ni barrido escribe las columnas de racha", () => {
    // Un barrido nocturno que "rompa" rachas sería caro, frágil y redundante: la racha ya vale
    // cero sola cuando el último día queda atrás. Si alguien lo añade, que tenga que venir aquí.
    const worker = readFileSync(join(RAIZ, "src", "server", "jobs", "worker.ts"), "utf8");
    const registry = readFileSync(join(RAIZ, "src", "server", "jobs", "registry.ts"), "utf8");
    for (const [nombre, src] of [
      ["worker.ts", worker],
      ["registry.ts", registry],
    ] as const) {
      expect(src, `${nombre} toca la racha`).not.toMatch(/racha(Inicio|Ultimo)En/);
    }
  });

  it("y solo el servicio de racha escribe esas columnas", () => {
    const racha = codigo("racha.ts");
    expect(racha).toMatch(/rachaInicioEn:/);
    // Nadie más: ni el cierre de reto, ni el ledger, ni el panel.
    for (const otro of ["cierre-reto.ts", "ledger.ts", "dareup-admin.ts", "gobierno-cuentas.ts"]) {
      expect(codigo(otro), `${otro} escribe la racha`).not.toMatch(/racha(Inicio|Ultimo)En/);
    }
  });
});
