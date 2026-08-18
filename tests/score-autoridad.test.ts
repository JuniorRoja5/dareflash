/**
 * SCORE DE AUTORIDAD (punto único de cálculo del ranking de búsqueda) — funciones PURAS con DIENTES:
 * deterministas, y las intuiciones de orden que la búsqueda promete (más vídeos -> más; actividad
 * reciente suma; un reto ACTIVO por encima de uno cerrado aunque el cerrado tenga más premio; entre
 * activos, deadline más próximo -> más).
 */
import { describe, expect, it } from "vitest";

import {
  calcularScoreAutoridadReto,
  calcularScoreAutoridadUsuario,
} from "../src/server/services/score-autoridad";

const NOW = new Date("2026-01-15T00:00:00.000Z");
const dia = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

describe("calcularScoreAutoridadUsuario", () => {
  it("determinista: misma entrada -> misma salida", () => {
    const s = { videosPublicados: 3, ultimaActividad: dia(5), now: NOW };
    expect(calcularScoreAutoridadUsuario(s)).toBe(calcularScoreAutoridadUsuario(s));
  });

  it("más vídeos publicados -> más score", () => {
    const base = { ultimaActividad: null, now: NOW };
    expect(calcularScoreAutoridadUsuario({ ...base, videosPublicados: 5 })).toBeGreaterThan(
      calcularScoreAutoridadUsuario({ ...base, videosPublicados: 1 }),
    );
  });

  it("actividad RECIENTE suma sobre actividad antigua (o ninguna)", () => {
    const reciente = calcularScoreAutoridadUsuario({
      videosPublicados: 0,
      ultimaActividad: dia(2),
      now: NOW,
    });
    const antigua = calcularScoreAutoridadUsuario({
      videosPublicados: 0,
      ultimaActividad: dia(300),
      now: NOW,
    });
    expect(reciente).toBeGreaterThan(antigua);
    expect(antigua).toBe(
      calcularScoreAutoridadUsuario({ videosPublicados: 0, ultimaActividad: null, now: NOW }),
    );
  });
});

describe("calcularScoreAutoridadReto", () => {
  const activo = (premioCentimos: number, deadline: Date) =>
    calcularScoreAutoridadReto({ premioCentimos, deadline, status: "PUBLISHED", now: NOW });

  it("determinista", () => {
    const s = { premioCentimos: 5000, deadline: dia(-10), status: "PUBLISHED", now: NOW };
    expect(calcularScoreAutoridadReto(s)).toBe(calcularScoreAutoridadReto(s));
  });

  it("un reto ACTIVO va por encima de uno CERRADO, aunque el cerrado tenga MÁS premio", () => {
    const retoActivo = activo(0, dia(-15)); // deadline futuro, sin premio
    const cerrado = calcularScoreAutoridadReto({
      premioCentimos: 10_000_000,
      deadline: dia(30),
      status: "CLOSED",
      now: NOW,
    });
    expect(retoActivo).toBeGreaterThan(cerrado);
  });

  it("entre ACTIVOS, deadline más próximo -> más score", () => {
    expect(activo(0, dia(-1))).toBeGreaterThan(activo(0, dia(-120))); // -1 día = mañana; -120 = lejano
  });
});
