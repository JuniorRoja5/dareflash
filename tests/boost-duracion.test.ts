/**
 * LA DURACIÓN DE UN BOOST SE DICE DERIVADA DEL NÚMERO.
 *
 * `BOOST_DURACION_MIN` son 60 minutos y la pantalla tiene que decir "1 hora", porque nadie escribe
 * "60 minutos". El riesgo es evidente: escribir "1 hora" a mano y que el día que la duración pase a
 * 90 la pantalla siga prometiendo una hora. Por eso la frase es una función de los minutos, y aquí
 * se fija lo que esa función tiene que hacer — incluidos valores que HOY no existen, que son los que
 * la protegen el día que alguien cambie la constante.
 */
import { describe, expect, it } from "vitest";

import { BOOST_DURACION_MIN } from "../src/config/constants";
import { duracionBoostHumana, PALABRAS_PANEL } from "../src/lib/boost-duracion";
import { palabrasDuracion } from "../src/textos/duracion";
import { es } from "../src/textos/es";
import { crearT } from "../src/textos/plantilla";

/**
 * Las palabras salen del DICCIONARIO desde la P5b2a (`duracion`, con plurales): lo que se fija aquí es
 * la frase que ve la persona, con la `t` de verdad. El panel, que no se traduce, lleva su castellano
 * aparte (`PALABRAS_PANEL`): el último caso exige que los dos digan exactamente lo mismo.
 */
const PALABRAS = palabrasDuracion(crearT(es.duracion, "es"), "es");
const duracion = (min: number) => duracionBoostHumana(min, PALABRAS);

describe("el valor de hoy", () => {
  it("son 60 minutos, y eso se dice «1 hora»", () => {
    // Clavado: si alguien mueve la duración, que tenga que venir aquí y decidirlo.
    expect(BOOST_DURACION_MIN).toBe(60);
    expect(duracion(BOOST_DURACION_MIN)).toBe("1 hora");
  });
});

describe("la unidad más grande que salga EXACTA", () => {
  it.each([
    [60, "1 hora"],
    [120, "2 horas"],
    [180, "3 horas"],
  ])("%i min -> %s", (min, esperado) => {
    expect(duracion(min)).toBe(esperado);
  });

  it.each([
    [1, "1 minuto"],
    [30, "30 minutos"],
    [45, "45 minutos"],
    [59, "59 minutos"],
  ])("%i min -> %s", (min, esperado) => {
    expect(duracion(min)).toBe(esperado);
  });

  it.each([
    [90, "1 h 30 min"],
    [61, "1 h 1 min"],
    [150, "2 h 30 min"],
  ])("%i min, que no es exacto en horas -> %s", (min, esperado) => {
    expect(duracion(min)).toBe(esperado);
  });
});

describe("la concordancia es de verdad", () => {
  it("singular con uno, plural con el resto", () => {
    // "1 horas" y "1 minutos" son el fallo de siempre al interpolar una cifra en una frase.
    expect(duracion(60)).toBe("1 hora");
    expect(duracion(120)).not.toMatch(/\bhora\b/);
    expect(duracion(1)).toBe("1 minuto");
    expect(duracion(2)).toBe("2 minutos");
  });
});

describe("nunca redondea", () => {
  it("89 minutos no son «1 hora y media» ni «1 hora»", () => {
    // Un plazo que se COBRA no se aproxima: "más o menos una hora" hay que defenderlo después.
    const texto = duracion(89);
    expect(texto).toBe("1 h 29 min");
    expect(texto).not.toMatch(/media|aprox|casi|~/i);
  });

  it("y cada minuto distinto da una frase distinta", () => {
    const frases = [58, 59, 60, 61, 62].map((m) => duracion(m));
    expect(new Set(frases).size).toBe(frases.length);
  });
});

describe("una entrada que no es una duración no se adorna", () => {
  it.each([0, -5, 1.5, Number.NaN])("%s se devuelve en crudo, sin inventar nada", (min) => {
    // Feo a propósito: un texto raro en pantalla se arregla; un "1 hora" sobre un valor inválido se
    // queda para siempre diciendo algo que no es.
    expect(duracion(min)).toBe(`${min} minutos`);
  });
});

describe("el panel dice lo mismo que el diccionario", () => {
  it("de 1 a 400 minutos, y en crudo", () => {
    // El panel no se traduce y no pasa por el diccionario: si su castellano se separa del de la app,
    // el admin lee una duración y la persona otra.
    for (const min of [...Array.from({ length: 400 }, (_, i) => i + 1), 0, -5, 1.5, Number.NaN]) {
      expect(duracionBoostHumana(min, PALABRAS_PANEL), String(min)).toBe(duracion(min));
    }
  });
});
