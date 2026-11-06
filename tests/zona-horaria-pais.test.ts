/**
 * A QUÉ HORA LOCAL EMPIEZA UN DÍA DE CAMPAÑA (Fase 9 · P10) — puro.
 *
 * DIENTES: una empresa de Colombia ve las 19:00 (del día anterior: los días son UTC); una de España,
 * la 1:00 en invierno y las 2:00 en verano; un país con varias zonas dice cuál usa («hora de Ciudad de
 * México»); y un país sin zona conocida no recibe una hora inventada.
 *
 * Para romperlo a propósito: calcular sin la fecha (siempre la misma hora) o con un desfase fijo (rojo
 * el del verano); quitar a México de las capitales (rojo el de varias zonas).
 */
import { describe, expect, it } from "vitest";

import {
  CAPITAL_DE_PAIS_CON_VARIAS_ZONAS,
  ZONA_HORARIA_PAIS,
  fraseInicioDelDia,
  horaLocalDeInicio,
} from "../src/lib/zona-horaria-pais";

const INVIERNO = new Date("2026-11-07T10:00:00.000Z");
const VERANO = new Date("2027-07-07T10:00:00.000Z");

describe("la hora local a la que empieza un día de campaña", () => {
  it("Colombia: las 19:00, en su hora local (no tiene horario de verano)", () => {
    expect(fraseInicioDelDia("CO", INVIERNO)).toBe(
      "Cada día de campaña empieza a las 19:00 en tu hora local.",
    );
    expect(horaLocalDeInicio("CO", VERANO)).toBe("19:00");
  });

  it("España: la 1:00 en invierno y las 2:00 en verano, hora de Madrid (Canarias va una hora menos)", () => {
    expect(fraseInicioDelDia("ES", INVIERNO)).toBe(
      "Cada día de campaña empieza a la 1:00, hora de Madrid.",
    );
    expect(fraseInicioDelDia("ES", VERANO)).toBe(
      "Cada día de campaña empieza a las 2:00, hora de Madrid.",
    );
  });

  it("un país con varias zonas dice cuál usa: la de su capital", () => {
    expect(fraseInicioDelDia("MX", INVIERNO)).toBe(
      "Cada día de campaña empieza a las 18:00, hora de Ciudad de México.",
    );
    expect(fraseInicioDelDia("US", INVIERNO)).toContain("hora de Washington");
  });

  it("las medias horas se respetan (India, +5:30)", () => {
    expect(horaLocalDeInicio("IN", INVIERNO)).toBe("5:30");
  });

  it("un país sin zona conocida no recibe hora; el código da igual en minúsculas", () => {
    expect(fraseInicioDelDia("XX", INVIERNO)).toBeNull();
    expect(horaLocalDeInicio("co", INVIERNO)).toBe("19:00");
  });

  it("la tabla es sana: zonas IANA válidas, y toda capital de varias zonas tiene su zona", () => {
    for (const [pais, zona] of Object.entries(ZONA_HORARIA_PAIS)) {
      expect(() => new Intl.DateTimeFormat("es-ES", { timeZone: zona }), pais).not.toThrow();
    }
    for (const pais of Object.keys(CAPITAL_DE_PAIS_CON_VARIAS_ZONAS)) {
      expect(ZONA_HORARIA_PAIS[pais], pais).toBeDefined();
    }
    expect(Object.keys(ZONA_HORARIA_PAIS).length).toBeGreaterThan(200);
  });
});
