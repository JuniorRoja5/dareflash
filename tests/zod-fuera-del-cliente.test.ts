/**
 * ZOD NO VIAJA AL NAVEGADOR (Fase 11 · P1b). Test ESTRUCTURAL: fija una decisión que se deshace en
 * silencio con un import.
 *
 * Por qué existe: `config/constants.ts` lo importan decenas de componentes de cliente, y tenía dentro
 * 41 `z.enum(...)`. Una llamada en ámbito de módulo no la puede quitar el empaquetador, así que zod
 * entero (~67 KB gzip, un tercio del JS de `/inicio`) iba en TODAS las páginas. Ahora:
 *
 * - `constants.ts` tiene la LISTA de cada catálogo (`VALORES_*`), sin zod.
 * - `config/esquemas.ts` construye cada `z.enum` CON esa lista importada (nunca reescrita), y solo lo
 *   importa el servidor.
 * - el cliente pregunta con `esUnoDe` (`lib/valores`), que dice exactamente lo mismo que el esquema.
 *
 * Lo que vigila: (1) ningún `"use client"` llega a zod por ninguna cadena, y el fallo NOMBRA la
 * cadena; (2) no hay copias: un catálogo se escribe una vez, en `constants.ts`; (3) `esUnoDe` y el
 * `z.enum` del servidor aceptan y rechazan lo mismo, catálogo por catálogo.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import * as constantes from "../src/config/constants";
import * as esquemas from "../src/config/esquemas";
import { esUnoDe, unoDe } from "../src/lib/valores";

import {
  RAIZ,
  cadenaHasta,
  esCliente,
  ficherosDeSrc,
  rel,
  sinComentarios,
} from "./helpers/grafo-imports";

const esZod = (espec: string) => espec === "zod" || espec.startsWith("zod/");
const leer = (r: string) => readFileSync(path.join(RAIZ, r), "utf8");
const todos = ficherosDeSrc();
const clientes = todos.filter((f) => esCliente(readFileSync(f, "utf8")));

describe("ningún componente de cliente arrastra zod", () => {
  it("se encuentran los componentes de cliente (un censo vacío daría verde sin mirar nada)", () => {
    expect(clientes.length).toBeGreaterThan(80);
    expect(clientes.map(rel)).toContain("src/components/ui/boton-voto.tsx");
  });

  it("el detector muerde: SÍ ve zod detrás de los módulos que lo llevan", () => {
    // Controles positivos: si el recorrido dejara de resolver `@/…` o de leer los imports, esto se
    // pondría rojo antes de que el test de abajo pasara a verde sin mirar.
    const desde = (r: string) => cadenaHasta(path.join(RAIZ, r), esZod);
    expect(desde("src/config/esquemas.ts")).toEqual(["src/config/esquemas.ts", "zod"]);
    expect(desde("src/lib/notificaciones.ts")).toEqual(["src/lib/notificaciones.ts", "zod"]);
    // Y a través de un salto: un servicio que no importa zod, solo un esquema.
    const cadena = desde("src/server/services/boost-compra.ts");
    expect(cadena?.length).toBe(3);
    expect(cadena?.at(-1)).toBe("zod");
  });

  it("ninguna cadena de imports por valor lleva de un `use client` a zod", () => {
    const cadenas = clientes
      .map((c) => cadenaHasta(c, esZod))
      .filter((c): c is string[] => c !== null)
      .map((c) => c.join(" -> "));
    expect(
      cadenas,
      `Estos componentes de cliente meten zod en el JS del navegador. Si es un catálogo, importa su ` +
        `lista VALORES_* de config/constants y pregunta con esUnoDe (lib/valores); el esquema se ` +
        `queda en config/esquemas, para el servidor:\n${cadenas.join("\n")}`,
    ).toEqual([]);
  });

  it("constants.ts no importa zod (lo importan los clientes: cualquier esquema ahí vuelve a pesar en todas las páginas)", () => {
    const t = sinComentarios(leer("src/config/constants.ts"));
    expect(t).not.toMatch(/from\s+["']zod["']/);
    expect(t).not.toMatch(/export const \w+Schema\b/);
  });
});

describe("un catálogo se escribe UNA vez, en constants.ts", () => {
  const fuente = sinComentarios(leer("src/config/esquemas.ts"));
  const llamadas = [...fuente.matchAll(/export const (\w+)Schema = z\.enum\(([^)]*)\);/g)];

  it("esquemas.ts construye cada z.enum con su lista importada, nunca con los valores reescritos", () => {
    expect(llamadas.length).toBe(41);
    const malos = llamadas.filter(([, , arg]) => !/^VALORES_[A-Z0-9_]+$/.test(arg!.trim()));
    expect(malos.map(([l]) => l)).toEqual([]);
    // Ni una cadena en todo el módulo, salvo la de "zod" y la de "./constants": un valor escrito
    // aquí es una copia que se desincroniza en silencio el día que el catálogo cambie.
    const cadenas = [...fuente.matchAll(/["'`]([^"'`\n]*)["'`]/g)].map((m) => m[1]);
    expect(cadenas.sort()).toEqual(["./constants", "zod"]);
    // Todas las demás exportaciones son z.enum de una lista: no hay otro tipo de esquema escondido.
    expect([...fuente.matchAll(/export const/g)].length).toBe(llamadas.length);
  });

  it("cada esquema acepta EXACTAMENTE su lista (mismo nombre, mismos valores, mismo orden)", () => {
    const snake = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase();
    const tabla = constantes as unknown as Record<string, readonly string[]>;
    const tablaEsquemas = esquemas as unknown as Record<string, { options: readonly string[] }>;
    for (const [, nombre] of llamadas) {
      const lista = tabla[`VALORES_${snake(nombre!)}`];
      expect(lista, `falta VALORES_${snake(nombre!)} en constants`).toBeDefined();
      expect([...tablaEsquemas[`${nombre}Schema`]!.options]).toEqual([...lista!]);
    }
  });

  it("ninguna lista VALORES_* se declara fuera de constants.ts (una copia en un componente no es separar)", () => {
    const copias = todos
      .filter((f) => rel(f) !== "src/config/constants.ts")
      .flatMap((f) =>
        [
          ...sinComentarios(readFileSync(f, "utf8")).matchAll(
            /\b(?:const|let|var)\s+(VALORES_\w+)/g,
          ),
        ].map((m) => `${rel(f)}: ${m[1]}`),
      );
    expect(copias).toEqual([]);
  });
});

describe("esUnoDe dice lo mismo que el z.enum del servidor", () => {
  const raros: unknown[] = [
    undefined,
    null,
    0,
    1,
    true,
    {},
    [],
    "",
    " ",
    "otro",
    Symbol("x"),
    () => "BANK",
    { toString: () => "BANK" },
  ];

  it("en los 41 catálogos, con cada valor, sus variantes y entradas que no son texto", () => {
    const tablaEsquemas = esquemas as unknown as Record<
      string,
      { options: readonly string[]; safeParse: (v: unknown) => { success: boolean } }
    >;
    let casos = 0;
    for (const [nombre, esquema] of Object.entries(tablaEsquemas)) {
      const lista = esquema.options;
      const variantes = lista.flatMap((v) => [
        v,
        v.toLowerCase(),
        ` ${v}`,
        `${v} `,
        `${v}X`,
        v.slice(0, -1),
        [v],
      ]);
      for (const v of [...variantes, ...raros]) {
        expect(esUnoDe(lista, v), `${nombre} con ${String(v)}`).toBe(esquema.safeParse(v).success);
        casos++;
      }
    }
    expect(casos).toBeGreaterThan(41 * 13);
  });

  it("unoDe devuelve el valor del catálogo y lanza con uno de fuera, como el .parse del esquema", () => {
    expect(unoDe(constantes.VALORES_TIPO_NEGOCIO, "ONLINE")).toBe("ONLINE");
    expect(() => unoDe(constantes.VALORES_TIPO_NEGOCIO, "online")).toThrow();
    expect(() => esquemas.TipoNegocioSchema.parse("online")).toThrow();
  });
});
