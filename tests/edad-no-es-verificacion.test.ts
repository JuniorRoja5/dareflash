/**
 * LA EDAD DECLARADA NO ES VERIFICACIÓN, Y NO AUTORIZA A COBRAR.
 *
 * Es el invariante que el encargo pedía que no se rompiera, y es de los que se rompen SOLOS: dentro
 * de unos meses, construyendo la Fase 7, alguien va a necesitar "comprobar que el usuario es mayor
 * antes de pagarle" y va a tener `birthDate` a mano. Funcionará. Y será falso: nadie ha visto un
 * documento, así que esa columna no prueba la edad de nadie — la prueba la hace Stripe Connect al
 * reclamar, con identidad real.
 *
 * TRES COSAS SE VIGILAN, y las tres se pueden deshacer en silencio:
 *   1. UNA SOLA CONSTANTE de edad. Dos umbrales para la misma puerta = mover uno y olvidar el otro.
 *   2. EL NÚMERO NO SE ESCRIBE A MANO en la ruta, el formulario ni el copy.
 *   3. NI LA COLUMNA NI LA CONSTANTE aparecen en el camino del DINERO, y ningún copy de la zona
 *      dice "verificada".
 *
 * Para romperlo: resucitar `MIN_AGE_YEARS` (rojo); escribir `>= 18` en la ruta (rojo); leer
 * `birthDate` desde `ledger.ts` (rojo); escribir "edad verificada" en el registro (rojo).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import * as CONSTANTES from "../src/config/constants";
import { EDAD_MIN_USO } from "../src/config/constants";

const RAIZ = process.cwd();
const leer = (...p: string[]) => readFileSync(join(RAIZ, ...p), "utf8");
const soloCodigo = (f: string) =>
  f.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "").replace(/^\s*\/\/.*$/gm, "");
const codigo = (...p: string[]) => soloCodigo(leer(...p));

const RUTA_REGISTRO = ["src", "app", "api", "auth", "register", "route.ts"];
const FORMULARIO = ["src", "app", "entrar", "formulario-registro.tsx"];

describe("una sola constante de edad", () => {
  it("vale 18 y SOLO hay un umbral de edad en la config", () => {
    expect(EDAD_MIN_USO).toBe(18);
    // Un umbral de edad es un NÚMERO de años. El filtro lo exige así, y por eso deja fuera dos
    // cosas que no lo son: `MSG_EDAD_MINIMA` (un texto) y `SONDEO_MAX_EDAD_MS` (una duración en
    // milisegundos, la antigüedad de un sondeo). Un `/EDAD/` a secas los contaba a los tres.
    const umbrales = Object.entries(CONSTANTES).filter(
      ([k, v]) =>
        /(^|_)(EDAD|AGE|MAYORIA)(_|$)/.test(k) &&
        !k.endsWith("_MS") &&
        typeof v === "number" &&
        Number.isInteger(v) &&
        v > 0 &&
        v < 150,
    );
    expect(umbrales.map(([k]) => k).sort()).toEqual(["EDAD_MIN_USO"]);
  });

  it("y no quedó ningún uso de la constante vieja en el CÓDIGO", () => {
    // Sin quitar comentarios, el propio docblock de `EDAD_MIN_USO` —que explica a quién sustituye—
    // hacía fallar esto. Lo que no puede quedar es un USO, no la memoria de que existió.
    const sospechosos: string[] = [];
    const recorrer = (dir: string) => {
      for (const e of readdirSync(dir)) {
        const p = join(dir, e);
        if (statSync(p).isDirectory()) {
          if (e === "generated" || e === "node_modules") continue;
          recorrer(p);
        } else if (
          /\.tsx?$/.test(p) &&
          /\bMIN_AGE_YEARS\b/.test(soloCodigo(readFileSync(p, "utf8")))
        ) {
          sospechosos.push(p.slice(RAIZ.length + 1));
        }
      }
    };
    recorrer(join(RAIZ, "src"));
    expect(sospechosos).toEqual([]);
  });
});

describe("el número no se escribe a mano", () => {
  it("la ruta de registro no lleva el umbral dentro: lo pide a la config", () => {
    const ruta = codigo(...RUTA_REGISTRO);
    expect(ruta, "no usa la puerta compartida").toContain("declaraEdadMinima");
    // Ni el número, ni una comparación de años hecha a mano.
    expect(ruta).not.toMatch(/\b18\b/);
    expect(ruta, "vuelve a calcular la edad por su cuenta").not.toMatch(/getUTCFullYear/);
  });

  it("el formulario tampoco: el copy habla de 'mayor de edad', no de un número", () => {
    const form = codigo(...FORMULARIO);
    expect(form).toMatch(/mayor de edad/i);
    expect(form, "un número suelto en el copy se queda desfasado").not.toMatch(/\b1[0-9]\s*años/);
  });

  it("y el mensaje de la config tampoco lo lleva", () => {
    expect(CONSTANTES.MSG_EDAD_MINIMA).not.toMatch(/\d/);
    expect(CONSTANTES.MSG_EDAD_MINIMA).toMatch(/mayor de edad/i);
  });
});

describe("declarada, nunca 'verificada'", () => {
  it("ni la ruta ni el formulario dicen que la edad esté verificada", () => {
    for (const f of [RUTA_REGISTRO, FORMULARIO]) {
      // SIN COMENTARIOS: el docblock del formulario dice "LA EDAD ES DECLARADA, NO VERIFICADA" —
      // o sea, explica la regla— y el guard lo leía como una infracción. Lo que se juzga es lo que
      // llega al usuario, no lo que se le cuenta al siguiente que lea el fichero.
      const src = soloCodigo(leer(...f));
      // "verificar tu cuenta" (el correo) SÍ vale; lo que no puede existir es la edad verificada.
      const frases = src.match(/[^.\n]*verific[^.\n]*/gi) ?? [];
      for (const frase of frases) {
        expect(
          /edad|nacimiento|mayor|birthDate/i.test(frase),
          `${f.join("/")}: «${frase.trim()}»`,
        ).toBe(false);
      }
    }
  });

  it("y el esquema llama a la columna DECLARADA, con su aviso", () => {
    const schema = leer("prisma", "schema.prisma");
    const i = schema.indexOf("birthDate DateTime?");
    expect(i).toBeGreaterThan(-1);
    const docblock = schema.slice(Math.max(0, i - 1400), i);
    expect(docblock, "la columna no avisa de que es declarada").toMatch(/DECLARADA/);
    expect(docblock, "la columna no avisa de que no autoriza a cobrar").toMatch(/cobrar/i);
  });
});

