/**
 * Crear — validacion del titulo PURA con dientes (Paso C · unidad 5). Con contenido -> valido; vacio
 * o solo espacios -> invalido. Romper la validacion (aceptar vacio) cae en rojo. El resto de la
 * disciplina (magenta unico, texto negro, error con voz del brief) viaja por construccion con las
 * primitivas Boton y Campo.
 */
import { describe, expect, it } from "vitest";

import { tituloEsValido } from "../src/app/(app)/(shell)/crear/crear-logic";

describe("tituloEsValido", () => {
  it("con contenido real es valido", () => {
    expect(tituloEsValido("Mi mejor salto en caja")).toBe(true);
    expect(tituloEsValido("a")).toBe(true);
  });

  it("vacio o solo espacios es invalido (los dos sentidos)", () => {
    expect(tituloEsValido("")).toBe(false);
    expect(tituloEsValido("   ")).toBe(false);
    expect(tituloEsValido("\t\n")).toBe(false);
  });
});
