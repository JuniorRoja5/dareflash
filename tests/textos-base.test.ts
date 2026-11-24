/**
 * LA BASE DE TRADUCCIÓN (Fase 11 · P5b1): `t()`, los plurales, el pseudo-idioma y lo que tiene que
 * decir lo mismo que su catálogo.
 *
 *  - `t` rellena los `{parámetros}`, pone `{marca}` desde `MARCA`, formatea `{n}` con el formateador de
 *    la P1 y elige el plural con `formaDePlural` del idioma.
 *  - El pseudo-idioma `xx` sale de TODO el castellano: misma forma, cada texto entre corchetes, un 30 %
 *    más largo y con sus `{parámetros}` intactos (si no, `t` no podría rellenarlos).
 *  - Los nombres que viven en dos sitios porque el panel no se traduce (categorías y motivos de
 *    denuncia) dicen lo mismo en castellano en los dos.
 *
 * Para romperlo: no formatear `{n}` (rojo «1,234»), elegir el plural sin el idioma (rojo), tocar los
 * `{…}` en el pseudo-idioma (rojo), o cambiar el nombre de una categoría en un sitio y no en el otro.
 */
import { describe, expect, it } from "vitest";

import { CATEGORIES, MOTIVOS_DENUNCIA } from "../src/config/constants";
import { MARCA } from "../src/config/marca";
import { formatearNumero } from "../src/lib/formato";
import { es } from "../src/textos/es";
import { crearT, type Espacio, type Texto } from "../src/textos/plantilla";
import { pseudoDiccionario, pseudoTexto } from "../src/textos/pseudo";

const espacios = Object.entries(es).filter(([k]) => k !== "__idioma") as [string, Espacio][];

describe("t()", () => {
  it("rellena los parámetros, pone la marca y formatea {n} con el formateador de la P1", () => {
    const t = crearT(
      {
        a: "Hola, {nombre}",
        m: "Estás en {marca}",
        c: "{n} cosas",
        p: { one: "{n} vídeo", other: "{n} vídeos" },
      } as const,
      "es",
    );
    expect(t("a", { nombre: "Ana" })).toBe("Hola, Ana");
    expect(t("m")).toBe(`Estás en ${MARCA}`);
    expect(t("c", { n: 12345 })).toBe(`${formatearNumero(12345, "es")} cosas`);
    expect(t("p", { n: 1 })).toBe("1 vídeo");
    expect(t("p", { n: 0 })).toBe("0 vídeos");
    expect(t("p", { n: 2 })).toBe("2 vídeos");
  });

  it("el plural lo decide el IDIOMA (en inglés, 1 es «one»; 1,5 no)", () => {
    const t = crearT({ p: { one: "uno", other: "varios" } } as const, "en");
    expect(t("p", { n: 1 })).toBe("uno");
    expect(t("p", { n: 1.5 })).toBe("varios");
  });
});

describe("el pseudo-idioma xx", () => {
  const xx = pseudoDiccionario(es);

  it("tiene EXACTAMENTE las claves del castellano, y su marca de idioma", () => {
    expect(xx.__idioma).toBe("xx");
    for (const [nombre, espacio] of espacios) {
      expect(Object.keys((xx as unknown as Record<string, Espacio>)[nombre]!), nombre).toEqual(
        Object.keys(espacio),
      );
    }
  });

  it("cada texto, entre corchetes, más largo y con sus {parámetros} intactos", () => {
    const comprueba = (original: string, pseudo: string, donde: string) => {
      expect(pseudo, donde).toMatch(/^\[[\s\S]* ·+\]$/);
      // El 30 % es de la parte que SE LEE: un `{parámetro}` se sustituye, así que no cuenta.
      const visible = (s: string) => s.replace(/\{\w+\}/g, "").length;
      expect(visible(pseudo), donde).toBeGreaterThanOrEqual(Math.ceil(visible(original) * 1.3));
      expect(pseudo.match(/\{\w+\}/g) ?? [], donde).toEqual(original.match(/\{\w+\}/g) ?? []);
    };
    for (const [nombre, espacio] of espacios) {
      for (const [clave, texto] of Object.entries(espacio)) {
        const p = (xx as unknown as Record<string, Record<string, Texto>>)[nombre]![clave]!;
        if (typeof texto === "string") comprueba(texto, p as string, `${nombre}.${clave}`);
        else {
          comprueba(texto.one, (p as { one: string }).one, `${nombre}.${clave}.one`);
          comprueba(texto.other, (p as { other: string }).other, `${nombre}.${clave}.other`);
        }
      }
    }
    expect(pseudoTexto("Hola, {nombre}")).toContain("{nombre}");
  });
});

describe("lo que vive en dos sitios dice lo mismo en castellano", () => {
  it("las categorías: los textos y el catálogo del panel", () => {
    for (const c of CATEGORIES) {
      expect(es.categorias[`cat_${c.key}` as keyof typeof es.categorias], c.key).toBe(c.es);
    }
    expect(Object.keys(es.categorias)).toHaveLength(CATEGORIES.length);
  });

  it("los motivos de denuncia: los textos y el catálogo", () => {
    for (const m of MOTIVOS_DENUNCIA) {
      expect(es.denunciar[`motivo_${m.clave}` as keyof typeof es.denunciar], m.clave).toBe(m.texto);
    }
  });
});
