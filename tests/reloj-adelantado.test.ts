/**
 * EL JOB DEL RELOJ ADELANTADO MIRA DE VERDAD (Fase 11 · PT).
 *
 * `scripts/ci-tests-reloj-adelantado.sh` corre la suite entera con el reloj de Node adelantado (CI:
 * +400 días) para que una prueba que depende del día real en que corre falle HOY y no el día que el
 * calendario pase sus fechas fijas (así cayó `empresa-retos` el 2026-11-15, en todas las ramas).
 *
 * Ese job solo vale si el adelanto llega hasta DONDE corren los tests: los workers de vitest son
 * procesos aparte. El script ya lo comprueba en su propio Node; esto lo comprueba dentro de un worker,
 * contra una hora que el adelanto no puede tocar: la del último commit, que es un dato guardado.
 *
 * Sin la variable (la suite normal), no hay nada que comprobar y el caso se salta.
 */
import { execSync } from "node:child_process";

import { describe, expect, it } from "vitest";

const DIAS = process.env["TEST_RELOJ_ADELANTADO_DIAS"];
const DIA_MS = 24 * 60 * 60 * 1000;

describe.skipIf(!DIAS)("con el reloj adelantado", () => {
  it("este worker ve el futuro: al menos los días pedidos por delante del último commit", () => {
    const commitMs =
      Number(execSync("git log -1 --format=%ct", { encoding: "utf8" }).trim()) * 1000;
    expect(Number.isFinite(commitMs) && commitMs > 0, "no se pudo leer la hora del commit").toBe(
      true,
    );
    const adelanto = (Date.now() - commitMs) / DIA_MS;
    expect(
      adelanto,
      `el worker ve +${adelanto.toFixed(1)} días, se pidieron +${DIAS}`,
    ).toBeGreaterThanOrEqual(Number(DIAS) - 1);
  });
});
