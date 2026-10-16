/**
 * LA SEMANA ISO — la clave del regalo semanal del VIP (Fase 8 · P5).
 *
 * ┌─ POR QUÉ ESTO MERECE UN FICHERO PROPIO ────────────────────────────────────────────────────┐
 * │ Porque "la semana del año" escrita a ojo funciona once meses y se rompe en el borde de año, │
 * │ que es exactamente donde nadie mira. La regla ISO es: la semana empieza el LUNES y la       │
 * │ semana 1 es la que contiene el primer JUEVES del año. De ahí salen dos cosas que una        │
 * │ implementación ingenua hace mal:                                                             │
 * │   - el 1 de enero puede pertenecer a la semana 52 o 53 del año ANTERIOR;                     │
 * │   - el 29, 30 o 31 de diciembre pueden pertenecer a la semana 1 del año SIGUIENTE.           │
 * │ Si la clave llevara el año de la FECHA en vez del año de la SEMANA, esas dos semanas        │
 * │ compartirían clave y alguien se quedaría sin su boost — una vez al año y sin que falle nada.│
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Para romperlo a propósito: usar `getUTCFullYear()` de la fecha en vez del del jueves (rojo en
 * los bordes de año), o empezar la semana en domingo (rojo en los lunes/domingos de abajo).
 */
import { describe, expect, it } from "vitest";

import { semanaIso } from "../src/lib/periodo";

const en = (iso: string): string => semanaIso(new Date(iso));

describe("casos de calendario comprobables", () => {
  /**
   * Fechas con su semana ISO conocida. No salen de ejecutar la función: son casos de los que el
   * calendario ISO ya tiene respuesta, y por eso sirven de referencia independiente.
   */
  const CASOS: [string, string][] = [
    // 2026 empieza en JUEVES, así que el 1 de enero ya es la semana 1 de 2026.
    ["2026-01-01T00:00:00Z", "2026-W01"],
    ["2026-01-04T23:59:59Z", "2026-W01"], // domingo: último día de la W01
    ["2026-01-05T00:00:00Z", "2026-W02"], // lunes: empieza la W02
    // 2027 empieza en VIERNES: el 1 de enero cae en la última semana de 2026.
    ["2027-01-01T12:00:00Z", "2026-W53"],
    ["2027-01-03T12:00:00Z", "2026-W53"], // domingo, todavía 2026
    ["2027-01-04T12:00:00Z", "2027-W01"], // lunes: ya es 2027
    // 2024 empieza en LUNES: caso limpio.
    ["2024-01-01T00:00:00Z", "2024-W01"],
    // Y el otro borde: diciembre que ya pertenece al año siguiente.
    ["2024-12-30T12:00:00Z", "2025-W01"],
    ["2024-12-29T12:00:00Z", "2024-W52"], // domingo anterior: todavía 2024
    // 2021 empezó en viernes: el 1 de enero es la W53 de 2020.
    ["2021-01-01T12:00:00Z", "2020-W53"],
  ];

  for (const [fecha, esperada] of CASOS) {
    it(`${fecha} -> ${esperada}`, () => {
      expect(en(fecha)).toBe(esperada);
    });
  }
});

describe("las propiedades de la semana", () => {
  it("la semana va de LUNES 00:00 a DOMINGO 23:59, y los dos extremos comparten clave", () => {
    const lunes = en("2026-06-15T00:00:00Z");
    const domingo = en("2026-06-21T23:59:59.999Z");
    expect(lunes).toBe(domingo);
    // Y el lunes siguiente ya es otra.
    expect(en("2026-06-22T00:00:00Z")).not.toBe(lunes);
  });

  it("todos los instantes de un mismo día dan la misma semana", () => {
    // El cálculo normaliza a mediodía UTC: a las 00:00 un redondeo puede caer en el día anterior,
    // y aquí un día de diferencia es una semana distinta.
    const dia = ["T00:00:00.000Z", "T00:00:00.001Z", "T12:00:00Z", "T23:59:59.999Z"];
    const claves = new Set(dia.map((h) => en(`2026-01-04${h}`)));
    expect([...claves]).toHaveLength(1);
  });

  it("el formato es `AAAA-Www` con la semana a dos cifras", () => {
    // Importa porque la clave se ordena y se compara como texto: `2026-W9` se ordenaría mal.
    expect(en("2026-03-02T12:00:00Z")).toMatch(/^\d{4}-W\d{2}$/);
    expect(en("2026-01-05T12:00:00Z")).toBe("2026-W02");
  });

  it("un año entero da 52 o 53 semanas distintas, nunca más", () => {
    // Si el cálculo se desbordara (una W54, o dos claves para el mismo lunes), saldría aquí.
    const claves = new Set<string>();
    for (let d = 0; d < 365; d += 1) {
      claves.add(semanaIso(new Date(Date.UTC(2026, 0, 1 + d, 12))));
    }
    expect(claves.size).toBeGreaterThanOrEqual(52);
    expect(claves.size).toBeLessThanOrEqual(54); // 365 días cruzan dos años ISO
    expect([...claves].every((c) => /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/.test(c))).toBe(true);
  });

  it("y avanza SIEMPRE hacia delante: semana a semana, nunca repite ni retrocede", () => {
    // Recorre dos años enteros de lunes en lunes y comprueba que cada clave es nueva. Esto es lo
    // que caza un borde de año que devuelve la clave del año anterior.
    const vistas: string[] = [];
    for (let s = 0; s < 104; s += 1) {
      vistas.push(semanaIso(new Date(Date.UTC(2026, 0, 5 + s * 7, 12))));
    }
    expect(new Set(vistas).size, "dos semanas distintas comparten clave").toBe(vistas.length);
  });
});