describe("no toca el camino del dinero", () => {
  const LEDGER = codigo("src", "server", "services", "ledger.ts");

  it("el ledger no sabe nada de la edad ni del consentimiento", () => {
    for (const prohibido of [
      "birthDate",
      "EDAD_MIN_USO",
      "declaraEdadMinima",
      "terminosAceptadosEn",
    ]) {
      expect(LEDGER, `el ledger lee ${prohibido}`).not.toContain(prohibido);
    }
  });

  it("y el ledger SÍ existe y mueve dinero: el detector no está mirando un fichero vacío", () => {
    // Sin este control, renombrar `ledger.ts` dejaría la comprobación de arriba en verde eterno.
    expect(LEDGER).toContain("applyWallet");
  });
});

describe("PII: la fecha y el consentimiento no salen en público", () => {
  /** Todo lo que se sirve a un visitante: perfil público, feed, búsqueda, comentarios, ranking. */
  const PUBLICOS = [
    ["src", "server", "services", "perfil.ts"],
    ["src", "server", "services", "feed.ts"],
    ["src", "server", "services", "buscar.ts"],
    ["src", "server", "services", "comentarios.ts"],
    ["src", "server", "services", "ranking.ts"],
    ["src", "server", "services", "referidos.ts"],
  ];

  it.each(PUBLICOS.map((p) => p.join("/")))("%s no pide la fecha ni el consentimiento", (rel) => {
    const src = codigo(...rel.split("/"));
    expect(src, "pide birthDate").not.toMatch(/birthDate/);
    expect(src, "pide terminosAceptadosEn").not.toMatch(/terminosAceptadosEn/);
  });

  it("el select público sigue siendo la lista corta de siempre", () => {
    // Se busca la DECLARACIÓN, no la primera mención: el docblock de arriba nombra `birthDate` al
    // explicar que nunca se pide, y cortar desde ahí metía el comentario dentro del "bloque".
    const perfil = soloCodigo(leer("src", "server", "services", "perfil.ts"));
    const i = perfil.indexOf("export const SELECT_USUARIO_PUBLICO");
    expect(i, "ya no existe SELECT_USUARIO_PUBLICO").toBeGreaterThan(-1);
    const bloque = perfil.slice(i, perfil.indexOf("}", i));
    for (const prohibido of ["birthDate", "terminosAceptadosEn", "email", "passwordHash"]) {
      expect(bloque, `el select público expone ${prohibido}`).not.toContain(prohibido);
    }
  });
});
