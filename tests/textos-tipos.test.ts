/**
 * UNA CLAVE QUE FALTA O SOBRA NO COMPILA; UN PARÁMETRO QUE FALTA, TAMPOCO (Fase 11 · P5b1).
 *
 * Este fichero lo comprueba `tsc` (el typecheck, en el pre-commit y en CI), no vitest: cada
 * `@ts-expect-error` es un error que TIENE que dar. Si un día deja de darlo —porque alguien relaja el tipo
 * de `t` o de `Diccionario`—, la directiva sobra y es `tsc` el que falla («Unused '@ts-expect-error'»).
 * Vitest solo comprueba que lo correcto sí funciona.
 *
 * Para romperlo: tipar los parámetros de `t` como `Record<string, unknown>` (rojo: sobran las directivas),
 * o `Diccionario` como `Record<string, Record<string, string>>` (rojo, igual). Y en `tRico`: abrir el
 * catálogo (`MarcasPara` sin el `never` de lo desconocido) o quitar `conMarcasConocidas` (rojo, igual).
 */
import { describe, expect, it } from "vitest";

import { es } from "../src/textos/es";
import { conMarcasConocidas, crearT, type Diccionario } from "../src/textos/plantilla";
import { crearTRico } from "../src/textos/rico";

describe("los textos se comprueban al compilar", () => {
  it("t(): la clave existe y los parámetros son los de la plantilla", () => {
    const t = crearT(es.inicio, "es");
    expect(t("ariaDestacado", { titulo: "X" })).toBe("Reto destacado: X");
    expect(t("participantes", { n: 2 })).toBe("2 participantes");

    // @ts-expect-error — clave que no existe
    t("noExiste");
    // @ts-expect-error — falta el parámetro `titulo`
    t("ariaDestacado");
    // @ts-expect-error — un parámetro con otro nombre
    t("ariaDestacado", { nombre: "X" });
    // @ts-expect-error — un número a pelo en un parámetro de texto (se formatea antes, con la P1)
    t("ariaDestacado", { titulo: 3 });
    // @ts-expect-error — un plural sin su `n`
    t("participantes");
    // @ts-expect-error — un texto sin parámetros no admite que le pasen uno
    t("h1", { sobra: "x" });
  });

  it("un diccionario de otro idioma tiene EXACTAMENTE las claves del castellano", () => {
    // El castellano cumple su propia forma.
    const bien = es satisfies Diccionario<typeof es>;
    expect(bien).toBe(es);

    const { h1, ...inicioSinH1 } = es.inicio;
    expect(h1).toBe(es.inicio.h1);
    const sinUnaClave = { ...es, inicio: inicioSinH1 };
    // @ts-expect-error — falta una clave (`inicio.h1`)
    const _falta: Diccionario<typeof es> = sinUnaClave;

    // @ts-expect-error — sobra una clave
    const _sobra = { ...es, inicio: { ...es.inicio, sobra: "x" } } satisfies Diccionario<typeof es>;

    // @ts-expect-error — un plural escrito como un texto suelto
    const _plural = { ...es, inicio: { ...es.inicio, participantes: "x" } } satisfies Diccionario<
      typeof es
    >;

    expect([_falta, _sobra, _plural]).toHaveLength(3);
  });
});

describe("tRico: el formato va DENTRO de la frase, y solo con marcas del catálogo", () => {
  it("las marcas y los parámetros de la plantilla se piden al compilar", () => {
    const t = crearT(es.inicio, "es");
    const tr = crearTRico(es.inicio, "es");
    // Lo correcto compila (lo que pinta lo mira `render/textos-ricos`).
    tr("mayorPremio", { resaltado: { className: "x" } });
    tr("gano", { enlace: { href: "/r" } }, { reto: "R" });
    tr("pasoTitulo", { oculto: {} }, { n: 1, titulo: "T" });

    // @ts-expect-error — una clave CON formato no va por `t`: pintaría las llaves tal cual
    t("mayorPremio");
    // @ts-expect-error — y una SIN formato no va por `tRico`
    tr("h1", {});
    // @ts-expect-error — falta la marca entera
    tr("mayorPremio", {});
    // @ts-expect-error — falta lo que pide la marca (el destino del enlace)
    tr("gano", { enlace: {} }, { reto: "R" });
    // @ts-expect-error — falta el parámetro que va DENTRO de la marca (`reto`)
    tr("gano", { enlace: { href: "/r" } });
    // @ts-expect-error — un parámetro de más
    tr("gano", { enlace: { href: "/r" } }, { reto: "R", sobra: "x" });
    // @ts-expect-error — el `{n}` de dentro de una marca también es un número
    tr("pasoTitulo", { oculto: {} }, { n: "1", titulo: "T" });
  });

  it("una marca fuera del catálogo no compila, ni al pintarla ni en el diccionario", () => {
    const raro = { k: "hola {parpadeo:mundo}" } as const;
    // @ts-expect-error — `parpadeo` no está en el catálogo: no hay valor que la cumpla
    crearTRico(raro, "es")("k", { parpadeo: {} });

    // @ts-expect-error — un diccionario con una marca desconocida no compila AUNQUE nadie la pinte
    conMarcasConocidas({ __idioma: "x", e: { k: "hola {parpadeo:mundo}" } } as const);
    // @ts-expect-error — tampoco escondida en una forma de un plural
    conMarcasConocidas({ __idioma: "x", e: { k: { one: "{n}", other: "{n}{raro:x}" } } } as const);
    // El control: con una marca del catálogo, sí.
    const bien = conMarcasConocidas({ __idioma: "x", e: { k: "hola {resaltado:mundo}" } } as const);
    expect(bien.e.k).toBe("hola {resaltado:mundo}");
  });
});
