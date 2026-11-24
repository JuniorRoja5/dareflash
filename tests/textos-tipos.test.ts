/**
 * UNA CLAVE QUE FALTA O SOBRA NO COMPILA; UN PARÁMETRO QUE FALTA, TAMPOCO (Fase 11 · P5b1).
 *
 * Este fichero lo comprueba `tsc` (el typecheck, en el pre-commit y en CI), no vitest: cada
 * `@ts-expect-error` es un error que TIENE que dar. Si un día deja de darlo —porque alguien relaja el tipo
 * de `t` o de `Diccionario`—, la directiva sobra y es `tsc` el que falla («Unused '@ts-expect-error'»).
 * Vitest solo comprueba que lo correcto sí funciona.
 *
 * Para romperlo: tipar los parámetros de `t` como `Record<string, unknown>` (rojo: sobran las directivas),
 * o `Diccionario` como `Record<string, Record<string, string>>` (rojo, igual).
 */
import { describe, expect, it } from "vitest";

import { es } from "../src/textos/es";
import { crearT, type Diccionario } from "../src/textos/plantilla";

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
