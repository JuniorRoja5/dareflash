/**
 * La parte PURA de la serie diaria: qué días forman la ventana (UTC) y cómo se cruzan con lo que da la
 * BD. Para romperla a propósito: cortar por hora local en vez de UTC (rojo en los bordes de día), o
 * dejar fuera el último día (rojo).
 */
import { describe, expect, it } from "vitest";

import { diasUtcEntre, diaUtc, rellenarSerie } from "../src/lib/serie-diaria";

const d = (iso: string) => new Date(iso);

describe("diasUtcEntre", () => {
  it("incluye los dos extremos, en orden", () => {
    expect(diasUtcEntre(d("2026-03-01T10:00:00Z"), d("2026-03-03T08:00:00Z"))).toEqual([
      "2026-03-01",
      "2026-03-02",
      "2026-03-03",
    ]);
  });

  it("corta por día UTC: las 23:59 y las 00:00 siguientes son días distintos", () => {
    expect(diasUtcEntre(d("2026-03-01T23:59:00Z"), d("2026-03-02T00:00:00Z"))).toEqual([
      "2026-03-01",
      "2026-03-02",
    ]);
  });

  it("cruza meses y años sin saltar ni repetir días (UTC no tiene cambio de hora)", () => {
    expect(diasUtcEntre(d("2026-12-30T12:00:00Z"), d("2027-01-02T12:00:00Z"))).toEqual([
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
    ]);
    // Los fines de semana de cambio de hora europeo (marzo y octubre): 1 día = 1 día.
    expect(diasUtcEntre(d("2026-03-28T00:00:00Z"), d("2026-03-30T00:00:00Z"))).toHaveLength(3);
    expect(diasUtcEntre(d("2026-10-24T00:00:00Z"), d("2026-10-26T00:00:00Z"))).toHaveLength(3);
  });

  it("una ventana en el mismo día es UN día", () => {
    expect(diasUtcEntre(d("2026-03-01T01:00:00Z"), d("2026-03-01T02:00:00Z"))).toEqual([
      "2026-03-01",
    ]);
  });

  it("si la ventana aún no ha empezado, no hay días", () => {
    expect(diasUtcEntre(d("2026-03-05T00:00:00Z"), d("2026-03-01T00:00:00Z"))).toEqual([]);
  });

  it("diaUtc no depende de la zona de quien lo ejecute", () => {
    expect(diaUtc(d("2026-03-01T23:30:00Z"))).toBe("2026-03-01");
    expect(diaUtc(d("2026-03-02T00:30:00Z"))).toBe("2026-03-02");
  });
});

describe("rellenarSerie", () => {
  it("un día de la ventana sin filas vale 0; uno fuera de la ventana se ignora", () => {
    const serie = rellenarSerie(
      ["2026-03-01", "2026-03-02", "2026-03-03"],
      new Map([
        ["2026-03-01", 2],
        ["2026-02-28", 9], // fuera de la ventana
      ]),
      new Map([["2026-03-03", 5]]),
    );
    expect(serie).toEqual([
      { dia: "2026-03-01", participaciones: 2, votos: 0 },
      { dia: "2026-03-02", participaciones: 0, votos: 0 },
      { dia: "2026-03-03", participaciones: 0, votos: 5 },
    ]);
  });
});
