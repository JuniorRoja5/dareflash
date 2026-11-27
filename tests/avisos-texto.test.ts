/**
 * LA FRASE DE UN AVISO SALE DEL DICCIONARIO, Y LA COMPONE UNA SOLA FUNCIÓN QUE NO LEE LA PETICIÓN
 * (Fase 11 · P5b4).
 *
 * Lo que dice cada aviso en castellano, letra a letra, lo congela `tests/avisos-congelados`. Aquí:
 *  1. `componerAviso` no llega, por ninguna cadena de imports, a la petición (`formato-peticion`,
 *     `next/headers`, las cabeceras de idioma, las cookies): el idioma se le PASA. Así la llamarán
 *     igual la página, la API de la campana y, en la P4, el worker para el título de un push.
 *  2. Ni `lib/notificaciones` ni `server/avisos-texto` escriben una frase a mano (censo por AST).
 *  3. Cada clave de `es.avisos` se usa, y cada `tipo` del esquema tiene su frase (un `tipo` nuevo sin
 *     su `case` no compila: `datosDeAviso` dejaría de devolver siempre un `DatosAviso`).
 *  4. Una fila que no se sabe pintar (un `tipo` de otra versión, `datos` incompletos) sale con la frase
 *     genérica, y el log dice el `tipo` y nada más.
 *  5. El borrador en inglés (`textos/borradores`) no lo importa nadie en `src`: no se publica.
 *
 * Para romperlo: importar `formato-peticion` o `next/headers` desde `server/avisos-texto` (rojo 1);
 * escribir una frase en `datosDeAviso` (rojo 2); quitar una clave de `es.avisos` (no compila) o dejar
 * una sin usar (rojo 3); devolver `null` para una fila inválida, o anotar sus `datos` (rojo 4);
 * importar el borrador desde `textos/diccionarios` (rojo 5).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TipoNotificacionSchema } from "@/config/esquemas";

import { AvisoSchema, avisoGanasteReto, avisoVideoFallido } from "../src/lib/notificaciones";
import { componerAviso } from "../src/server/avisos-texto";
import { es } from "../src/textos/es";

import {
  especificadores,
  ficherosDeSrc,
  RAIZ,
  rel,
  resolver,
  sinComentarios,
} from "./helpers/grafo-imports";
import { esFrase } from "./helpers/mensajes-api";

const COMPOSICION = path.join(RAIZ, "src/server/avisos-texto.ts");
const DATOS = path.join(RAIZ, "src/lib/notificaciones.ts");
const RETO = { titulo: "Salto de comba 60 s", codigo: "ab12cd34", slug: "salto-de-comba-60-s" };

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------------------------------

/** Paquetes y ficheros que leen la petición. Llegar a uno = la composición ya no es pura. */
const PAQUETES_DE_PETICION = new Set(["next/headers", "next/server"]);
const FICHEROS_DE_PETICION = new Set([
  "src/server/formato-peticion.ts",
  "src/textos/servidor.ts",
  "src/server/http/textos-api.ts",
  "src/server/zona-peticion.ts",
]);
const LEE_PETICION =
  /\b(headers|cookies)\s*\(|CABECERA_IDIOMA|CABECERA_RUTA|["']x-df-(idioma|ruta)["']/;

/** La cadena de imports más corta desde `origen` hasta algo que lea la petición, o `null`. */
function cadenaHastaPeticion(origen: string): string[] | null {
  const visto = new Set([origen]);
  const cola: string[][] = [[rel(origen)]];
  const ficheros = new Map([[rel(origen), origen]]);
  while (cola.length > 0) {
    const cadena = cola.shift()!;
    const f = ficheros.get(cadena.at(-1)!)!;
    if (FICHEROS_DE_PETICION.has(rel(f))) return cadena;
    const texto = readFileSync(f, "utf8");
    if (rel(f) !== "src/lib/idioma-ruta.ts" && LEE_PETICION.test(sinComentarios(texto))) {
      return cadena;
    }
    for (const espec of especificadores(texto)) {
      if (PAQUETES_DE_PETICION.has(espec)) return [...cadena, espec];
      const r = resolver(f, espec);
      if (r && !visto.has(r)) {
        visto.add(r);
        ficheros.set(rel(r), r);
        cola.push([...cadena, rel(r)]);
      }
    }
  }
  return null;
}

describe("la composición no lee el idioma: se le pasa", () => {
  it("`componerAviso` no llega a la petición por ninguna cadena de imports", () => {
    expect(cadenaHastaPeticion(COMPOSICION)?.join(" → ") ?? null).toBeNull();
  });

  it("el detector SÍ ve una (control): `textos/servidor` llega a la petición", () => {
    expect(cadenaHastaPeticion(path.join(RAIZ, "src/textos/servidor.ts"))).not.toBeNull();
    expect(
      cadenaHastaPeticion(path.join(RAIZ, "src/server/formato-peticion.ts"))?.at(-1),
    ).toBeDefined();
  });

  it("y la firma lo exige: el idioma es un parámetro obligatorio", () => {
    const src = sinComentarios(readFileSync(COMPOSICION, "utf8"));
    expect(src).toMatch(/export function componerAviso\([^)]*idioma: IdiomaDeTextos,/);
  });

  it("los dos que la llaman le dan SU idioma (página y campana), y el panel, castellano", () => {
    const leer = (f: string) => sinComentarios(readFileSync(path.join(RAIZ, f), "utf8"));
    expect(leer("src/app/(app)/(shell)/notificaciones/page.tsx")).toMatch(
      /idioma: await idiomaDeTextosDeLaPeticion\(\)/,
    );
    expect(leer("src/app/api/notificaciones/route.ts")).toMatch(
      /idioma: await idiomaDeLaApi\(req\)/,
    );
    expect(leer("src/server/services/notificaciones.ts")).toMatch(
      /componerAviso\(f, opts\.idioma \?\? "es"/,
    );
    expect(leer("src/server/services/anuncios.ts")).toMatch(/componerAviso\(f, "es"/);
  });
});

// ---------------------------------------------------------------------------------------------------

/** Las cadenas con forma de frase de un fichero, fuera de los `console.*`. */
function frasesAMano(f: string): string[] {
  const fuente = readFileSync(f, "utf8");
  const sf = ts.createSourceFile(f, fuente, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const fuera: string[] = [];
  const visitar = (n: ts.Node): void => {
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      n.expression.expression.getText(sf) === "console"
    ) {
      return;
    }
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
      if (esFrase(n.text)) fuera.push(n.text);
    } else if (ts.isTemplateExpression(n)) {
      const t = n
        .getText(sf)
        .slice(1, -1)
        .replace(/\$\{[^}]*\}/g, "{…}");
      if (esFrase(t)) fuera.push(t);
    }
    ts.forEachChild(n, visitar);
  };
  visitar(sf);
  return fuera;
}

describe("ninguna frase a mano en la composición", () => {
  it.each([rel(DATOS), rel(COMPOSICION)])("%s", (f) => {
    expect(frasesAMano(path.join(RAIZ, f))).toEqual([]);
  });

  it("el censo SÍ ve una (control): la tabla de antes tenía frases", () => {
    // Los avisos de main 93bb4e6, escritos tal cual en `lib/notificaciones`.
    const antes = `const a = { es: "Tu vídeo ya está publicado y se puede ver." };`;
    const sf = ts.createSourceFile("x.ts", antes, ts.ScriptTarget.Latest, true);
    const textos: string[] = [];
    const v = (n: ts.Node): void => {
      if (ts.isStringLiteral(n) && esFrase(n.text)) textos.push(n.text);
      ts.forEachChild(n, v);
    };
    v(sf);
    expect(textos).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------------------------------

describe("el catálogo de avisos y el diccionario van juntos", () => {
  it("cada clave de `es.avisos` la usa alguien (ninguna muerta)", () => {
    const datos = sinComentarios(readFileSync(DATOS, "utf8"));
    const composicion = sinComentarios(readFileSync(COMPOSICION, "utf8"));
    const sinUso = Object.keys(es.avisos).filter(
      (k) => !datos.includes(`"${k}"`) && !composicion.includes(`"${k}"`),
    );
    expect(sinUso).toEqual([]);
  });

  it("cada `tipo` del esquema tiene un `case` en `datosDeAviso`", () => {
    const datos = sinComentarios(readFileSync(DATOS, "utf8"));
    const cuerpo = datos.slice(datos.indexOf("export function datosDeAviso("));
    const tipos = AvisoSchema.options.map((o) => o.shape.tipo.value);
    expect([...tipos].sort()).toEqual([...TipoNotificacionSchema.options].sort());
    expect(tipos.filter((t) => !cuerpo.includes(`case "${t}":`))).toEqual([]);
  });

  it("los dos fallos que dice la pantalla de subida usan SU clave: no pueden decir otra cosa", () => {
    expect(componerAviso(avisoVideoFallido("v", "TOO_LONG"), "es")?.texto).toBe(
      es.subida["estado_demasiado-largo"],
    );
    expect(componerAviso(avisoVideoFallido("v", "TRANSCODE_ERROR"), "es")?.texto).toBe(
      es.subida["estado_fallo-codificacion"],
    );
  });

  it("los puntos van por el formato (P1) y con su plural", () => {
    const con = (puntos: number) =>
      componerAviso(avisoGanasteReto({ challengeId: "c", reto: RETO, puntos }), "es")?.texto;
    expect(con(1)).toBe("Has ganado «Salto de comba 60 s». Sumas 1 punto.");
    expect(con(150)).toBe("Has ganado «Salto de comba 60 s». Sumas 150 puntos.");
    expect(con(12000)).toBe("Has ganado «Salto de comba 60 s». Sumas 12.000 puntos.");
  });

  it("el idioma que se le pasa es el que manda: en `xx` cambia, y el dato viaja igual", () => {
    const a = avisoGanasteReto({ challengeId: "c", reto: RETO, puntos: 150 });
    const xx = componerAviso(a, "xx")!;
    expect(xx.texto).not.toBe(componerAviso(a, "es")!.texto);
    expect(xx.texto).toContain(RETO.titulo);
    expect(xx.texto).toContain("150");
    expect(xx.href).toBe(componerAviso(a, "es")!.href);
  });
});

// ---------------------------------------------------------------------------------------------------

describe("un aviso que no se sabe pintar no rompe la campana", () => {
  const RAROS = {
    "un tipo de otra versión": {
      tipo: "TIPO_DEL_FUTURO",
      refType: "USER",
      refId: "ana:2026-11-27",
      datos: { autor: "ana", correo: "ana@ejemplo.invalid" },
    },
    "datos incompletos (sin el reto)": {
      tipo: "GANASTE_RETO",
      refType: "CHALLENGE",
      refId: "r-secreto-1",
      datos: { puntos: 40 },
    },
    "datos que no son un objeto": {
      tipo: "VOTO_RECIBIDO",
      refType: "VOTO",
      refId: "u1:s1",
      datos: null,
    },
    "un tipo que no es ni texto": {
      tipo: "ana@ejemplo.invalid",
      refType: "?",
      refId: "x",
      datos: {},
    },
  };

  it.each(Object.entries(RAROS))("%s: la frase genérica, al buzón", (_caso, fila) => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    const t = componerAviso(fila, "es");
    expect(t).toEqual({ texto: es.avisos.generico, href: "/notificaciones", valido: false });
    expect(aviso).toHaveBeenCalledTimes(1);
    // El log dice el TIPO (saneado) y nada más: ni el refId, ni los datos de la fila.
    const linea = String(aviso.mock.calls[0]![0]);
    expect(linea).toMatch(/^\[avisos\] .* tipo=[A-Z_?]+$/);
    for (const dato of [fila.refId, "ana", "ejemplo", "r-secreto"]) {
      expect(linea).not.toContain(dato);
    }
  });

  it("y en otro idioma, la genérica de ese idioma", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const t = componerAviso(RAROS["un tipo de otra versión"], "xx")!;
    expect(t.texto).not.toBe(es.avisos.generico);
    expect(t.valido).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------------

describe("el borrador en inglés no se publica", () => {
  it("ningún fichero de `src` importa `textos/borradores`", () => {
    const BORRADORES = path.join(RAIZ, "src/textos/borradores");
    const quien = ficherosDeSrc().filter((f) =>
      especificadores(readFileSync(f, "utf8")).some((e) =>
        (resolver(f, e) ?? "").startsWith(BORRADORES),
      ),
    );
    expect(quien.map(rel)).toEqual([]);
  });

  it("y el borrador existe (si no, esto no mira nada)", async () => {
    const b = await import("../src/textos/borradores/avisos-en");
    expect(Object.keys(b.AVISOS_EN_BORRADOR).sort()).toEqual(Object.keys(es.avisos).sort());
  });
});
