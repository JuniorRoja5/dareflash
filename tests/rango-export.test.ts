/**
 * EL RANGO DE UNA EXPORTACIÓN — lógica PURA, sin BD.
 *
 * Es el trozo donde se esconden los errores de un día: el `hasta` que no incluye su propio día, la
 * fecha que no existe y que `Date` "corrige" sola, y el preset que cada pantalla interpreta a su
 * manera. Por eso vive en `lib` y se prueba aquí, aparte de las dos rutas que lo usan.
 */
import { describe, expect, it } from "vitest";

import {
  diaUtc,
  ETIQUETA_PRESET,
  motivoLegible,
  PRESETS_EXPORT,
  rangoDePreset,
  resolverRango,
} from "../src/lib/rango-export";

const AHORA = new Date("2026-06-15T10:30:00Z");

describe("los presets", () => {
  it("son ventanas relativas a AHORA, hacia atrás", () => {
    expect(rangoDePreset("mes", AHORA)).toEqual({
      desde: new Date("2026-05-15T10:30:00Z"),
      hasta: AHORA,
    });
    expect(rangoDePreset("3meses", AHORA).desde).toEqual(new Date("2026-03-15T10:30:00Z"));
    expect(rangoDePreset("ano", AHORA).desde).toEqual(new Date("2025-06-15T10:30:00Z"));
  });

  it("cada uno tiene su etiqueta: botón y aviso dicen lo mismo", () => {
    // Si una faltara, la pantalla pintaría `undefined` en el chip y "descargadas 3 filas
    // (undefined)" en el aviso. Barato de comprobar, feo de ver en producción.
    for (const p of PRESETS_EXPORT) {
      expect(ETIQUETA_PRESET[p], p).toBeTruthy();
    }
  });

  it("y un preset no mira `desde`/`hasta` aunque lleguen", () => {
    // El preset es una promesa de la pantalla, no un parámetro: si mirara las fechas, cualquiera
    // podría mandar un rango arbitrario disfrazado de "último mes" y la traza mentiría.
    const r = resolverRango({ preset: "mes", desde: "1990-01-01", hasta: "1990-01-02" }, AHORA);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.rango.desde).toEqual(new Date("2026-05-15T10:30:00Z"));
  });
});

describe("el rango a mano", () => {
  it("INCLUYE el día de `hasta` (por dentro el fin es exclusivo)", () => {
    const r = resolverRango({ preset: "custom", desde: "2026-03-01", hasta: "2026-03-31" }, AHORA);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rango.desde).toEqual(new Date("2026-03-01T00:00:00Z"));
    // 1 de abril a las 00:00: así el 31 de marzo entero entra. Con el 31 a las 00:00, exportar
    // "del 1 al 31" se dejaría fuera todo el día 31.
    expect(r.rango.hasta).toEqual(new Date("2026-04-01T00:00:00Z"));
  });

  it("un solo día es un rango válido de 24 h", () => {
    const r = resolverRango({ preset: "custom", desde: "2026-03-10", hasta: "2026-03-10" }, AHORA);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.rango.hasta.getTime() - r.rango.desde.getTime()).toBe(86_400_000);
    }
  });

  it("al revés se rechaza, y el motivo lo dice", () => {
    const r = resolverRango({ preset: "custom", desde: "2026-03-31", hasta: "2026-03-01" }, AHORA);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.motivo).toBe("ORDEN_INVERTIDO");
      expect(motivoLegible(r.motivo)).toMatch(/posterior/i);
    }
  });

  it("sin las dos fechas, tampoco", () => {
    for (const entrada of [
      { preset: "custom" as const },
      { preset: "custom" as const, desde: "2026-03-01" },
      { preset: "custom" as const, hasta: "2026-03-01" },
      { preset: "custom" as const, desde: "", hasta: "" },
    ]) {
      const r = resolverRango(entrada, AHORA);
      expect(r.ok, JSON.stringify(entrada)).toBe(false);
    }
  });
});

describe("`diaUtc` no deja pasar una fecha que no existe", () => {
  it("el 31 de febrero NO es el 3 de marzo: es `null`", () => {
    // `new Date("2026-02-31")` no lanza, "corrige" al 3 de marzo y devuelve un rango que nadie
    // pidió. Comparar la fecha reconstruida con la escrita es la única forma de pillarlo.
    expect(diaUtc("2026-02-31")).toBeNull();
    expect(diaUtc("2026-13-01")).toBeNull();
    expect(diaUtc("2025-02-29")).toBeNull(); // 2025 no es bisiesto
  });

  it("y el 29 de febrero de un bisiesto SÍ existe", () => {
    expect(diaUtc("2028-02-29")).toEqual(new Date("2028-02-29T00:00:00Z"));
  });

  it("la forma también importa: nada de texto libre ni horas", () => {
    for (const malo of ["", "ayer", "2026-3-1", "2026/03/01", "2026-03-01T10:00:00Z", "  "]) {
      expect(diaUtc(malo), malo).toBeNull();
    }
  });

  it("pero los espacios alrededor sí se perdonan", () => {
    expect(diaUtc(" 2026-03-01 ")).toEqual(new Date("2026-03-01T00:00:00Z"));
  });

  it("es UTC, no la zona de quien ejecuta", () => {
    // Si usara la zona local, el mismo CSV exportado desde Madrid y desde Bogotá traería días
    // distintos — y nadie sabría cuál de los dos está mal.
    const d = diaUtc("2026-03-01");
    expect(d?.getUTCHours()).toBe(0);
    expect(d?.toISOString()).toBe("2026-03-01T00:00:00.000Z");
  });
});
